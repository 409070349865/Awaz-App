import { useEffect, useState } from 'react';
import { BookOpen, Mic, Plus, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { getSystemHealth } from '../lib/api';
import { getGlossary, saveGlossary, saveSettings } from '../lib/storage';
import { useAppSettings } from '../hooks/useAppSettings';
import { LANGUAGES, languageName } from '../data/languages';

export function SettingsView() {
  const settings = useAppSettings();
  const [system, setSystem] = useState(null);
  const [error, setError] = useState('');
  const [voices, setVoices] = useState([]);
  const [glossary, setGlossary] = useState(() => getGlossary());
  const [glossarySourceLang, setGlossarySourceLang] = useState('en-US');
  const [glossaryTargetLang, setGlossaryTargetLang] = useState('hi-IN');
  const [glossarySourceTerm, setGlossarySourceTerm] = useState('');
  const [glossaryTargetTerm, setGlossaryTargetTerm] = useState('');
  const [glossaryNotice, setGlossaryNotice] = useState('');

  const refresh = async () => {
    setError('');
    try { setSystem(await getSystemHealth()); }
    catch (requestError) { setError(requestError.message); setSystem(null); }
  };
  useEffect(() => {
    let active = true;
    getSystemHealth().then((result) => { if (active) setSystem(result); })
      .catch((requestError) => { if (active) { setError(requestError.message); setSystem(null); } });
    const synthesis = window.speechSynthesis;
    const loadVoices = () => setVoices(synthesis?.getVoices?.() || []);
    loadVoices();
    synthesis?.addEventListener?.('voiceschanged', loadVoices);
    return () => { active = false; synthesis?.removeEventListener?.('voiceschanged', loadVoices); };
  }, []);

  const availableEngines = system?.providers || [
    { name: 'libretranslate', configured: null, selected: settings.translationEngine === 'libretranslate' },
    { name: 'freegoogle', configured: null, selected: settings.translationEngine === 'freegoogle' },
    { name: 'google', configured: false, selected: false },
    { name: 'deepl', configured: false, selected: false },
    { name: 'openai', configured: false, selected: false },
  ];

  const addGlossaryTerm = (event) => {
    event.preventDefault();
    const sourceTerm = glossarySourceTerm.trim();
    const targetTerm = glossaryTargetTerm.trim();
    if (!sourceTerm || !targetTerm) return;
    const duplicate = glossary.some((entry) => entry.sourceLang === glossarySourceLang
      && entry.targetLang === glossaryTargetLang && entry.sourceTerm.toLowerCase() === sourceTerm.toLowerCase());
    if (duplicate) { setGlossaryNotice('That source term already exists for this language pair.'); return; }
    const next = [{ id: crypto.randomUUID(), sourceLang: glossarySourceLang, targetLang: glossaryTargetLang, sourceTerm, targetTerm }, ...glossary].slice(0, 100);
    if (!saveGlossary(next)) { setGlossaryNotice('Could not save the glossary in this browser.'); return; }
    setGlossary(next);
    setGlossarySourceTerm('');
    setGlossaryTargetTerm('');
    setGlossaryNotice('Term saved. It will be used on matching translations.');
  };

  const removeGlossaryTerm = (id) => {
    const next = glossary.filter((entry) => entry.id !== id);
    if (saveGlossary(next)) { setGlossary(next); setGlossaryNotice('Glossary term removed.'); }
    else setGlossaryNotice('Could not update the glossary in this browser.');
  };

  return (
    <div className="workspace-stack settings-page">
      <section className="feature-intro surface-card"><div className="feature-intro-mark"><RefreshCw size={20} /></div><div><div className="eyebrow accent-eyebrow">PREFERENCES</div><h2>Make AWAZ work the way you do.</h2><p>Translations save automatically in this browser and appear in History and Insights. Provider credentials are configured only on the backend.</p></div></section>
      <section className="surface-card settings-section"><div className="settings-section-heading"><span className="settings-icon">Aa</span><div><h3>Language & translation</h3><p>Select a backend provider and set default context.</p></div></div>
        <div className="setting-row"><div><strong>Translation provider</strong><p>Keys are never entered or stored in the browser.</p></div><select value={settings.translationEngine} onChange={(event) => saveSettings({ translationEngine: event.target.value })} aria-label="Translation provider"><option value="auto">Backend default</option>{availableEngines.map((engine) => <option key={engine.name} value={engine.name}>{engine.name}{engine.configured === false ? ' · configure on backend' : ''}</option>)}</select></div>
        <div className="provider-status-list">{availableEngines.map((engine) => <div key={engine.name}><span className={engine.configured ? 'provider-dot ready' : 'provider-dot'} /><span>{engine.name}</span><small>{engine.configured === true ? engine.credentialRequired ? engine.selected ? 'Default · key set' : 'Key configured' : engine.selected ? 'Backend default' : 'Adapter available' : engine.configured === false ? 'Needs backend key' : 'Backend not checked'}</small></div>)}</div>
        <div className="setting-row"><div><strong>Default communication context</strong><p>Applied to translation only when the selected engine supports it.</p></div><select value={settings.contextMode} onChange={(event) => saveSettings({ contextMode: event.target.value })} aria-label="Default communication context">{['general', 'casual', 'professional', 'business', 'travel', 'academic', 'healthcare', 'friendly', 'polite', 'formal', 'emotional', 'slang'].map((value) => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></div>
      </section>
      <section className="surface-card settings-section"><div className="settings-section-heading"><Mic size={17} /><div><h3>Voice & accessibility</h3><p>Voice selection comes from your operating system and browser.</p></div></div>
        <div className="setting-row"><div><strong>Voice speed</strong><p>Speech synthesis rate · {settings.voiceSpeed.toFixed(1)}×</p></div><input className="range-control" type="range" min="0.5" max="2" step="0.1" value={settings.voiceSpeed} onChange={(event) => saveSettings({ voiceSpeed: Number(event.target.value) })} aria-label="Voice playback speed" /></div>
        <div className="setting-row"><div><strong>Available browser voices</strong><p>{voices.length ? `${voices.length} voice${voices.length === 1 ? '' : 's'} available on this device` : 'Voice list will appear when provided by your browser.'}</p></div><span className="storage-value">{voices.length || '—'}</span></div>
        <div className="setting-row"><div><strong>Larger text</strong><p>Increase the workspace text size.</p></div><select value={settings.textScale} onChange={(event) => saveSettings({ textScale: Number(event.target.value) })} aria-label="Text size"><option value="1">Standard</option><option value="1.1">Large</option><option value="1.2">Larger</option><option value="1.3">Largest</option></select></div>
        <div className="setting-row"><div><strong>High contrast</strong><p>Increase borders and text contrast.</p></div><label className="toggle"><input type="checkbox" checked={settings.highContrast} onChange={(event) => saveSettings({ highContrast: event.target.checked })} /><span /></label></div>
        <div className="setting-row"><div><strong>Reduced motion</strong><p>Reduce animated interface effects.</p></div><label className="toggle"><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => saveSettings({ reducedMotion: event.target.checked })} /><span /></label></div>
      </section>
      <section className="surface-card settings-section glossary-settings"><div className="settings-section-heading"><BookOpen size={19} /><div><h3>Personal translation glossary</h3><p>Keep names and specialist terms consistent across translations.</p></div></div>
        <form className="glossary-form" onSubmit={addGlossaryTerm}>
          <label className="field-label">SOURCE LANGUAGE<select value={glossarySourceLang} onChange={(event) => setGlossarySourceLang(event.target.value)}>{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}</select></label>
          <label className="field-label">TARGET LANGUAGE<select value={glossaryTargetLang} onChange={(event) => setGlossaryTargetLang(event.target.value)}>{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}</select></label>
          <label className="field-label">SOURCE TERM<input value={glossarySourceTerm} onChange={(event) => setGlossarySourceTerm(event.target.value)} maxLength={120} placeholder="e.g. product name" /></label>
          <label className="field-label">PREFERRED TRANSLATION<input value={glossaryTargetTerm} onChange={(event) => setGlossaryTargetTerm(event.target.value)} maxLength={120} placeholder="How it should appear" /></label>
          <button className="primary-button glossary-add-button" type="submit" disabled={!glossarySourceTerm.trim() || !glossaryTargetTerm.trim()}><Plus size={15} />Add term</button>
        </form>
        {glossaryNotice && <div className="inline-message glossary-notice" role="status">{glossaryNotice}</div>}
        {glossary.length > 0 && <div className="glossary-list">{glossary.map((entry) => <div className="glossary-item" key={entry.id}><div><strong>{entry.sourceTerm}</strong><span>{languageName(entry.sourceLang)} → {languageName(entry.targetLang)}</span><strong>{entry.targetTerm}</strong></div><button type="button" className="text-icon-button danger-text" onClick={() => removeGlossaryTerm(entry.id)} aria-label={`Remove ${entry.sourceTerm} glossary term`} title="Remove term"><Trash2 size={15} /></button></div>)}</div>}
        <p className="glossary-disclosure">Glossary terms are stored in this browser and applied to exact matching phrases for the selected language pair.</p>
      </section>
      <section className="surface-card settings-section"><div className="settings-section-heading"><Wifi size={17} /><div><h3>System health</h3><p>Live status from the connected backend.</p></div><button className="secondary-button" onClick={refresh}><RefreshCw size={14} />Refresh</button></div>
        {system ? <div className="health-grid"><div><span>API</span><strong>{system.status}</strong></div><div><span>DATABASE</span><strong>{system.database}</strong></div><div><span>DEFAULT ENGINE</span><strong>{system.engine}</strong></div><div><span>UPTIME</span><strong>{Math.round(system.uptime / 60)} min</strong></div></div> : <div className={`inline-message${error ? ' message-error' : ''}`} role="status">{error || 'Checking backend…'}</div>}
      </section>
    </div>
  );
}
