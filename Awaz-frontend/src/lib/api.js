import { getDeviceId, getGlossary, getSessionContext, getSettings } from './storage';
import { prepareGlossaryText } from './glossary';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function openMeetingSocket() {
  const serviceUrl = API_BASE ? new URL(API_BASE, window.location.href) : window.location;
  const protocol = serviceUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${protocol}//${serviceUrl.host}/ws`);
}

export async function getMeetingIceServers() {
  try {
    const data = await request('/meeting/ice');
    if (Array.isArray(data.iceServers) && data.iceServers.length) return data.iceServers;
  } catch { /* Older deployments can still make direct STUN connections. */ }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error('AWAZ cannot reach its translation service. Check your connection and backend URL.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

async function requestAudio(path, audio, params = {}) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  const url = `${API_BASE}${path}${query.size ? `?${query}` : ''}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': (audio.type || 'audio/webm').split(';')[0] },
      body: audio,
    });
  } catch {
    throw new Error('AWAZ cannot reach its AI audio service. Check your connection and backend URL.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Audio request failed (${response.status}).`);
  return data;
}

async function requestAudioBlob(path, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('AWAZ cannot reach its AI speech service. Check your connection and backend URL.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Speech generation failed (${response.status}).`);
  }
  return response.blob();
}

export function translateText(text, sourceLang, targetLang, contextMode = 'general') {
  const settings = getSettings();
  const saveHistory = settings.historyMode === 'cloud' && !settings.privateSession;
  const glossary = prepareGlossaryText(text, getGlossary(), sourceLang, targetLang);
  return request('/translate', {
    method: 'POST',
    body: JSON.stringify({
      text: glossary.text, sourceLang, targetLang, contextMode,
      ...(settings.translationEngine !== 'auto' ? { engine: settings.translationEngine } : {}),
      contextHistory: settings.translationEngine === 'auto' || settings.translationEngine === 'openai' ? getSessionContext() : [],
      saveHistory,
      ...(saveHistory ? { deviceId: getDeviceId() } : {}),
    }),
  }).then((result) => ({ ...result, translatedText: glossary.restore(result.translatedText) }));
}

export function verifyTranslation(sourceText, translatedText, sourceLang, targetLang, backTranslate = false) {
  return request('/ai/verify', { method: 'POST', body: JSON.stringify({ sourceText, translatedText, sourceLang, targetLang, backTranslate }) });
}

export function analyzeCodeSwitch(text, sourceLang, targetLang, sourceLanguageName, targetLanguageName) {
  const settings = getSettings();
  const saveHistory = settings.historyMode === 'cloud' && !settings.privateSession;
  return request('/ai/code-switch', {
    method: 'POST',
    body: JSON.stringify({ text, sourceLang, targetLang, sourceLanguageName, targetLanguageName, saveHistory, ...(saveHistory ? { deviceId: getDeviceId() } : {}) }),
  });
}

export function getAiCapabilities() { return request('/ai/capabilities'); }
export function transcribeAudio(audio, sourceLang = 'auto') {
  return requestAudio('/ai/dub/transcribe', audio, { sourceLang });
}
export function generateDubSpeech(payload) { return requestAudioBlob('/ai/dub/speech', payload); }
export function getVoiceConsentPhrases() { return request('/ai/dub/consent-phrases'); }
export function createVoiceConsent(audio, language, name, speakerConsent) {
  return requestAudio('/ai/dub/voice-consents', audio, { language, name, speakerConsent });
}
export function createCustomVoice(audio, consentId, name, speakerConsent) {
  return requestAudio('/ai/dub/voices', audio, { consentId, name, speakerConsent });
}

export function getCloudHistory() {
  const deviceId = getDeviceId();
  if (!deviceId) throw new Error('Browser storage is unavailable.');
  return request(`/history?deviceId=${encodeURIComponent(deviceId)}&limit=200`);
}

export function deleteCloudHistory(id) {
  const deviceId = getDeviceId();
  if (!deviceId) throw new Error('Browser storage is unavailable.');
  const params = new URLSearchParams({ deviceId });
  if (id) params.set('id', id);
  return request(`/history?${params}`, { method: 'DELETE' });
}

export function getSystemHealth() {
  return request('/health');
}

