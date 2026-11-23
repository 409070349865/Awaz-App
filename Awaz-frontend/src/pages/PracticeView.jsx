import { useCallback, useState } from 'react';
import { AudioLines, Check, CircleStop, Download, Mic, RotateCcw, Volume2 } from 'lucide-react';
import { LANGUAGES } from '../data/languages';
import { useSpeechRecognition, useSpeechSynthesis } from '../hooks/useSpeech';
import { useAppSettings } from '../hooks/useAppSettings';
import VoiceSpectrum from '../components/VoiceSpectrum';

const PRACTICE_KEY = 'awaz.practice.v1';

function recordPractice(attempt) {
  try {
    const items = JSON.parse(localStorage.getItem(PRACTICE_KEY) || '[]');
    localStorage.setItem(PRACTICE_KEY, JSON.stringify([{ ...attempt, createdAt: new Date().toISOString() }, ...items].slice(0, 500)));
    window.dispatchEvent(new Event('awaz:practice'));
  } catch { /* progress storage may be disabled */ }
}

export function SpeakView() {
  const settings = useAppSettings();
  const [language, setLanguage] = useState('es-ES');
  const [phrase, setPhrase] = useState('Could you show me the way to the station?');
  const [heard, setHeard] = useState('');
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState('');
  const [practiceLevel, setPracticeLevel] = useState('Everyday');
  const { speak, stop, isSpeaking } = useSpeechSynthesis();
  const onFinal = useCallback((text) => { setHeard((current) => `${current} ${text}`.trim()); setChecked(false); }, []);
  const { isListening, interimText, error, supported, startListening, stopListening, spectrum, peakHz, level, spectrumActive, audioError } = useSpeechRecognition(onFinal);

  const checkTranscript = () => {
    const normalize = (value) => value.toLocaleLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
    const exact = normalize(heard) === normalize(phrase);
    setChecked(true);
    setMessage(exact ? 'The browser transcription matches the phrase exactly.' : 'The browser transcription differs from the reference. Listen once more, then try again.');
    recordPractice({ language, reference: phrase, transcript: heard, exactMatch: exact });
  };

  return (
    <div className="workspace-stack horizontal-workspace practice-page">
      <section className="feature-intro surface-card">
        <div className="feature-intro-mark"><Mic size={21} /></div><div><div className="eyebrow accent-eyebrow">SPEAKING PRACTICE</div><h2>Practice the words. Find your rhythm.</h2><p>Listen to a reference, record yourself, then compare browser transcription. This is text matching, not phoneme-level pronunciation scoring.</p></div>
      </section>
      <section className="surface-card practice-card">
        <div className="practice-controls"><label className="field-label">PRACTICE LANGUAGE<select value={language} disabled={isListening} onChange={(event) => { setLanguage(event.target.value); setHeard(''); setChecked(false); }}>{LANGUAGES.map((lang) => <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>)}</select></label><label className="field-label">LEVEL<select value={practiceLevel} onChange={(event) => setPracticeLevel(event.target.value)}><option>Everyday</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div>
        <div className="practice-phrase-label">{practiceLevel.toUpperCase()} PHRASE</div>
        <textarea className="practice-reference" value={phrase} onChange={(event) => { setPhrase(event.target.value); setChecked(false); }} maxLength={500} aria-label="Practice phrase" />
        <div className="practice-actions"><button className="primary-button" onClick={() => speak(phrase, language, 1, settings.voiceSpeed)}><Volume2 size={16} /> Listen to reference</button><button className={`secondary-button${isListening ? ' recording' : ''}`} disabled={!supported} onClick={() => { if (!isListening) { setHeard(''); setChecked(false); startListening(language); } else stopListening(); }}><Mic size={16} />{isListening ? 'Stop recording' : 'Record my voice'}</button>{isSpeaking && <button className="text-icon-button" onClick={stop} aria-label="Stop reference playback"><CircleStop size={17} /></button>}</div>
        <VoiceSpectrum visible={isListening} spectrum={spectrum} peakHz={peakHz} level={level} active={spectrumActive} error={audioError} />
        {interimText && <div className="speech-interim"><AudioLines size={15} />{interimText}</div>}
        {error && <div className="inline-message message-error" role="alert">{error}</div>}
        <div className="heard-panel"><div className="pane-heading"><span>WHAT THE BROWSER HEARD</span><button className="link-button" onClick={() => { setHeard(''); setChecked(false); }}><RotateCcw size={13} /> Reset</button></div><p>{heard || 'Your transcription will appear here after you speak.'}</p></div>
        <button className="primary-button full-button" disabled={!heard} onClick={checkTranscript}><Check size={16} /> Compare text</button>
        {checked && <div className={`match-result${message.startsWith('The browser transcription matches') ? ' match-exact' : ''}`} role="status"><span>{message.startsWith('The browser transcription matches') ? <Check size={16} /> : <AudioLines size={16} />}</span>{message}</div>}
        <p className="micro-disclosure">Speech recognition is provided by your browser and may require an internet connection. A mismatch is not a pronunciation score.</p>
      </section>
    </div>
  );
}
