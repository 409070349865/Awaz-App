import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartNoAxesColumn, Check, Clipboard, Clock3, Download, Eraser, Languages, RefreshCw, Trash2 } from 'lucide-react';
import { getCloudHistory } from '../lib/api';
import { clearLocalHistory, exportHistory, getHistory, getStoredHistoryMode, saveHistory, saveSettings } from '../lib/storage';
import { languageName } from '../data/languages';

function useTranslationHistory() {
  const [items, setItems] = useState(getHistory);
  const load = useCallback(() => setItems(getHistory()), []);
  useEffect(() => {
    window.addEventListener('awaz:history', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('awaz:history', load);
      window.removeEventListener('storage', load);
    };
  }, [load]);
  useEffect(() => {
    if (getStoredHistoryMode() !== 'cloud') return undefined;
    let active = true;
    getCloudHistory().then((response) => {
      if (!active) return;
      const local = getHistory();
      const existingIds = new Set(local.map((entry) => entry.id));
      const remote = (Array.isArray(response.data) ? response.data : []).map((entry) => ({
        id: String(entry.id || entry._id || ''),
        sourceText: entry.sourceText,
        translatedText: entry.translatedText,
        sourceLang: entry.sourceLang,
        targetLang: entry.targetLang,
        engine: entry.engine,
        latencyMs: entry.latencyMs,
        createdAt: entry.createdAt,
      })).filter((entry) => entry.id && !existingIds.has(entry.id));
      const combined = [...local, ...remote].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      if (saveHistory(combined)) {
        saveSettings({ historyMode: 'local' });
        load();
      } else setItems(combined.slice(0, 500));
    }).catch(() => { /* Existing local history remains available if cloud migration cannot run. */ });
    return () => { active = false; };
  }, [load, setItems]);
  return { items, setItems, load };
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function HistoryView() {
  const { items, setItems, load } = useTranslationHistory();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const filtered = items.filter((item) => `${item.sourceText} ${item.translatedText} ${item.sourceLang} ${item.targetLang}`.toLowerCase().includes(query.toLowerCase()));

  const deleteItem = (item) => {
    setNotice('');
    const remaining = getHistory().filter((entry) => entry.id !== item.id);
    saveHistory(remaining);
    setItems(remaining);
  };

  const clearAll = () => {
    setNotice('');
    clearLocalHistory();
    setItems([]);
    setNotice('History cleared.');
  };

  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); setNotice('Copied.'); }
    catch { setNotice('Clipboard access was blocked by your browser.'); }
  };

  return (
    <div className="workspace-stack horizontal-workspace history-page">
      <section className="history-toolbar surface-card"><div><div className="eyebrow accent-eyebrow">ON THIS DEVICE</div><h2>{items.length} {items.length === 1 ? 'saved translation' : 'saved translations'}</h2><p>Successful translations save automatically in this browser.</p></div><div className="history-toolbar-actions"><button className="secondary-button" onClick={load}><RefreshCw size={15} />Refresh</button><button className="secondary-button" onClick={() => exportHistory(items)} disabled={!items.length}><Download size={15} />Export</button><button className="danger-button" onClick={clearAll} disabled={!items.length}><Eraser size={15} />Clear all</button></div></section>
      <div className="history-search"><span><Languages size={16} /></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search translations…" aria-label="Search translation history" /></div>
      {notice && <div className="inline-message" role="status">{notice}</div>}
      <div className="history-list">
        {!filtered.length ? <div className="empty-large"><Clock3 size={24} /><strong>{query ? 'No matching translations' : 'No translations saved yet'}</strong><span>{query ? 'Try a different search.' : 'Complete a translation and it will appear here automatically.'}</span></div> : filtered.map((item) => <article className="history-item surface-card" key={item.id}><div className="history-item-heading"><span className="history-pair"><b>{languageName(item.sourceLang)}</b><span>→</span><b>{languageName(item.targetLang)}</b></span><time><Clock3 size={13} />{new Date(item.createdAt).toLocaleString()}</time></div><p className="history-source">{item.sourceText}</p><p className="history-translation">{item.translatedText}</p><div className="history-item-footer"><span>{item.engine || 'browser'}{item.latencyMs !== undefined ? ` · ${item.latencyMs} ms` : ''}</span><div><button className="text-icon-button" onClick={() => copy(item.translatedText)} aria-label="Copy translation"><Clipboard size={15} /></button><button className="text-icon-button danger-text" onClick={() => deleteItem(item)} aria-label="Delete this translation"><Trash2 size={15} /></button></div></div></article>)}
      </div>
      <div className="privacy-footnote"><Check size={14} /> History is saved in this browser. Use Clear all to remove it.</div>
    </div>
  );
}

export function InsightsView() {
  const { items } = useTranslationHistory();
  const [practice, setPractice] = useState([]);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setClock(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const loadPractice = () => { try { setPractice(JSON.parse(localStorage.getItem('awaz.practice.v1') || '[]')); } catch { setPractice([]); } };
    loadPractice(); window.addEventListener('awaz:practice', loadPractice);
    return () => window.removeEventListener('awaz:practice', loadPractice);
  }, []);

  const languageCounts = useMemo(() => items.reduce((counts, item) => {
    const name = languageName(item.targetLang); counts[name] = (counts[name] || 0) + 1; return counts;
  }, {}), [items]);
  const dailyFrequency = useMemo(() => {
    if (!clock) return [];
    const today = new Date(clock);
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (13 - index));
      return { key: dateKey(date), label: date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), count: 0 };
    });
    const byDate = new Map(days.map((day) => [day.key, day]));
    items.forEach((item) => {
      const date = new Date(item.createdAt);
      const day = Number.isFinite(date.getTime()) ? byDate.get(dateKey(date)) : null;
      if (day) day.count += 1;
    });
    return days;
  }, [items, clock]);
  const hourlyFrequency = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    items.forEach((item) => {
      const date = new Date(item.createdAt);
      if (Number.isFinite(date.getTime())) hours[date.getHours()].count += 1;
    });
    return hours;
  }, [items]);
  const maxCount = Math.max(1, ...Object.values(languageCounts));
  const dailyMax = Math.max(1, ...dailyFrequency.map((day) => day.count));
  const hourlyMax = Math.max(1, ...hourlyFrequency.map((hour) => hour.count));
  const practiceCount = practice.length;
  const matches = practice.filter((item) => item.exactMatch).length;
  const thisWeek = items.filter((item) => {
    const timestamp = new Date(item.createdAt).getTime();
    return clock && timestamp >= clock - 7 * 24 * 60 * 60 * 1000 && timestamp <= clock;
  }).length;

  return (
    <div className="workspace-stack horizontal-workspace insights-page">
      <section className="feature-intro surface-card"><div className="feature-intro-mark"><ChartNoAxesColumn size={21} /></div><div><div className="eyebrow accent-eyebrow">PERSONAL ACTIVITY</div><h2>Useful signals from real activity.</h2><p>Insights update from translations and practice saved in this browser.</p></div></section>
      <div className="insight-stats"><article className="insight-stat surface-card"><span>TRANSLATIONS SAVED</span><strong>{items.length}</strong><small>On this device</small></article><article className="insight-stat surface-card"><span>LAST 7 DAYS</span><strong>{thisWeek}</strong><small>Based on saved timestamps</small></article><article className="insight-stat surface-card"><span>SPEAK PRACTICE</span><strong>{practiceCount}</strong><small>{matches} exact text matches · not a pronunciation score</small></article></div>
      <section className="surface-card frequency-chart-card">
        <div className="frequency-chart-heading"><div><span className="eyebrow">TRANSLATION FREQUENCY</span><h3>Daily activity</h3></div><small>LAST 14 DAYS</small></div>
        {!items.length ? <div className="empty-inline"><Clock3 size={18} />Saved translations will appear here automatically.</div> : <div className="frequency-chart daily-frequency-chart" role="img" aria-label="Saved translations for each of the last fourteen days">{dailyFrequency.map((day) => <div className="frequency-column" key={day.key} title={`${day.key}: ${day.count} translations`}><strong>{day.count || ''}</strong><div className="frequency-bar-area"><span style={{ height: `${day.count ? Math.max(4, (day.count / dailyMax) * 100) : 0}%` }} /></div><small>{day.label}</small></div>)}</div>}
      </section>
      <section className="surface-card frequency-chart-card">
        <div className="frequency-chart-heading"><div><span className="eyebrow">TIME OF DAY</span><h3>When you translate</h3></div><small>LOCAL TIME</small></div>
        {!items.length ? <div className="empty-inline"><Clock3 size={18} />Saved timestamps will appear here as an hourly frequency chart.</div> : <div className="frequency-chart hourly-frequency-chart" role="img" aria-label="Saved translations by local hour of day">{hourlyFrequency.map(({ hour, count }) => <div className="frequency-column" key={hour} title={`${String(hour).padStart(2, '0')}:00 — ${count} translations`}><strong>{count || ''}</strong><div className="frequency-bar-area"><span style={{ height: `${count ? Math.max(4, (count / hourlyMax) * 100) : 0}%` }} /></div><small>{hour % 6 === 0 ? String(hour).padStart(2, '0') : ''}</small></div>)}</div>}
      </section>
      <section className="surface-card language-insights"><div className="pane-heading"><span>TRANSLATION TARGETS</span><span className="language-caption">{items.length} saved items</span></div>{!Object.keys(languageCounts).length ? <div className="empty-inline"><Languages size={18} />Saved translations will show your language mix here.</div> : Object.entries(languageCounts).sort((a, b) => b[1] - a[1]).map(([language, count]) => <div className="language-bar-row" key={language}><span>{language}</span><div className="language-bar-track"><span style={{ width: `${Math.max(5, (count / maxCount) * 100)}%` }} /></div><strong>{count}</strong></div>)}</section>
      <p className="micro-disclosure">No estimates are made for words spoken, proficiency, streaks, accuracy or conversation duration.</p>
    </div>
  );
}
