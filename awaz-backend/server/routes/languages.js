/**
 * routes/languages.js — GET /languages
 * ══════════════════════════════════════
 * Returns the list of supported language codes and names.
 * The frontend can use this to dynamically populate the language
 * selector dropdowns instead of hard-coding them in the HTML.
 *
 * Response: { languages: [{ code: 'en', name: 'English', flag: '🇬🇧' }, …] }
 */

'use strict';

const { Router } = require('express');
const router     = Router();

const LANGUAGES = [
  { code: 'en', locale: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'es', locale: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', locale: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de', locale: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'it', locale: 'it-IT', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', locale: 'pt-BR', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'ru', locale: 'ru-RU', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', locale: 'zh-CN', name: 'Chinese (Simplified)', flag: '🇨🇳' },
  { code: 'ja', locale: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', locale: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', locale: 'ar-SA', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', locale: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ur', locale: 'ur-PK', name: 'Urdu', flag: '🇵🇰' },
  { code: 'nl', locale: 'nl-NL', name: 'Dutch', flag: '🇳🇱' },
  { code: 'tr', locale: 'tr-TR', name: 'Turkish', flag: '🇹🇷' },
  { code: 'bn', locale: 'bn-IN', name: 'Bengali', flag: '🇮🇳' },
  { code: 'ta', locale: 'ta-IN', name: 'Tamil', flag: '🇮🇳' },
  { code: 'te', locale: 'te-IN', name: 'Telugu', flag: '🇮🇳' },
  { code: 'mr', locale: 'mr-IN', name: 'Marathi', flag: '🇮🇳' },
  { code: 'gu', locale: 'gu-IN', name: 'Gujarati', flag: '🇮🇳' },
  { code: 'pa', locale: 'pa-IN', name: 'Punjabi', flag: '🇮🇳' },
  { code: 'id', locale: 'id-ID', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'vi', locale: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'th', locale: 'th-TH', name: 'Thai', flag: '🇹🇭' },
  { code: 'pl', locale: 'pl-PL', name: 'Polish', flag: '🇵🇱' },
  { code: 'sv', locale: 'sv-SE', name: 'Swedish', flag: '🇸🇪' },
];

router.get('/', (req, res) => {
  res.json({ languages: LANGUAGES });
});

module.exports = router;
