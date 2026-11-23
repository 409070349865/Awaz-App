import { useEffect, useState } from 'react';
import { getSettings } from '../lib/storage';

export function useAppSettings() {
  const [settings, setSettings] = useState(getSettings);
  useEffect(() => {
    const update = (event) => setSettings(event.detail || getSettings());
    window.addEventListener('awaz:settings', update);
    return () => window.removeEventListener('awaz:settings', update);
  }, []);
  return settings;
}
