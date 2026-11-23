import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioSpectrum } from './useAudioSpectrum';

const SPEECH_ERRORS = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings and try again.',
  'service-not-allowed': 'Speech recognition is unavailable in this browser.',
  'no-speech': 'No speech was detected. Try again closer to the microphone.',
  'audio-capture': 'No microphone was found. Check the selected input device.',
  network: 'Speech recognition lost its network connection.',
};

function appendTranscript(current, addition) {
  const clean = addition.replace(/\s+/g, ' ').trim();
  if (!clean) return current;
  return current ? `${current} ${clean}` : clean;
}

export function useSpeechRecognition(onFinalResult, onSpeechError, { spectrumEnabled = true } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState('');
  const [supported] = useState(() => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const recognitionRef = useRef(null);
  const callbackRef = useRef(onFinalResult);
  const errorCallbackRef = useRef(onSpeechError);
  const shouldListenRef = useRef(false);
  const recognitionPhaseRef = useRef('idle');
  const sessionOpenRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const finalResultIndexesRef = useRef(new Set());
  const restartTimerRef = useRef(null);
  const languageRef = useRef('en-US');
  const { start: startSpectrum, stop: stopSpectrum, ...spectrum } = useAudioSpectrum();

  useEffect(() => {
    callbackRef.current = onFinalResult;
    errorCallbackRef.current = onSpeechError;
  }, [onFinalResult, onSpeechError]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return undefined;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      if (!sessionOpenRef.current) return;
      const interimParts = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal && transcript.trim()) {
          if (!finalResultIndexesRef.current.has(index)) {
            finalResultIndexesRef.current.add(index);
            finalTranscriptRef.current = appendTranscript(finalTranscriptRef.current, transcript);
          }
        } else if (transcript.trim()) interimParts.push(transcript);
      }
      interimTranscriptRef.current = interimParts.join(' ').replace(/\s+/g, ' ').trim();
      setInterimText(appendTranscript(finalTranscriptRef.current, interimTranscriptRef.current));
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      const reconnecting = event.error === 'network';
      const message = reconnecting ? 'Speech connection interrupted. Reconnecting…' : SPEECH_ERRORS[event.error] || `Speech recognition error: ${event.error}.`;
      setError(message);
      errorCallbackRef.current?.(message, event.error);
      if (!reconnecting) {
        shouldListenRef.current = false;
        stopSpectrum();
      }
    };
    recognition.onend = () => {
      recognitionPhaseRef.current = 'idle';
      if (shouldListenRef.current) {
        finalTranscriptRef.current = appendTranscript(finalTranscriptRef.current, interimTranscriptRef.current);
        interimTranscriptRef.current = '';
        setInterimText(finalTranscriptRef.current);
        finalResultIndexesRef.current = new Set();
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (!shouldListenRef.current) return;
          recognitionPhaseRef.current = 'starting';
          try { recognition.start(); }
          catch {
            const transcript = appendTranscript(finalTranscriptRef.current, interimTranscriptRef.current);
            recognitionPhaseRef.current = 'idle';
            shouldListenRef.current = false;
            setIsListening(false);
            sessionOpenRef.current = false;
            finalTranscriptRef.current = '';
            interimTranscriptRef.current = '';
            finalResultIndexesRef.current = new Set();
            setInterimText('');
            setError('Speech recognition could not reconnect. Start listening again.');
            stopSpectrum();
            if (transcript) callbackRef.current?.(transcript);
          }
        }, 180);
      } else {
        const transcript = appendTranscript(finalTranscriptRef.current, interimTranscriptRef.current);
        sessionOpenRef.current = false;
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        finalResultIndexesRef.current = new Set();
        setIsListening(false);
        setInterimText('');
        stopSpectrum();
        if (transcript) callbackRef.current?.(transcript);
      }
    };
    recognition.onstart = () => {
      recognitionPhaseRef.current = 'running';
      if (!shouldListenRef.current) {
        recognitionPhaseRef.current = 'stopping';
        try { recognition.stop(); } catch { /* it may have ended already */ }
        return;
      }
      setIsListening(true);
      setError('');
      if (spectrumEnabled) void startSpectrum();
    };
    recognitionRef.current = recognition;
    return () => {
      shouldListenRef.current = false;
      sessionOpenRef.current = false;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* already stopped */ }
      stopSpectrum();
    };
  }, [spectrumEnabled, startSpectrum, stopSpectrum]);

  const startListening = useCallback((language = 'en-US') => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError('Live speech recognition is not supported in this browser. You can still type.');
      return false;
    }
    if (shouldListenRef.current) return true;
    if (recognitionPhaseRef.current === 'stopping') {
      setError('Finishing the last recording. Start again in a moment.');
      return false;
    }
    setError('');
    languageRef.current = language;
    recognition.lang = languageRef.current;
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    finalResultIndexesRef.current = new Set();
    sessionOpenRef.current = true;
    shouldListenRef.current = true;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionPhaseRef.current = 'starting';
      recognition.start();
      setIsListening(true);
      setInterimText('');
      return true;
    }
    catch {
      shouldListenRef.current = false;
      sessionOpenRef.current = false;
      recognitionPhaseRef.current = 'idle';
      setIsListening(false);
      setError('Microphone recognition could not start. Check microphone permission and try again.');
      return false;
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!shouldListenRef.current) return;
    shouldListenRef.current = false;
    stopSpectrum();
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
      recognitionPhaseRef.current = 'idle';
    }
    if (recognitionPhaseRef.current === 'running' || recognitionPhaseRef.current === 'starting') {
      recognitionPhaseRef.current = 'stopping';
      try { recognitionRef.current?.stop(); }
      catch {
        recognitionPhaseRef.current = 'idle';
        const transcript = appendTranscript(finalTranscriptRef.current, interimTranscriptRef.current);
        sessionOpenRef.current = false;
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        setInterimText('');
        setIsListening(false);
        if (transcript) callbackRef.current?.(transcript);
      }
    } else {
      recognitionPhaseRef.current = 'idle';
      const transcript = appendTranscript(finalTranscriptRef.current, interimTranscriptRef.current);
      sessionOpenRef.current = false;
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      setInterimText('');
      setIsListening(false);
      if (transcript) callbackRef.current?.(transcript);
    }
  }, [stopSpectrum]);

  const toggleListening = useCallback((language = 'en-US') => {
    if (shouldListenRef.current) stopListening();
    else startListening(language);
  }, [startListening, stopListening]);

  return {
    isListening, interimText, error, supported, startListening, stopListening, toggleListening,
    spectrum: spectrum.spectrum, peakHz: spectrum.peakHz, level: spectrum.level,
    spectrumActive: spectrum.active, audioError: spectrum.error,
    clearError: () => setError(''),
  };
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const activeUtteranceRef = useRef(null);
  const activeHandlersRef = useRef(null);

  const cancel = useCallback((notify = true) => {
    const handlers = activeHandlersRef.current;
    activeUtteranceRef.current = null;
    activeHandlersRef.current = null;
    window.speechSynthesis?.cancel();
    if (notify) handlers?.onCancel?.();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text, lang, volume = 1, speed = 1, handlers = {}) => {
    if (!text?.trim() || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      handlers.onError?.(new Error('Speech playback is not supported in this browser.'));
      return false;
    }
    cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang || 'en-US';
    utterance.volume = Math.max(0, Math.min(1, Number(volume)));
    utterance.rate = Math.max(0.5, Math.min(2, Number(speed)));
    const voices = window.speechSynthesis.getVoices();
    const normalizedLanguage = utterance.lang.toLowerCase();
    const baseLanguage = normalizedLanguage.split('-')[0];
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === normalizedLanguage)
      || voices.find((voice) => voice.lang.toLowerCase().split('-')[0] === baseLanguage)
      || null;
    activeUtteranceRef.current = utterance;
    activeHandlersRef.current = handlers;
    const finish = (handlerName, event) => {
      if (activeUtteranceRef.current !== utterance) return;
      activeUtteranceRef.current = null;
      activeHandlersRef.current = null;
      setIsSpeaking(false);
      handlers[handlerName]?.(event);
    };
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = (event) => finish('onEnd', event);
    utterance.onerror = (event) => finish(['canceled', 'interrupted'].includes(event.error) ? 'onCancel' : 'onError', event);
    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      finish('onError', error);
      return false;
    }
    return true;
  }, [cancel]);
  const stop = useCallback(() => cancel(), [cancel]);
  useEffect(() => () => cancel(), [cancel]);
  return { speak, stop, isSpeaking, supported: 'speechSynthesis' in window };
}
