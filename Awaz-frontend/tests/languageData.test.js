import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXTS, LANGUAGES, languageName } from '../src/data/languages.js';

test('language catalog contains unique locale identifiers and display names', () => {
  const codes = LANGUAGES.map(({ code }) => code);
  assert.ok(codes.length >= 20);
  assert.equal(new Set(codes).size, codes.length);
  for (const language of LANGUAGES) {
    assert.match(language.code, /^[a-z]{2,3}-[A-Z]{2}$/);
    assert.ok(language.name.length > 0);
    assert.ok(language.flag.length > 0);
  }
});

test('context options are unique and language labels have a safe fallback', () => {
  const values = CONTEXTS.map(([value]) => value);
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.includes('healthcare'));
  assert.equal(languageName('unknown'), 'unknown');
});
