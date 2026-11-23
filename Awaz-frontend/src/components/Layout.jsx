import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Check, CircleAlert, Wifi, WifiOff } from 'lucide-react';
import Sidebar from './Sidebar';
import { getSystemHealth } from '../lib/api';
import { useAppSettings } from '../hooks/useAppSettings';

const TITLES = {
  '/': ['Translate', 'Your multilingual workspace'],
  '/conversation': ['Live conversation', 'A turn based interpreter for two people'],
  '/vision': ['Vision translator', 'Read text in the world around you'],
  '/speak': ['Speak', 'Practice a phrase and compare what the browser heard'],
  '/meetings': ['Meetings', 'Voice, video and translated conference calls'],
  '/history': ['History', 'Your saved translations, under your control'],
  '/insights': ['Insights', 'A clear view of activity stored on this device'],
  '/settings': ['Settings', 'Tune language, provider and accessibility preferences'],
};

export default function Layout() {
  const location = useLocation();
  const [health, setHealth] = useState('checking');
  const [online, setOnline] = useState(navigator.onLine);
  const settings = useAppSettings();
  const [title, subtitle] = TITLES[location.pathname] || TITLES['/'];

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
    document.documentElement.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';
  }, [settings.textScale, settings.highContrast, settings.reducedMotion]);

  useEffect(() => {
    const check = () => getSystemHealth()
      .then((result) => setHealth(result.status === 'ok' ? 'ready' : 'degraded'))
      .catch(() => setHealth('unavailable'));
    const updateOnline = () => setOnline(navigator.onLine);
    check();
    const timer = window.setInterval(check, 30_000);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="sidebar-shell"><Sidebar /></div>
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <div><span className="eyebrow">AWAZ / WORKSPACE</span><h1>{title}</h1><p>{subtitle}</p></div>
          </div>
          <div className="topbar-status" aria-live="polite">
            <span className={`status-chip ${online ? 'status-online' : 'status-offline'}`}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'Internet' : 'Offline'}
            </span>
            <span className={`status-chip status-service-${health}`}>
              {health === 'ready' ? <Check size={14} /> : health === 'degraded' || health === 'unavailable' ? <CircleAlert size={14} /> : <span className="status-pulse" />}
              {health === 'ready' ? 'Service ready' : health === 'degraded' ? 'Service limited' : health === 'unavailable' ? 'Service unavailable' : 'Checking'}
            </span>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
        <footer className="app-footer"><span>Breaking language barriers. Connecting people through intelligence.</span><span>Voice recognition and translation need an internet connection in most browsers.</span></footer>
      </main>
    </div>
  );
}
