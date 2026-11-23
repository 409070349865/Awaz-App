/**
 * routes/translate.js — POST /translate
 * ═══════════════════════════════════════
 *
 * Request  (JSON body):
 *   { "text": "Hello", "sourceLang": "en", "targetLang": "es" }
 *
 * Response (JSON):
 *   { "translatedText": "Hola" }
 *   or
 *   { "error": "MISSING_FIELDS", "message": "…" }
 *
 * Notes:
 *   • sourceLang accepts full BCP-47 tags (e.g. 'en-US') — the country
 *     suffix is stripped before forwarding to the translation engine.
 *   • Both source and target are normalised to lowercase ISO 639-1.
 */

'use strict';

const { Router }        = require('express');
const rateLimit         = require('express-rate-limit');
const { translateText } = require('../services/translator');
const { logger }        = require('../utils/logger');
const mongoose          = require('mongoose');
const Translation       = require('../models/Translation');

const router = Router();

// ── Per-route rate limiter (stricter than the global one) ──
// Allows 30 translations per minute per IP.
const translateLimiter = rateLimit({
  windowMs:        60_000,
  max:             30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    error:   'RATE_LIMIT_EXCEEDED',
    message: 'Too many translation requests. Please wait a moment.',
  },
});

router.use(translateLimiter);

/**
 * POST /translate
 */
router.post('/', async (req, res, next) => {
  const { text, sourceLang, targetLang, contextMode = 'general', engine, contextHistory = [], saveHistory = false, deviceId } = req.body ?? {};

  // ── Validate ──────────────────────────────────────────────
  if (!text || !sourceLang || !targetLang) {
    return res.status(400).json({
      error:   'MISSING_FIELDS',
      message: 'Request body must include: text, sourceLang, targetLang.',
    });
  }

  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: '"text" must be a non-empty string.',
    });
  }

  if (text.length > 5_000) {
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: '"text" must be 5,000 characters or fewer.',
    });
  }

  if (typeof sourceLang !== 'string' || typeof targetLang !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i.test(sourceLang) || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i.test(targetLang)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Language codes must be valid ISO or BCP-47 tags.' });
  }
  if (!['general', 'casual', 'professional', 'business', 'travel', 'academic', 'healthcare', 'friendly', 'polite', 'formal', 'emotional', 'slang'].includes(contextMode)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unsupported context mode.' });
  }
  if (!Array.isArray(contextHistory) || contextHistory.length > 6 || contextHistory.some((turn) => !turn || typeof turn.source !== 'string' || typeof turn.translated !== 'string' || turn.source.length > 1_000 || turn.translated.length > 1_000)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Conversation context must contain at most six short turns.' });
  }
  if (engine !== undefined && !['libretranslate', 'freegoogle', 'google', 'deepl', 'openai'].includes(engine)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unsupported translation engine.' });
  }
  if (typeof saveHistory !== 'boolean') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'saveHistory must be a boolean.' });
  }
  const validHistoryDevice = /^[a-f0-9-]{36}$/i.test(deviceId || '');

  // ── Normalise language codes ──────────────────────────────
  // 'en-US' → 'en',  'ZH-CN' → 'zh'
  const src = sourceLang.split('-')[0].toLowerCase();
  const tgt = targetLang.split('-')[0].toLowerCase();

  // ── Translate ─────────────────────────────────────────────
  try {
    const result = src === tgt
      ? { translatedText: text.trim(), engine: 'identity', latencyMs: 0, contextApplied: false }
      : await translateText(text.trim(), src, tgt, { contextMode, engine, contextHistory });
    const { translatedText, latencyMs } = result;
    
    // Save to DB asynchronously
    let stored = false;
    if (saveHistory && validHistoryDevice && mongoose.connection.readyState === 1) {
      try {
        await Translation.create({
          deviceId,
          sourceText: text.trim(),
          translatedText,
          sourceLang: src,
          targetLang: tgt,
          engine: result.engine,
          latencyMs,
        });
        stored = true;
      } catch (storageError) {
        logger.error('[DB] Could not save opted-in cloud history:', storageError.message);
      }
    }

    return res.json({ translatedText, engine: result.engine, latencyMs, contextApplied: result.contextApplied, stored });
  } catch (err) {
    // Forward to the global error handler
    next(err);
  }
});

module.exports = router;
