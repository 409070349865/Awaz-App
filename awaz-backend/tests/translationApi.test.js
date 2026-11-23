'use strict';

process.env.NODE_ENV = 'test';
process.env.TRANSLATE_ENGINE = 'libretranslate';
process.env.TRANSLATE_FALLBACKS = 'freegoogle';
process.env.LIBRETRANSLATE_URL = 'https://translator.invalid';
process.env.ALLOWED_ORIGINS = '*';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const translateRouter = require('../server/routes/translate');
const errorHandler = require('../server/middleware/errorHandler');

const nativeFetch = global.fetch;
let server;
let baseUrl;
let providerMode = 'success';
let fallbackMode = 'success';
let providerRequests = 0;

test.before(async () => {
  const app = express();
  app.use(express.json({ limit: '50kb' }));
  app.use('/translate', translateRouter);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  global.fetch = async (url, options) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith('https://translate.googleapis.com/')) {
      if (fallbackMode === 'failure') return { ok: false, status: 503 };
      return { ok: true, json: async () => [[['Fallback']]] };
    }
    if (!requestUrl.startsWith('https://translator.invalid')) return nativeFetch(url, options);
    providerRequests += 1;
    if (providerMode === 'failure') return { ok: false, status: 503, text: async () => 'upstream unavailable' };
    if (providerMode === 'bad-request') return { ok: false, status: 400, text: async () => JSON.stringify({ error: 'Visit https://portal.libretranslate.com to get an API key' }) };
    const payload = JSON.parse(options.body);
    assert.equal(payload.source, 'en');
    assert.equal(payload.target, 'es');
    return { ok: true, text: async () => JSON.stringify({ translatedText: 'Hola' }) };
  };
});

test.after(async () => {
  global.fetch = nativeFetch;
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function post(body) {
  return nativeFetch(`${baseUrl}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('rejects incomplete and malformed translation requests', async (t) => {
  await t.test('missing fields', async () => {
    const response = await post({ text: 'Hello' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'MISSING_FIELDS');
  });
  await t.test('invalid language tag', async () => {
    const response = await post({ text: 'Hello', sourceLang: 'en<script>', targetLang: 'es' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'VALIDATION_ERROR');
  });
  await t.test('oversized text', async () => {
    const response = await post({ text: 'x'.repeat(5001), sourceLang: 'en', targetLang: 'es' });
    assert.equal(response.status, 400);
  });
});

test('returns same language text as an identity translation without a provider request', async () => {
  const before = providerRequests;
  const response = await post({ text: 'Hello', sourceLang: 'en-US', targetLang: 'en-GB' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.translatedText, 'Hello');
  assert.equal(body.engine, 'identity');
  assert.equal(body.stored, false);
  assert.equal(providerRequests, before);
});

test('translates through a provider without saving history by default', async () => {
  providerMode = 'success';
  const response = await post({ text: 'Hello', sourceLang: 'en-US', targetLang: 'es-ES' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.translatedText, 'Hola');
  assert.equal(body.engine, 'libretranslate');
  assert.equal(body.stored, false);
});

test('falls back to FreeGoogle when LibreTranslate requires an API key', async () => {
  providerMode = 'bad-request';
  fallbackMode = 'success';
  const response = await post({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.translatedText, 'Fallback');
  assert.equal(body.engine, 'freegoogle');
  providerMode = 'success';
});

test('reports provider failure rather than returning a fabricated translation', async () => {
  providerMode = 'failure';
  fallbackMode = 'failure';
  const response = await post({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'TRANSLATION_FAILED');
  providerMode = 'success';
  fallbackMode = 'success';
});

test('still returns translations when opt-in cloud history is unavailable', async () => {
  providerMode = 'success';
  const response = await post({ text: 'Hello', sourceLang: 'en', targetLang: 'es', saveHistory: true, deviceId: '12345678-1234-1234-1234-123456789012' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.translatedText, 'Hola');
  assert.equal(body.stored, false);
});
