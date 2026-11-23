export const LANGUAGES = [
  { code: 'en-US', name: 'English (US)', short: 'English', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)', short: 'English', flag: '🇬🇧' },
  { code: 'hi-IN', name: 'Hindi', short: 'Hindi', flag: '🇮🇳' },
  { code: 'bn-IN', name: 'Bengali', short: 'Bengali', flag: '🇮🇳' },
  { code: 'ta-IN', name: 'Tamil', short: 'Tamil', flag: '🇮🇳' },
  { code: 'te-IN', name: 'Telugu', short: 'Telugu', flag: '🇮🇳' },
  { code: 'mr-IN', name: 'Marathi', short: 'Marathi', flag: '🇮🇳' },
  { code: 'gu-IN', name: 'Gujarati', short: 'Gujarati', flag: '🇮🇳' },
  { code: 'pa-IN', name: 'Punjabi', short: 'Punjabi', flag: '🇮🇳' },
  { code: 'ur-PK', name: 'Urdu', short: 'Urdu', flag: '🇵🇰' },
  { code: 'es-ES', name: 'Spanish', short: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', short: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', short: 'German', flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italian', short: 'Italian', flag: '🇮🇹' },
  { code: 'pt-BR', name: 'Portuguese', short: 'Portuguese', flag: '🇧🇷' },
  { code: 'ja-JP', name: 'Japanese', short: 'Japanese', flag: '🇯🇵' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', short: 'Chinese', flag: '🇨🇳' },
  { code: 'ko-KR', name: 'Korean', short: 'Korean', flag: '🇰🇷' },
  { code: 'ru-RU', name: 'Russian', short: 'Russian', flag: '🇷🇺' },
  { code: 'ar-SA', name: 'Arabic', short: 'Arabic', flag: '🇸🇦' },
  { code: 'tr-TR', name: 'Turkish', short: 'Turkish', flag: '🇹🇷' },
  { code: 'nl-NL', name: 'Dutch', short: 'Dutch', flag: '🇳🇱' },
  { code: 'id-ID', name: 'Indonesian', short: 'Indonesian', flag: '🇮🇩' },
  { code: 'vi-VN', name: 'Vietnamese', short: 'Vietnamese', flag: '🇻🇳' },
  { code: 'th-TH', name: 'Thai', short: 'Thai', flag: '🇹🇭' },
];

export const CONTEXTS = [
  ['general', 'General'], ['casual', 'Casual'], ['professional', 'Professional'],
  ['business', 'Business'], ['travel', 'Travel'], ['academic', 'Academic'],
  ['healthcare', 'Healthcare'], ['friendly', 'Friendly'], ['polite', 'Polite'],
  ['formal', 'Formal'], ['emotional', 'Emotional'], ['slang', 'Slang'],
];

export const languageName = (code) => {
  const exact = LANGUAGES.find((language) => language.code === code);
  const base = LANGUAGES.find((language) => language.code.split('-')[0] === String(code).split('-')[0]);
  return (exact || base)?.short || code;
};
