'use strict';

const config = require('../../config/config');
const { openAiFetch } = require('./openaiClient');

const MAX_VOICE_RECORDING_BYTES = 10 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mpga', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  'audio/aac', 'audio/flac', 'audio/webm', 'audio/mp4', 'video/mp4',
]);
const BUILT_IN_VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);

function serviceError(message, code, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function validatedAudio(buffer, contentType, maxBytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw serviceError('Choose a non-empty audio recording.', 'VALIDATION_ERROR');
  if (buffer.length > maxBytes) throw serviceError(`Audio must be ${Math.floor(maxBytes / (1024 * 1024))} MiB or smaller.`, 'VALIDATION_ERROR', 413);
  const mimeType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) throw serviceError('Use MP3, WAV, OGG, AAC, FLAC, WebM, or MP4 audio.', 'VALIDATION_ERROR');
  return mimeType;
}

function fileExtension(mimeType) {
  return ({
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mpga': 'mpga', 'audio/wav': 'wav',
    'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/flac': 'flac',
    'audio/webm': 'webm', 'audio/mp4': 'm4a', 'video/mp4': 'mp4',
  })[mimeType] || 'webm';
}

function formAudioField(form, fieldName, buffer, mimeType, baseName) {
  // Browser MediaRecorder may include a codec suffix; upstream expects the supported base MIME type.
  const audioBlob = new Blob([buffer], { type: mimeType });
  form.append(fieldName, audioBlob, `${baseName}.${fileExtension(mimeType)}`);
}

async function transcribeAudio(buffer, contentType, sourceLang = 'auto') {
  const mimeType = validatedAudio(buffer, contentType, config.audioUploadMaxBytes);
  const form = new FormData();
  form.append('model', config.openai.transcriptionModel);
  if (config.openai.transcriptionModel === 'gpt-4o-transcribe-diarize') {
    form.append('response_format', 'diarized_json');
    form.append('chunking_strategy', 'auto');
  }
  const language = String(sourceLang || 'auto').split('-')[0].toLowerCase();
  if (language !== 'auto' && /^[a-z]{2,3}$/.test(language)) form.append('language', language);
  formAudioField(form, 'file', buffer, mimeType, 'awaz-recording');
  const response = await openAiFetch('/audio/transcriptions', { fetchOptions: { method: 'POST', body: form } });
  const result = await response.json();
  if (typeof result.text !== 'string' || !result.text.trim()) throw serviceError('The speech provider did not return a transcript.', 'AI_PROVIDER_ERROR', 502);
  const segments = Array.isArray(result.segments) ? result.segments.filter((segment) => typeof segment.text === 'string' && segment.text.trim()).map((segment) => ({
    text: segment.text.trim(),
    start: Number.isFinite(Number(segment.start)) ? Number(segment.start) : null,
    end: Number.isFinite(Number(segment.end)) ? Number(segment.end) : null,
    speaker: typeof segment.speaker === 'string' ? segment.speaker.slice(0, 30) : null,
  })) : [];
  return {
    text: result.text.trim().slice(0, 30_000),
    language: typeof result.language === 'string' ? result.language : result.languages?.[0]?.code || language,
    duration: Number.isFinite(Number(result.duration)) ? Number(result.duration) : null,
    segments: segments.slice(0, 500),
    timedSegments: segments.length > 0 && segments.every((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end)),
    model: config.openai.transcriptionModel,
  };
}

async function generateSpeech({ text, voice = 'alloy', customVoiceId, speakerConsentConfirmed, language, speed = 1 }) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4_096) throw serviceError('Speech text must contain 1 to 4,096 characters.', 'VALIDATION_ERROR');
  if (!Number.isFinite(Number(speed)) || Number(speed) < 0.25 || Number(speed) > 4) throw serviceError('Speech speed must be between 0.25 and 4.', 'VALIDATION_ERROR');
  const chosenVoice = customVoiceId ? { id: customVoiceId } : voice;
  if (customVoiceId && (speakerConsentConfirmed !== true || !/^voice_[a-z0-9_-]{1,100}$/i.test(customVoiceId))) {
    throw serviceError('A custom voice requires explicit speaker consent and a valid voice ID.', 'CONSENT_REQUIRED');
  }
  if (!customVoiceId && !BUILT_IN_VOICES.has(voice)) throw serviceError('Choose one of the supported built-in voices.', 'VALIDATION_ERROR');
  const languageHint = typeof language === 'string' ? language.trim().slice(0, 80) : '';
  const response = await openAiFetch('/audio/speech', {
    fetchOptions: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.openai.speechModel,
        input: text.trim(),
        voice: chosenVoice,
        speed: Number(speed),
        response_format: 'mp3',
        ...(languageHint ? { instructions: `Speak the text in ${languageHint}. Read it naturally without adding words.` } : {}),
      }),
    },
  });
  return { audio: Buffer.from(await response.arrayBuffer()), model: config.openai.speechModel };
}

async function getConsentPhrases() {
  const response = await openAiFetch('/audio/consent_phrases', { fetchOptions: { method: 'GET' } });
  const payload = await response.json();
  const source = Array.isArray(payload) ? payload : payload.data || payload.phrases || [];
  return source.map((item) => ({
    language: String(item.language || item.locale || '').slice(0, 20),
    phrase: String(item.phrase || item.text || item.consent_phrase || '').slice(0, 500),
  })).filter((item) => item.language && item.phrase);
}

async function createVoiceConsent(buffer, contentType, { language, name }) {
  const mimeType = validatedAudio(buffer, contentType, MAX_VOICE_RECORDING_BYTES);
  const form = new FormData();
  form.append('name', name);
  form.append('language', language);
  formAudioField(form, 'recording', buffer, mimeType, 'awaz-voice-consent');
  const response = await openAiFetch('/audio/voice_consents', { fetchOptions: { method: 'POST', body: form } });
  const consent = await response.json();
  if (typeof consent.id !== 'string' || !consent.id.startsWith('cons_')) throw serviceError('The provider did not return a voice consent ID.', 'AI_PROVIDER_ERROR', 502);
  return { id: consent.id, language: consent.language || language, name: consent.name || name };
}

async function createCustomVoice(buffer, contentType, { consentId, name }) {
  const mimeType = validatedAudio(buffer, contentType, MAX_VOICE_RECORDING_BYTES);
  const form = new FormData();
  form.append('type', 'audio_sample');
  form.append('name', name);
  form.append('consent', consentId);
  formAudioField(form, 'audio_sample', buffer, mimeType, 'awaz-voice-sample');
  const response = await openAiFetch('/audio/voices', { fetchOptions: { method: 'POST', body: form } });
  const voice = await response.json();
  if (typeof voice.id !== 'string' || !voice.id.startsWith('voice_')) throw serviceError('The provider did not return a custom voice ID.', 'AI_PROVIDER_ERROR', 502);
  return { id: voice.id, name: voice.name || name, type: voice.type || 'audio_sample' };
}

function capabilities() {
  return {
    openAiConfigured: Boolean(config.openai.apiKey),
    transcriptionModel: config.openai.transcriptionModel,
    speechModel: config.openai.speechModel,
    transcription: Boolean(config.openai.apiKey),
    neuralSpeech: Boolean(config.openai.apiKey),
    recordingBasedCustomVoices: 'Requires eligible provider account access and explicit speaker consent.',
    audioStoredByAwaz: false,
  };
}

module.exports = {
  capabilities,
  createCustomVoice,
  createVoiceConsent,
  generateSpeech,
  getConsentPhrases,
  transcribeAudio,
  validatedAudio,
};
