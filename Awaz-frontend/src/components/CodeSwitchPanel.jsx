import { useEffect, useRef, useState } from 'react';
import { Languages, Sparkles } from 'lucide-react';
import { analyzeCodeSwitch } from '../lib/api';

export default function CodeSwitchPanel({ text, sourceLang, targetLang, sourceLanguageName, targetLanguageName, onApply }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const requestId = useRef(0);
  const propsKey = `${text}:${sourceLang}:${targetLang}`;
  useEffect(() => {
    requestId.current += 1;
    return () => { requestId.current += 1; };
  }, [propsKey]);

  const runAnalysis = async () => {
    const id = ++requestId.current;
    setBusy(true);
    setError('');
    try {
      const analysis = await analyzeCodeSwitch(text, sourceLang, targetLang, sourceLanguageName, targetLanguageName);
      if (id !== requestId.current) return;
      setResult({ key: propsKey, analysis });
      onApply(analysis);
    } catch (requestError) {
      if (id === requestId.current) setError(requestError.message || 'Mixed-language analysis is unavailable.');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  if (!text?.trim()) return null;
  const currentResult = result?.key === propsKey ? result.analysis : null;
  return (
    <section className="code-switch-panel surface-card" aria-label="Mixed-language translation">
      <button className="verification-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="verification-icon code-switch-icon"><Languages size={16} /></span>
        <span><strong>Mixed-language translation</strong><small>Identify code-switching, scripts and transliteration</small></span>
        <span className="verification-status">Optional</span>
      </button>
      {open && <div className="verification-content">
        <p className="micro-disclosure">AI can analyze Romanized words and mixed phrases when configured. Without it, AWAZ groups scripts and uses the regular translation provider.</p>
        <button className="secondary-button" type="button" disabled={busy} onClick={runAnalysis}><Sparkles size={14} /> {busy ? 'Analyzing…' : 'Analyze mixed-language text'}</button>
        {error && <div className="inline-message message-error" role="status">{error}</div>}
        {currentResult && <div className="code-switch-result" aria-live="polite">
          <div className="code-switch-banner"><strong>{currentResult.analysisAvailable ? 'AI language analysis' : 'Script-level fallback'}</strong><span>{currentResult.mixedLanguage ? 'Multiple scripts or languages detected' : 'No code-switch detected'}</span></div>
          <div className="code-switch-translation"><span>APPLIED TRANSLATION</span><p>{currentResult.translatedText}</p></div>
          <div className="code-switch-segments">{currentResult.segments?.map((segment, index) => <article key={`${segment.text}-${index}`}>
            <div><span>{segment.languageName || segment.language || 'Unidentified'}</span><small>{segment.script || 'Unknown script'}</small></div>
            <p>{segment.text}</p>
            {segment.transliteration && <small>Transliteration: {segment.transliteration}</small>}
            {segment.translation && <small>Meaning: {segment.translation}</small>}
          </article>)}</div>
          {!currentResult.analysisAvailable && <p className="micro-disclosure">{currentResult.summary}</p>}
        </div>}
      </div>}
    </section>
  );
}
