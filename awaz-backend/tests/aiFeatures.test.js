'use strict';

process.env.NODE_ENV = 'test';
process.env.TRANSLATE_ENGINE = 'freegoogle';
process.env.TRANSLATE_FALLBACKS = 'freegoogle';
process.env.ALLOWED_ORIGINS = '*';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const config = require('../server/config/config');
const aiRouter = require('../server/routes/aiFeatures');
const errorHandler = require('../server/middleware/errorHandler');
const { compareCriticalTokens, extractCriticalTokens } = require('../server/services/aiFeatures/verification');
const { scriptSegments } = require('../server/services/aiFeatures/codeSwitch');

const nativeFetch = global.fetch;
let server;
let baseUrl;
let aiMode = 'verify';

test.before(async () => {
  const app = express();
  app.use(express.json({ limit: '50kb' }));
  app.use('/ai', aiRouter);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  global.fetch = async (url, options = {}) => {
    const address = String(url);
    global.providerAddresses ||= [];
    global.providerAddresses.push(address);
    if (!address.startsWith('https://api.openai.com/v1/')) return nativeFetch(url, options);
    if (address.endsWith('/audio/transcriptions')) {
      global.lastTranscriptionPayload = options.body;
      return new Response(JSON.stringify({
        text: 'Hello there.', duration: 2.4,
        segments: [{ start: 0.1, end: 2.1, text: 'Hello there.', speaker: 'A' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (address.endsWith('/audio/speech')) {
      global.lastSpeechPayload = JSON.parse(options.body);
      return new Response(new Uint8Array([73, 68, 51, 1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
    }
    if (address.endsWith('/audio/consent_phrases')) {
      return new Response(JSON.stringify({ data: [{ language: 'en', phrase: 'I own this voice and consent.' }] }), { status: 200 });
    }
    if (address.endsWith('/audio/voice_consents')) {
      global.lastConsentPayload = options.body;
      return new Response(JSON.stringify({ id: 'cons_test123', language: 'en', name: 'AWAZ voice consent' }), { status: 200 });
    }
    if (address.endsWith('/audio/voices')) {
      global.lastVoicePayload = options.body;
      return new Response(JSON.stringify({ id: 'voice_test123', name: 'AWAZ voice', type: 'audio_sample' }), { status: 200 });
    }
    if (aiMode === 'failure') return new Response('unavailable', { status: 503 });
    if (aiMode === 'unauthorized') return new Response(JSON.stringify({ error: { code: 'invalid_api_key' } }), { status: 401 });
    const payload = JSON.parse(options.body);
    assert.equal(payload.response_format.type, 'json_object');
    let result;
    if (aiMode === 'code-switch') {
      result = {
        mixedLanguage: true,
        translatedText: 'Hello friend',
        summary: 'Hindi and English are mixed.',
        segments: [
          { text: 'नमस्ते ', language: 'hi', languageName: 'Hindi', script: 'Devanagari', transliteration: 'namaste', translation: 'hello' },
          { text: 'friend', language: 'en', languageName: 'English', script: 'Latin', translation: 'friend' },
        ],
      };
    } else {
      result = {
        confidenceScore: 41,
        summary: 'The translation reverses the source negation.',
        issues: [{ type: 'Negation', severity: 'high', source: 'do not agree', translation: 'agree', message: 'The translation drops the negation.' }],
        suggestedTranslation: 'I do not agree.',
      };
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});

test.after(async () => {
  global.fetch = nativeFetch;
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function postJson(path, body) {
  return nativeFetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function postAudio(path, query = '') {
  return nativeFetch(`${baseUrl}${path}${query}`, { method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus' }, body: new Uint8Array([1, 2, 3, 4]) });
}

test('critical checks report changed quantities, dates, and currency markers', () => {
  const tokens = extractCriticalTokens('Pay ₹1,200 on 2026-11-23, not $50.');
  assert.deepEqual(tokens.quantities, ['₹1200', '$50']);
  assert.deepEqual(tokens.dates, ['2026-11-23']);
  assert.deepEqual(tokens.currencies, ['₹', '$']);
  assert.ok(compareCriticalTokens('Take 2 tablets', 'Take 3 tablets').some((issue) => issue.type === 'Number or unit'));
});

test('semantic verification flags changed meaning without a VERIFIED status', async () => {
  config.openai.apiKey = 'test-key';
  aiMode = 'verify';
  const response = await postJson('/ai/verify', { sourceText: 'I do not agree to pay $50.', translatedText: 'I agree to pay $70.', sourceLang: 'en', targetLang: 'es' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'REVIEW_RECOMMENDED');
  assert.equal(body.confidenceScore, 41);
  assert.ok(body.issues.some((issue) => issue.type === 'Number or unit'));
  assert.ok(body.issues.some((issue) => issue.type === 'Negation'));
  assert.notEqual(body.status, 'VERIFIED');
});

test('verification retains deterministic warnings when the optional AI key is absent', async () => {
  config.openai.apiKey = '';
  const response = await postJson('/ai/verify', { sourceText: 'Take 2 tablets.', translatedText: 'Take 3 tablets.', sourceLang: 'en', targetLang: 'hi' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.semanticAvailable, false);
  assert.equal(body.confidenceScore, null);
  assert.equal(body.status, 'REVIEW_RECOMMENDED');
});

test('AI provider errors make verification inconclusive instead of failing the base service', async () => {
  config.openai.apiKey = 'test-key';
  aiMode = 'failure';
  const response = await postJson('/ai/verify', { sourceText: 'Hello.', translatedText: 'Hola.', sourceLang: 'en', targetLang: 'es' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, 'INCONCLUSIVE');
  assert.equal(body.semanticAvailable, false);
});

test('invalid provider credentials are explained without exposing provider response details', async () => {
  config.openai.apiKey = 'test-key';
  aiMode = 'unauthorized';
  const response = await postJson('/ai/verify', { sourceText: 'Hello.', translatedText: 'Hola.', sourceLang: 'en', targetLang: 'es' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.warnings.some((warning) => warning.includes('OPENAI_API_KEY')));
  assert.ok(body.warnings.every((warning) => !warning.includes('invalid_api_key')));
});

test('script fallback groups native scripts while leaving language uncertain', () => {
  const segments = scriptSegments('नमस्ते hello!');
  assert.equal(segments.length, 2);
  assert.equal(segments[0].script, 'Devanagari');
  assert.equal(segments[0].language, 'und');
  assert.equal(segments[1].script, 'Latin');
});

test('code-switch API returns word-level language and transliteration results', async () => {
  config.openai.apiKey = 'test-key';
  aiMode = 'code-switch';
  const response = await postJson('/ai/code-switch', { text: 'नमस्ते friend', sourceLang: 'hi-IN', targetLang: 'en-US' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.analysisAvailable, true);
  assert.equal(body.segments[0].transliteration, 'namaste');
  assert.equal(body.translatedText, 'Hello friend');
});

test('code-switch same-language fallback works with no AI key or translation-provider call', async () => {
  config.openai.apiKey = '';
  const response = await postJson('/ai/code-switch', { text: 'नमस्ते hello', sourceLang: 'hi-IN', targetLang: 'hi-IN' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.analysisAvailable, false);
  assert.equal(body.translatedText, 'नमस्ते hello');
  assert.equal(body.mixedLanguage, true);
});

test('audio transcription returns timed segments and respects browser codec MIME', async () => {
  config.openai.apiKey = 'test-key';
  aiMode = 'verify';
  const response = await postAudio('/ai/dub/transcribe', '?sourceLang=en-US');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.timedSegments, true);
  assert.equal(body.segments[0].speaker, 'A');
});

test('speech route returns generated audio with an AI disclosure header', async () => {
  config.openai.apiKey = 'test-key';
  const response = await postJson('/ai/dub/speech', { text: 'Hola', voice: 'alloy', language: 'Spanish', speed: 1 });
  assert.equal(response.status, 200, JSON.stringify(global.providerAddresses));
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('x-awaz-ai-generated'), 'true');
  assert.equal((await response.arrayBuffer()).byteLength, 6);
});

test('custom voice creation requires explicit speaker consent', async () => {
  const response = await postAudio('/ai/dub/voice-consents', '?language=en&name=My%20voice');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'CONSENT_REQUIRED');
});

test('voice consent and sample use the provider consent record before returning a custom voice', async () => {
  config.openai.apiKey = 'test-key';
  const consent = await postAudio('/ai/dub/voice-consents', '?language=en&name=My%20voice&speakerConsent=true');
  assert.equal(consent.status, 200);
  const consentBody = await consent.json();
  const voice = await postAudio('/ai/dub/voices', `?consentId=${consentBody.id}&name=My%20voice&speakerConsent=true`);
  assert.equal(voice.status, 200);
  assert.equal((await voice.json()).id, 'voice_test123');
});
