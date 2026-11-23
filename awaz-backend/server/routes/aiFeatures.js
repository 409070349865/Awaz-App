'use strict';

const { Router, raw } = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const config = require('../config/config');
const Translation = require('../models/Translation');
const { verifyTranslation } = require('../services/aiFeatures/verification');
const { analyzeCodeSwitch } = require('../services/aiFeatures/codeSwitch');
const dubbing = require('../services/aiFeatures/dubbing');

const router = Router();
const LANGUAGE_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;
const AUDIO_TYPES = ['audio/*', 'video/mp4'];
router.use(rateLimit({ windowMs: 60_000, max: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many optional AI requests. Wait a moment and retry.' },
}));

router.get('/capabilities', (req, res) => res.json(dubbing.capabilities()));

router.post('/verify', async (req, res, next) => {
  const { sourceText, translatedText, sourceLang, targetLang, backTranslate = false } = req.body ?? {};
  if (typeof sourceText !== 'string' || typeof translatedText !== 'string' || !sourceText.trim() || !translatedText.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Source and translated text are required.' });
  }
  if (sourceText.length > 5_000 || translatedText.length > 5_000 || !LANGUAGE_RE.test(sourceLang || '') || !LANGUAGE_RE.test(targetLang || '') || typeof backTranslate !== 'boolean') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Text, language pair, or back-translation option is invalid.' });
  }
  try { return res.json(await verifyTranslation({ sourceText, translatedText, sourceLang, targetLang, backTranslate })); }
  catch (error) { return next(error); }
});

router.post('/code-switch', async (req, res, next) => {
  const { text, sourceLang, targetLang, sourceLanguageName, targetLanguageName, saveHistory = false, deviceId } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 5_000 || !LANGUAGE_RE.test(sourceLang || '') || !LANGUAGE_RE.test(targetLang || '') || typeof saveHistory !== 'boolean') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Text and a valid source/target language pair are required (maximum 5,000 characters).' });
  }
  try {
    const startedAt = Date.now();
    const result = await analyzeCodeSwitch({ text: text.trim(), sourceLang, targetLang, sourceLanguageName, targetLanguageName });
    let stored = false;
    if (saveHistory && /^[a-f0-9-]{36}$/i.test(deviceId || '') && mongoose.connection.readyState === 1) {
      try {
        await Translation.create({ deviceId, sourceText: text.trim(), translatedText: result.translatedText,
          sourceLang: sourceLang.split('-')[0].toLowerCase(), targetLang: targetLang.split('-')[0].toLowerCase(),
          engine: result.translationEngine, latencyMs: Date.now() - startedAt });
        stored = true;
      } catch { /* Optional cloud history failure does not fail this translation. */ }
    }
    return res.json({ ...result, engine: result.translationEngine, latencyMs: Date.now() - startedAt, stored });
  } catch (error) { return next(error); }
});

router.post('/dub/transcribe', raw({ type: AUDIO_TYPES, limit: config.audioUploadMaxBytes }), async (req, res, next) => {
  const sourceLang = String(req.query.sourceLang || 'auto');
  if (sourceLang !== 'auto' && !LANGUAGE_RE.test(sourceLang)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Choose a supported source language or auto-detect.' });
  try { return res.json(await dubbing.transcribeAudio(req.body, req.get('content-type'), sourceLang)); }
  catch (error) { return next(error); }
});

router.post('/dub/speech', async (req, res, next) => {
  const { text, voice, customVoiceId, speakerConsentConfirmed, language, speed } = req.body ?? {};
  try {
    const result = await dubbing.generateSpeech({ text, voice, customVoiceId, speakerConsentConfirmed, language, speed });
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Disposition', 'inline; filename="awaz-ai-speech.mp3"');
    res.set('Cache-Control', 'no-store');
    res.set('X-AWAZ-AI-Generated', 'true');
    return res.send(result.audio);
  } catch (error) { return next(error); }
});

router.get('/dub/consent-phrases', async (req, res, next) => {
  try { return res.json({ phrases: await dubbing.getConsentPhrases() }); }
  catch (error) { return next(error); }
});

router.post('/dub/voice-consents', raw({ type: AUDIO_TYPES, limit: 10 * 1024 * 1024 }), async (req, res, next) => {
  const language = String(req.query.language || '');
  const name = String(req.query.name || 'AWAZ voice consent').trim().slice(0, 50);
  if (req.query.speakerConsent !== 'true') return res.status(400).json({ error: 'CONSENT_REQUIRED', message: 'Confirm that the speaker is an adult and explicitly consents to voice creation.' });
  if (!LANGUAGE_RE.test(language) || !name) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A consent phrase language and name are required.' });
  try { return res.json(await dubbing.createVoiceConsent(req.body, req.get('content-type'), { language, name })); }
  catch (error) { return next(error); }
});

router.post('/dub/voices', raw({ type: AUDIO_TYPES, limit: 10 * 1024 * 1024 }), async (req, res, next) => {
  const consentId = String(req.query.consentId || '');
  const name = String(req.query.name || 'AWAZ custom voice').trim().slice(0, 50);
  if (req.query.speakerConsent !== 'true') return res.status(400).json({ error: 'CONSENT_REQUIRED', message: 'Confirm that this sample belongs to the same consenting adult speaker.' });
  if (!/^cons_[a-z0-9_-]{1,100}$/i.test(consentId) || !name) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A valid consent recording ID and voice name are required.' });
  try { return res.json(await dubbing.createCustomVoice(req.body, req.get('content-type'), { consentId, name })); }
  catch (error) { return next(error); }
});

module.exports = router;
