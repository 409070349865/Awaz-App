import { useState } from 'react';
import Tesseract from 'tesseract.js';

// Map our app's language codes to Tesseract.js language codes
const OCR_LANG_MAP = {
  'en-GB': 'eng',
  'en-US': 'eng',
  'es-ES': 'spa',
  'fr-FR': 'fra',
  'de-DE': 'deu',
  'it-IT': 'ita',
  'pt-BR': 'por',
  'hi-IN': 'hin',
  'ja-JP': 'jpn',
  'zh-CN': 'chi_sim',
  'ko-KR': 'kor',
  'ru-RU': 'rus',
  'ar-SA': 'ara',
  'ur-PK': 'urd',
  'bn-IN': 'ben',
  'ta-IN': 'tam',
  'te-IN': 'tel',
  'mr-IN': 'mar',
  'gu-IN': 'guj',
  'pa-IN': 'pan',
  'id-ID': 'ind',
  'vi-VN': 'vie',
  'th-TH': 'tha',
  'tr-TR': 'tur',
  'nl-NL': 'nld'
};

export function useImageOCR() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const processImage = async (fileOrUrl, sourceLangCode) => {
    setIsProcessing(true);
    setProgress(0);
    setStatus('Preparing OCR');

    const tessLang = OCR_LANG_MAP[sourceLangCode] || 'eng';

    try {
      const result = await Tesseract.recognize(
        fileOrUrl,
        tessLang,
        {
          logger: m => {
            if (m.status === 'loading tesseract core') setStatus('Starting OCR engine');
            else if (m.status === 'loading language traineddata') setStatus('Loading language data');
            else if (m.status === 'recognizing text') setStatus('Reading text');
            else if (m.status === 'initializing api') setStatus('Preparing recognition');
            if (m.status === 'recognizing text') {
              setProgress(Math.round(m.progress * 100));
            }
          }
        }
      );
      return {
        text: result.data.text.trim(),
        confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null,
      };
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setStatus('');
    }
  };

  return { processImage, isProcessing, progress, status };
}
