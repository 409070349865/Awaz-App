/**
 * config.js — Centralised application configuration
 *
 * All environment variables are read here so the rest of the app
 * uses typed config values instead of raw process.env strings.
 *
 * Copy  .env.example → .env  and fill in your keys before running.
 */

'use strict';

require('dotenv').config();

const config = {
  // ── Server ──────────────────────────────────────────────
  port: parseInt(process.env.PORT, 10) || 3000,
  env:  process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/awaz',

  // ── Translation Engine ──────────────────────────────────
  // Options: 'libretranslate' | 'google' | 'deepl'  // Translation Engine
  translateEngine: process.env.TRANSLATE_ENGINE || 'freegoogle',
  fallbackEngines: (process.env.TRANSLATE_FALLBACKS === undefined ? 'freegoogle,libretranslate' : process.env.TRANSLATE_FALLBACKS)
    .split(',').map(value => value.trim()).filter(Boolean),

  // ── LibreTranslate (free, self-hostable) ────────────────
  libreTranslate: {
    url:    process.env.LIBRETRANSLATE_URL    || 'https://libretranslate.com',
    apiKey: process.env.LIBRETRANSLATE_APIKEY || '',   // required by the default public instance
  },

  // ── Google Cloud Translation v2 ─────────────────────────
  google: {
    apiKey: process.env.GOOGLE_TRANSLATE_API_KEY || '',
  },

  // ── DeepL ───────────────────────────────────────────────
  deepl: {
    apiKey: process.env.DEEPL_API_KEY || '',
    // Use 'https://api-free.deepl.com' for free tier
    url:    process.env.DEEPL_API_URL  || 'https://api-free.deepl.com',
  },

  // ── OpenAI ──────────────────────────────────────────────
  openai: {
    apiKey: process.env.OPENAI_API_KEY  || '',
    model:  process.env.OPENAI_MODEL    || 'gpt-4o-mini',
    analysisModel: process.env.OPENAI_ANALYSIS_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    transcriptionModel: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe-diarize',
    speechModel: process.env.OPENAI_SPEECH_MODEL || 'gpt-4o-mini-tts',
  },

  aiRequestTimeoutMs: Math.max(5_000, parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 45_000),
  audioUploadMaxBytes: Math.min(25 * 1024 * 1024, Math.max(1 * 1024 * 1024, parseInt(process.env.AI_AUDIO_MAX_BYTES, 10) || 20 * 1024 * 1024)),

  // Optional coturn REST credentials for WebRTC calls. The shared secret stays on the backend.
  turn: {
    urls: (process.env.TURN_SERVER_URLS || '').split(',').map(value => value.trim()).filter(Boolean),
    sharedSecret: process.env.TURN_SHARED_SECRET || '',
    credentialTtlSeconds: Math.min(86_400, Math.max(60, parseInt(process.env.TURN_CREDENTIAL_TTL_SECONDS, 10) || 3_600)),
  },


  // ── CORS ────────────────────────────────────────────────
  // Set ALLOWED_ORIGINS='https://yourapp.com,https://www.yourapp.com'
  // Leave blank to allow ALL origins (OK for local dev, not prod)
  allowedOrigins: process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS.trim() !== '*'
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : '*',

  // ── Rate Limiting ────────────────────────────────────────
  rateLimit: {
    windowMs:  60_000,                                       // 1 minute
    max:       parseInt(process.env.RATE_LIMIT_MAX, 10) || 60,  // req / window
  },

  // ── Request Timeout ─────────────────────────────────────
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 7_000,

  // ── Logging ─────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
