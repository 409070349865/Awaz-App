import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownUp, ArrowRight, AudioLines, Check, Clipboard, Eraser, FileImage, HardDrive, Languages,
  CircleStop, Mic, RotateCcw, Send, ShieldCheck, Sparkles, Volume2,
} from 'lucide-react';
import { LANGUAGES, CONTEXTS, languageName } from '../data/languages';
import { translateText } from '../lib/api';
import { addHistory, addSessionContext, saveSettings } from '../lib/storage';
import { useSpeechRecognition, useSpeechSynthesis } from '../hooks/useSpeech';
import { useAppSettings } from '../hooks/useAppSettings';
import TranslationVerificationPanel from '../components/TranslationVerificationPanel';
import CodeSwitchPanel from '../components/CodeSwitchPanel';

export default function HomeView() {
  const navigate = useNavigate();
  const settings = useAppSettings();
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('hi-IN');
  const [sourceText, setSourceText] = useState('');
  const [translation, setTranslation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestSequence = useRef(0);
  const { speak, stop, isSpeaking } = useSpeechSynthesis();

  const runTranslation = useCallback(async (text) => {
    const clean = text.trim();
    if (!clean) return;
    setSourceText(clean);
    setBusy(true);
    setError('');
    setNotice('');
    const sequence = ++requestSequence.current;
    try {
      const result = await translateText(clean, sourceLang, targetLang, settings.contextMode);
      const entry = {
        sourceText: clean,
        translatedText: result.translatedText,
        sourceLang,
        targetLang,
        engine: result.engine,
        latencyMs: result.latencyMs,
        contextApplied: result.contextApplied,
      };
      if (sequence === requestSequence.current) setTranslation(entry);
      const savedLocally = addHistory(entry);
      addSessionContext(entry, settings);
      if (!savedLocally) {
        setNotice('Translation completed, but browser storage could not save it. Check available storage and try again.');
      }
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError.message);
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }, [settings, sourceLang, targetLang]);

  const speechFinal = useCallback((text) => runTranslation(text), [runTranslation]);
  const { isListening, interimText, error: speechError, supported, startListening, stopListening } = useSpeechRecognition(speechFinal, undefined, { spectrumEnabled: false });
  const toggleVoice = () => { if (isListening) stopListening(); else startListening(sourceLang); };

  const submit = (event) => {
    event.preventDefault();
    runTranslation(sourceText);
  };

  const applyMixedTranslation = useCallback((result) => {
    const entry = {
      sourceText: sourceText.trim(), translatedText: result.translatedText, sourceLang, targetLang,
      engine: result.engine || result.translationEngine || 'mixed-language', latencyMs: result.latencyMs || 0, contextApplied: false,
    };
    requestSequence.current += 1;
    setBusy(false);
    setError('');
    setTranslation(entry);
    addSessionContext(entry, settings);
    const savedLocally = addHistory(entry);
    setNotice(savedLocally ? 'Mixed-language translation applied and saved to history.' : 'Mixed-language translation applied, but browser storage could not save it.');
  }, [settings, sourceText, sourceLang, targetLang]);

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    if (translation) {
      setSourceText(translation.translatedText);
      setTranslation(null);
    }
  };

  const copy = async () => {
    if (!translation?.translatedText) return;
    try {
      await navigator.clipboard.writeText(translation.translatedText);
      setNotice('Translation copied.');
    } catch {
      setNotice('Clipboard access was blocked by your browser.');
    }
  };

  return (
    <div className="workspace-stack horizontal-workspace home-page">
      <section className="hero-strip">
        <div className="hero-icon"><Languages size={19} /></div>
        <div><div className="hero-kicker"><span className="hero-pip" /> READY WHEN YOU ARE</div><h2>Every conversation starts with <em>understanding.</em></h2></div>
        <div className="hero-note"><HardDrive size={15} /> Your history stays on this device by default.</div>
      </section>

      <section className="translator-card surface-card" aria-label="Translation workspace">
        <div className="language-bar">
          <label className="language-select-wrap"><span>FROM</span>
            <select value={sourceLang} disabled={isListening || busy} onChange={(event) => setSourceLang(event.target.value)} aria-label="Source language">
              {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}
            </select>
          </label>
          <button className="swap-button" onClick={swapLanguages} aria-label="Swap languages" title="Swap languages"><ArrowDownUp size={17} /></button>
          <label className="language-select-wrap"><span>TO</span>
            <select value={targetLang} disabled={isListening || busy} onChange={(event) => setTargetLang(event.target.value)} aria-label="Target language">
              {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}
            </select>
          </label>
          <label className="context-select-wrap"><span>CONTEXT</span>
            <select value={settings.contextMode} onChange={(event) => saveSettings({ contextMode: event.target.value })} aria-label="Translation context">
              {CONTEXTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <form className="translation-grid" onSubmit={submit}>
          <div className="translation-pane source-pane">
            <div className="pane-heading"><span>YOUR MESSAGE</span><span className="language-caption">{languageName(sourceLang)}</span></div>
            <textarea value={sourceText} onChange={(event) => { setSourceText(event.target.value); setTranslation(null); setError(''); }} maxLength={5000} placeholder="Type a message, or use your voice…" aria-label="Text to translate" />
            <div className="source-pane-footer">
              <span className="character-count">{sourceText.length.toLocaleString()} / 5,000</span>
              <button type="button" className="text-icon-button" disabled={!sourceText} onClick={() => { setSourceText(''); setTranslation(null); setError(''); }} aria-label="Clear message" title="Clear"><Eraser size={15} /></button>
            </div>
            {interimText && <div className="speech-interim" aria-live="polite"><AudioLines size={14} /> {interimText}</div>}
          </div>

          <div className="translate-rail">
            <div className={`voice-capture-control${isListening ? ' listening' : ''}`}>
              <button type="button" className={`voice-mic-button${isListening ? ' active' : ''}`} onClick={toggleVoice} disabled={!supported || busy} aria-label={isListening ? 'Stop buffering and translate speech' : 'Start speaking'} aria-pressed={isListening} title={isListening ? 'Stop and translate this turn' : 'Start speaking'}>
                {isListening ? <CircleStop size={21} /> : <Mic size={21} />}
              </button>
              <span>{isListening ? 'BUFFERING SPEECH' : busy ? 'TRANSLATING' : supported ? 'TAP TO SPEAK' : 'VOICE UNAVAILABLE'}</span>
              {isListening && <div className="voice-buffer-indicator" aria-hidden="true"><i /><i /><i /><i /><i /></div>}
            </div>
            <button className="translate-submit" type="submit" disabled={!sourceText.trim() || busy || isListening} aria-label="Translate">
              {busy ? <span className="spinner" /> : <ArrowRight size={19} />}
            </button>
            <span>{busy ? 'WORKING' : 'TRANSLATE'}</span>
          </div>

          <div className="translation-pane result-pane">
            <div className="pane-heading"><span>TRANSLATION</span><span className="language-caption">{languageName(targetLang)}</span></div>
            {translation ? <div className="translated-copy" aria-live="polite">{translation.translatedText}</div> : <div className="translation-placeholder">{busy ? <><span className="placeholder-pulse" />Finding the right words…</> : 'Your translation will appear here.'}</div>}
            {translation && <div className="result-footer">
              <span className="provider-note">{translation.engine === 'identity' ? 'Same language' : `${translation.engine} · ${translation.latencyMs} ms`}{translation.contextApplied ? ' · context applied' : ''}</span>
              <div className="result-actions">
                <button className="text-icon-button" onClick={copy} title="Copy translation" aria-label="Copy translation"><Clipboard size={16} /></button>
                <button className="text-icon-button" onClick={() => speak(translation.translatedText, targetLang, 1, settings.voiceSpeed)} title="Play translation" aria-label="Play translation"><Volume2 size={16} /></button>
                {isSpeaking && <button className="text-icon-button" onClick={stop} title="Stop playback" aria-label="Stop playback"><span className="stop-icon" /></button>}
              </div>
            </div>}
          </div>
        </form>

        {(error || speechError || notice) && <div className={`inline-message${error || speechError ? ' message-error' : ''}`} role="status">{error || speechError || notice}{(error || speechError) && <button className="retry-link" onClick={() => error ? runTranslation(sourceText) : toggleVoice()}><RotateCcw size={13} /> Try again</button>}</div>}
        {!supported && <div className="inline-hint">This browser has no live speech recognition. Text translation still works.</div>}

        <div className="translator-bottom">
          <div className="bottom-explain"><Sparkles size={15} /><span>Contextual wording is available with OpenAI configured on the backend.</span></div>
        </div>
      </section>

      <TranslationVerificationPanel key={`${translation?.sourceText || ''}:${translation?.translatedText || ''}`} entry={translation} />
      <CodeSwitchPanel key={`${sourceText}:${sourceLang}:${targetLang}`} text={sourceText} sourceLang={sourceLang} targetLang={targetLang}
        sourceLanguageName={languageName(sourceLang)} targetLanguageName={languageName(targetLang)} onApply={applyMixedTranslation} />

      <div className="feature-links">
        <button className="feature-link-card" onClick={() => navigate('/conversation')}><span className="feature-link-icon green"><AudioLines size={18} /></span><span><strong>Live conversation</strong><small>Take turns with a browser interpreter</small></span><ArrowRight size={16} /></button>
        <button className="feature-link-card" onClick={() => navigate('/vision')}><span className="feature-link-icon blue"><FileImage size={18} /></span><span><strong>Translate a sign or menu</strong><small>Extract text from a photo on this device</small></span><ArrowRight size={16} /></button>
      </div>
      <div className="privacy-footnote"><ShieldCheck size={14} /> Translations save automatically to this browser and appear in History and Insights.</div>
    </div>
  );
}
