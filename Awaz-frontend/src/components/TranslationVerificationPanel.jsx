import { useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { verifyTranslation } from '../lib/api';

const STATUS_LABELS = {
  REVIEW_RECOMMENDED: 'Review recommended',
  CHECKED_NO_OBVIOUS_ISSUES: 'No obvious issue found',
  INCONCLUSIVE: 'Check is inconclusive',
};

export default function TranslationVerificationPanel({ entry }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const requestId = useRef(0);

  const runCheck = async (backTranslate = false) => {
    const id = ++requestId.current;
    setBusy(true);
    setError('');
    try {
      const checked = await verifyTranslation(entry.sourceText, entry.translatedText, entry.sourceLang, entry.targetLang, backTranslate);
      if (id === requestId.current) setResult(checked);
    } catch (requestError) {
      if (id === requestId.current) setError(requestError.message || 'The optional review service is unavailable.');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  if (!entry?.sourceText || !entry?.translatedText) return null;
  const statusLabel = STATUS_LABELS[result?.status] || 'Not checked';

  return (
    <section className="verification-panel surface-card" aria-label="Translation review">
      <button className="verification-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="verification-icon"><ShieldCheck size={16} /></span>
        <span><strong>Translation review</strong><small>Check critical facts and meaning</small></span>
        <span className="verification-status">{statusLabel}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="verification-content">
        <p className="micro-disclosure">Optional review checks numbers, dates, currency, units, negation, omissions and meaning. It cannot prove a translation is correct.</p>
        <div className="verification-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => runCheck(false)}>{busy ? 'Checking…' : result ? 'Run check again' : 'Run AI check'}</button>
          <button className="link-button" type="button" disabled={busy} onClick={() => runCheck(true)}>Back-translate for comparison</button>
        </div>
        {error && <div className="inline-message message-error" role="status">{error}</div>}
        {result && <div className="verification-result" aria-live="polite">
          <div className={`verification-summary${result.issues?.length ? ' has-issues' : ''}`}>
            {result.issues?.length ? <AlertTriangle size={15} /> : <Check size={15} />}
            <strong>{statusLabel}</strong>
            {result.confidenceScore !== null && <span>AI estimate: {result.confidenceScore}/100</span>}
          </div>
          {result.confidenceLabel && <p className="micro-disclosure">{result.confidenceLabel}</p>}
          <p className="verification-summary-text">{result.summary}</p>
          {result.issues?.length > 0 && <ul className="verification-issues">
            {result.issues.map((issue, index) => <li key={`${issue.type}-${index}`}>
              <span className={`verification-severity severity-${issue.severity}`}>{issue.severity}</span><strong>{issue.type}</strong>
              <p>{issue.message}</p>
              {(issue.source || issue.translation) && <small>{issue.source || 'No matching source detail'} → {issue.translation || 'No matching translated detail'}</small>}
            </li>)}
          </ul>}
          {result.suggestedTranslation && <div className="verification-suggestion"><strong>Suggested wording to review</strong><p>{result.suggestedTranslation}</p></div>}
          {result.backTranslation && <div className="verification-suggestion"><strong>Back-translation ({result.backTranslation.engine})</strong><p>{result.backTranslation.text}</p></div>}
          {result.warnings?.map((warning) => <p className="verification-warning" key={warning}><AlertTriangle size={13} /> {warning}</p>)}
        </div>}
      </div>}
    </section>
  );
}
