import { useCallback, useState } from 'react';
import { ArrowDownUp, AudioLines, Check, CircleStop, Languages, Mic, RotateCcw, Volume2 } from 'lucide-react';
import { LANGUAGES } from '../data/languages';
import { translateText } from '../lib/api';
import { addHistory, addSessionContext } from '../lib/storage';
import { useSpeechRecognition, useSpeechSynthesis } from '../hooks/useSpeech';
import { useAppSettings } from '../hooks/useAppSettings';
import VoiceSpectrum from '../components/VoiceSpectrum';

export default function ConversationView() {
  const settings = useAppSettings();
  const [speakerALang, setSpeakerALang] = useState('en-US');
  const [speakerBLang, setSpeakerBLang] = useState('hi-IN');
  const [speaker, setSpeaker] = useState('A');
  const [text, setText] = useState('');
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [failedTurn, setFailedTurn] = useState(null);
  const fromLang = speaker === 'A' ? speakerALang : speakerBLang;
  const toLang = speaker === 'A' ? speakerBLang : speakerALang;
  const { speak, stop, isSpeaking } = useSpeechSynthesis();

  const translateTurn = useCallback(async (spokenText, retryOptions = {}) => {
    const clean = spokenText.trim();
    if (!clean) return;
    const turnSpeaker = retryOptions.speaker || speaker;
    const turnSourceLang = retryOptions.sourceLang || fromLang;
    const turnTargetLang = retryOptions.targetLang || toLang;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await translateText(clean, turnSourceLang, turnTargetLang, settings.contextMode);
      const entry = {
        id: crypto.randomUUID(), speaker: turnSpeaker, sourceText: clean,
        translatedText: result.translatedText, sourceLang: turnSourceLang,
        targetLang: turnTargetLang, engine: result.engine, latencyMs: result.latencyMs,
      };
      setTurns((current) => [entry, ...current].slice(0, 100));
      const savedLocally = addHistory(entry);
      addSessionContext(entry, settings);
      if (!savedLocally) setNotice('Turn translated, but browser storage could not save it.');
      setFailedTurn(null);
      setText('');
    } catch (requestError) {
      setFailedTurn({ text: clean, speaker: turnSpeaker, sourceLang: turnSourceLang, targetLang: turnTargetLang });
      setText(clean);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }, [fromLang, toLang, speaker, settings]);

  const onSpeech = useCallback((spokenText) => translateTurn(spokenText), [translateTurn]);
  const { isListening, interimText, error: speechError, supported, startListening, stopListening, spectrum, peakHz, level, spectrumActive, audioError } = useSpeechRecognition(onSpeech);
  const toggleVoice = () => { if (isListening) stopListening(); else startListening(fromLang); };

  const switchLanguages = () => {
    setSpeakerALang(speakerBLang);
    setSpeakerBLang(speakerALang);
    setSpeaker((value) => value === 'A' ? 'B' : 'A');
    stopListening();
  };

  return (
    <div className="workspace-stack horizontal-workspace conversation-page">
      <section className="feature-intro surface-card">
        <div className="feature-intro-mark"><AudioLines size={21} /></div>
        <div><div className="eyebrow accent-eyebrow">TURN BASED INTERPRETER</div><h2>Two people. One conversation.</h2><p>Choose who is speaking, then use the mic or type a turn. AWAZ translates each finished turn and can read it aloud.</p></div>
        <span className="capability-tag"><span className="hero-pip" /> READY</span>
      </section>

      <section className="surface-card conversation-workspace">
        <div className="speaker-config-grid">
          <label className={`speaker-config speaker-a${speaker === 'A' ? ' selected' : ''}`}>
            <button type="button" className="speaker-select-button" onClick={() => { setSpeaker('A'); stopListening(); }}><span className="speaker-avatar">A</span><span><small>PERSON A</small><strong>I'm speaking</strong></span></button>
            <select value={speakerALang} disabled={isListening || busy} onChange={(event) => setSpeakerALang(event.target.value)} aria-label="Person A language">
              {LANGUAGES.map((lang) => <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>)}
            </select>
          </label>
          <button className="swap-button conversation-swap" onClick={switchLanguages} aria-label="Swap speaker languages"><ArrowDownUp size={17} /></button>
          <label className={`speaker-config speaker-b${speaker === 'B' ? ' selected' : ''}`}>
            <button type="button" className="speaker-select-button" onClick={() => { setSpeaker('B'); stopListening(); }}><span className="speaker-avatar">B</span><span><small>PERSON B</small><strong>I'm speaking</strong></span></button>
            <select value={speakerBLang} disabled={isListening || busy} onChange={(event) => setSpeakerBLang(event.target.value)} aria-label="Person B language">
              {LANGUAGES.map((lang) => <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>)}
            </select>
          </label>
        </div>

        <div className="active-speaker-row">
          <div><span className="active-speaker-mark">{speaker}</span><span><strong>Person {speaker}</strong><small>Speaking {speaker === 'A' ? speakerALang : speakerBLang}</small></span></div>
          <button className={`primary-button mic-turn-button${isListening ? ' recording' : ''}`} onClick={toggleVoice} disabled={!supported || busy}>
            {isListening ? <CircleStop size={18} /> : <Mic size={18} />}{isListening ? 'Finish & translate turn' : 'Start speaking'}
          </button>
        </div>
        <VoiceSpectrum visible={isListening} spectrum={spectrum} peakHz={peakHz} level={level} active={spectrumActive} error={audioError} />
        {interimText && <div className="speech-interim"><AudioLines size={15} />{interimText}</div>}
        {speechError && <div className="inline-message message-error" role="alert">{speechError}</div>}
        {error && <div className="inline-message message-error" role="alert">{error}{failedTurn && <button className="retry-link" onClick={() => translateTurn(failedTurn.text, failedTurn)}><RotateCcw size={13} /> Retry this turn</button>}</div>}
        {notice && <div className="inline-message" role="status">{notice}</div>}
        {!supported && <p className="inline-hint">Live speech recognition is not supported in this browser. Use the text box below.</p>}

        <form className="turn-input" onSubmit={(event) => { event.preventDefault(); translateTurn(text); }}>
          <input value={text} onChange={(event) => setText(event.target.value)} maxLength={5000} placeholder={`Type a message in ${speaker === 'A' ? 'Person A' : 'Person B'}'s language…`} aria-label="Conversation turn" />
          <button className="primary-button" type="submit" disabled={!text.trim() || busy}>{busy ? <span className="spinner" /> : <Languages size={16} />}{busy ? 'Translating' : 'Translate turn'}</button>
        </form>
        <div className="conversation-divider"><span>CONVERSATION</span><button className="link-button" disabled={!turns.length} onClick={() => setTurns([])}>Clear</button></div>
        <div className="turn-list" aria-live="polite">
          {!turns.length ? <div className="empty-inline"><AudioLines size={19} /><span>Your conversation will appear here as people take turns.</span></div> : turns.map((turn) => (
            <article key={turn.id} className="turn-card">
              <span className={`turn-speaker-label ${turn.speaker === 'A' ? 'label-a' : 'label-b'}`}>PERSON {turn.speaker}</span>
              <div className="turn-languages"><span>{turn.sourceLang}</span><ArrowDownUp size={13} /><span>{turn.targetLang}</span></div>
              <div className="turn-original">{turn.sourceText}</div>
              <div className="turn-translation">{turn.translatedText}</div>
              <div className="turn-tools"><small>{turn.engine} · {turn.latencyMs} ms</small><button className="text-icon-button" onClick={() => speak(turn.translatedText, turn.targetLang, 1, settings.voiceSpeed)} aria-label="Play translated turn"><Volume2 size={15} /></button></div>
            </article>
          ))}
        </div>
        <div className="privacy-footnote"><Check size={14} /> This turn based mode does not identify speakers. Browser speech recognition may send audio to your browser provider.</div>
      </section>
      {isSpeaking && <button className="floating-stop" onClick={stop}><CircleStop size={17} /> Stop playback</button>}
    </div>
  );
}
