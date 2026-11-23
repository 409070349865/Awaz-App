const SETTINGS_KEY = 'awaz.preferences.v2';
const HISTORY_KEY = 'awaz.translations.v2';
const CONTEXT_KEY = 'awaz.session-context.v2';
const DEVICE_KEY = 'awaz.browser-id.v1';
const GLOSSARY_KEY = 'awaz.glossary.v1';
const MEETING_RECAPS_KEY = 'awaz.meeting-recaps.v1';
let contextExpiryTimer = null;
let volatileDeviceId = null;

export const DEFAULT_SETTINGS = {
  historyMode: 'local',
  privateSession: false,
  contextualMemory: false,
  textScale: 1,
  highContrast: false,
  reducedMotion: false,
  contextMode: 'general',
  translationEngine: 'auto',
  voiceSpeed: 1,
};

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createId() {
  const values = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else for (let index = 0; index < values.length; index += 1) values[index] = Math.floor(Math.random() * 256);
  values[6] = (values[6] & 0x0f) | 0x40;
  values[8] = (values[8] & 0x3f) | 0x80;
  const hex = Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getSettings() {
  // History now always stays on this browser. Normalize older preferences so
  // previously disabled, private, or cloud modes cannot hide local activity.
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}), historyMode: 'local', privateSession: false, contextualMemory: false };
}

export function getStoredHistoryMode() {
  const stored = readJson(SETTINGS_KEY, {});
  return stored && typeof stored === 'object' ? stored.historyMode : undefined;
}

export function saveSettings(patch) {
  const settings = { ...getSettings(), ...patch, historyMode: 'local', privateSession: false, contextualMemory: false };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private browsing may disable storage */ }
  window.dispatchEvent(new CustomEvent('awaz:settings', { detail: settings }));
  return settings;
}

export function getHistory() {
  const entries = readJson(HISTORY_KEY, []);
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry && typeof entry === 'object'
    && typeof entry.sourceText === 'string'
    && typeof entry.translatedText === 'string'
    && typeof entry.sourceLang === 'string'
    && typeof entry.targetLang === 'string');
}

export function saveHistory(items) {
  if (!Array.isArray(items)) return false;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 500)));
    try { window.dispatchEvent(new Event('awaz:history')); } catch { /* a saved record remains saved if events are unavailable */ }
    return true;
  } catch { return false; /* storage may be unavailable or full */ }
}

export function addHistory(item) {
  const id = createId();
  const entry = { ...item, id, createdAt: new Date().toISOString() };
  return saveHistory([entry, ...getHistory()]);
}

export function getGlossary() {
  const entries = readJson(GLOSSARY_KEY, []);
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry && typeof entry.id === 'string'
    && typeof entry.sourceLang === 'string' && typeof entry.targetLang === 'string'
    && typeof entry.sourceTerm === 'string' && typeof entry.targetTerm === 'string')
    .slice(0, 100);
}

export function saveGlossary(entries) {
  if (!Array.isArray(entries)) return false;
  const clean = entries.filter((entry) => entry && typeof entry.id === 'string'
    && typeof entry.sourceLang === 'string' && typeof entry.targetLang === 'string'
    && typeof entry.sourceTerm === 'string' && typeof entry.targetTerm === 'string')
    .slice(0, 100);
  try {
    localStorage.setItem(GLOSSARY_KEY, JSON.stringify(clean));
    window.dispatchEvent(new Event('awaz:glossary'));
    return true;
  } catch { return false; }
}

export function getMeetingRecaps() {
  const recaps = readJson(MEETING_RECAPS_KEY, []);
  if (!Array.isArray(recaps)) return [];
  return recaps.filter((recap) => recap && typeof recap.id === 'string'
    && typeof recap.title === 'string' && typeof recap.summary === 'string'
    && typeof recap.actionItems === 'string' && typeof recap.createdAt === 'string')
    .slice(0, 50);
}

export function addMeetingRecap(recap) {
  if (!recap || typeof recap.title !== 'string' || typeof recap.summary !== 'string'
    || typeof recap.actionItems !== 'string') return false;
  const entry = { ...recap, id: createId(), createdAt: new Date().toISOString() };
  try {
    localStorage.setItem(MEETING_RECAPS_KEY, JSON.stringify([entry, ...getMeetingRecaps()].slice(0, 50)));
    window.dispatchEvent(new Event('awaz:meeting-recaps'));
    return true;
  } catch { return false; }
}

export function clearLocalHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* storage may be unavailable */ }
  window.dispatchEvent(new Event('awaz:history'));
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = createId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    volatileDeviceId ||= createId();
    return volatileDeviceId;
  }
}

export function addSessionContext(entry, settings = getSettings()) {
  if (settings.privateSession || !settings.contextualMemory) return;
  const now = Date.now();
  let previous = [];
  try { previous = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || '[]'); } catch { previous = []; }
  const next = [{ source: entry.sourceText, translated: entry.translatedText, createdAt: now, expiresAt: now + 60 * 60 * 1000 },
    ...previous.filter((item) => item.expiresAt > now)].slice(0, 12);
  try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(next)); } catch { /* session storage may be disabled */ }
  scheduleContextExpiry(next);
}

export function clearSessionContext() {
  if (contextExpiryTimer) window.clearTimeout(contextExpiryTimer);
  contextExpiryTimer = null;
  try { sessionStorage.removeItem(CONTEXT_KEY); } catch { /* session storage may be disabled */ }
}

function scheduleContextExpiry(items) {
  if (contextExpiryTimer) window.clearTimeout(contextExpiryTimer);
  const nextExpiry = Math.min(...items.map((item) => item.expiresAt));
  if (!Number.isFinite(nextExpiry)) return;
  contextExpiryTimer = window.setTimeout(() => {
    let current = [];
    try { current = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || '[]'); } catch { current = []; }
    const active = current.filter((item) => item.expiresAt > Date.now());
    try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(active)); } catch { /* session storage may be disabled */ }
    scheduleContextExpiry(active);
  }, Math.max(0, nextExpiry - Date.now()));
}

export function getSessionContext() {
  const settings = getSettings();
  if (!settings.contextualMemory || settings.privateSession) {
    clearSessionContext();
    return [];
  }
  let items = [];
  try { items = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || '[]'); } catch { return []; }
  const active = items.filter((item) => item.expiresAt > Date.now()).slice(0, 6);
  if (active.length !== items.length) {
    try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(active)); } catch { /* storage may be disabled */ }
  }
  scheduleContextExpiry(active);
  return active.map(({ source, translated }) => ({ source, translated }));
}

export function exportHistory(items) {
  const file = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'awaz-translations.json';
  link.click();
  URL.revokeObjectURL(url);
}
