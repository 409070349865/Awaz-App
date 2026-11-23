import { createElement } from 'react';
import { NavLink } from 'react-router-dom';
import {
  AudioLines, ChartNoAxesColumn, Clock3, Command, FileImage, Languages, Mic2, SlidersHorizontal, Users,
} from 'lucide-react';
import BrandMark from './BrandMark';

const NAV = [
  { to: '/', label: 'Translate', icon: Languages },
  { to: '/conversation', label: 'Live', icon: AudioLines },
  { to: '/vision', label: 'Vision', icon: FileImage },
  { to: '/speak', label: 'Speak', icon: Mic2 },
  { to: '/meetings', label: 'Meetings', icon: Users },
  { to: '/history', label: 'History', icon: Clock3 },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
];

export default function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <NavLink to="/" className="brand-lockup" aria-label="AWAZ home">
        <BrandMark />
        <span><strong>awaz</strong><small>COMMUNICATION, IN CONTEXT</small></span>
      </NavLink>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="sidebar-nav">
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'} aria-label={label} title={label} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            {createElement(icon, { size: 17, strokeWidth: 1.8, 'aria-hidden': true })}
            <span className="nav-item-label">{label}</span>
            {label === 'Live' && <span className="nav-live-dot" aria-hidden="true" />}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-note"><Command size={16} /><span>Made for conversations that matter.</span></div>
        <div className="version-note">AWAZ 2.0 <span>PREVIEW</span></div>
      </div>
    </aside>
  );
}
