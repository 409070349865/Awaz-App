import test from 'node:test';
import assert from 'node:assert/strict';
import { addHistory, addMeetingRecap, getGlossary, getHistory, getMeetingRecaps, getSettings, saveGlossary } from '../src/lib/storage.js';
import { prepareGlossaryText } from '../src/lib/glossary.js';

function installBrowserStorage() {
  const originalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = { dispatchEvent: () => true };
  return () => {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  };
}

test('successful translations are saved automatically to local history by default', (t) => {
  const restore = installBrowserStorage();
  t.after(restore);
  const saved = addHistory({
    sourceText: 'Hello', translatedText: 'Hola', sourceLang: 'en', targetLang: 'es', engine: 'test',
  });

  assert.equal(saved, true);
  assert.equal(getHistory().length, 1);
  assert.equal(getHistory()[0].translatedText, 'Hola');
  assert.ok(getHistory()[0].createdAt);
});

test('legacy private and history-off preferences are normalized and still save locally', (t) => {
  const restore = installBrowserStorage();
  t.after(restore);
  const item = { sourceText: 'Hello', translatedText: 'Hola', sourceLang: 'en', targetLang: 'es' };
  localStorage.setItem('awaz.preferences.v2', JSON.stringify({ historyMode: 'off', privateSession: true }));

  assert.equal(getSettings().historyMode, 'local');
  assert.equal(getSettings().privateSession, false);
  assert.equal(addHistory(item), true);
  assert.equal(getHistory().length, 1);
});

test('malformed stored history is handled as an empty list', (t) => {
  const restore = installBrowserStorage();
  t.after(restore);
  localStorage.setItem('awaz.translations.v2', '{broken json');
  assert.deepEqual(getHistory(), []);
});

test('personal glossary and reviewed meeting recaps stay in browser storage', (t) => {
  const restore = installBrowserStorage();
  t.after(restore);
  const terms = [{ id: 'term-1', sourceLang: 'en-US', targetLang: 'hi-IN', sourceTerm: 'Awaz', targetTerm: 'आवाज़' }];
  assert.equal(saveGlossary(terms), true);
  assert.deepEqual(getGlossary(), terms);

  assert.equal(addMeetingRecap({ title: 'Client call', summary: 'Discussed launch timing.', actionItems: 'Send the revised timeline.', roomCode: 'ABCD2345' }), true);
  assert.equal(getMeetingRecaps().length, 1);
  assert.equal(getMeetingRecaps()[0].summary, 'Discussed launch timing.');
});

test('glossary protects exact language-pair terms and restores their preferred translation', () => {
  const entries = [
    { sourceLang: 'en-US', targetLang: 'hi-IN', sourceTerm: 'Acme', targetTerm: 'एक्मे' },
    { sourceLang: 'en-US', targetLang: 'hi-IN', sourceTerm: 'Acme Cloud', targetTerm: 'एक्मे क्लाउड' },
    { sourceLang: 'en-US', targetLang: 'es-ES', sourceTerm: 'Acme', targetTerm: 'Acme ES' },
  ];
  const glossary = prepareGlossaryText('Acme Cloud works with Acme; carpet stays unchanged.', entries, 'en-US', 'hi-IN');

  assert.match(glossary.text, /^AWAZTERM0ZXQ works with AWAZTERM1ZXQ; carpet stays unchanged\.$/);
  assert.equal(glossary.restore(glossary.text), 'एक्मे क्लाउड works with एक्मे; carpet stays unchanged.');
});
