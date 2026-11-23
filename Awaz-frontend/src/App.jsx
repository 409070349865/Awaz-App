import { Component } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import HomeView from './pages/HomeView';
import ConversationView from './pages/ConversationView';
import VisionView from './pages/VisionView';
import { HistoryView, InsightsView } from './pages/HistoryInsightsViews';
import { SpeakView } from './pages/PracticeView';
import { SettingsView } from './pages/ControlViews';
import MeetingsView from './pages/MeetingsView';

class ApplicationBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.error('[AWAZ UI]', error); }
  render() {
    if (this.state.hasError) return <main className="crash-fallback"><span className="brand-mark">AW</span><h1>AWAZ needs a fresh start.</h1><p>The workspace stopped unexpectedly. Reload the page to continue.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload AWAZ</button></main>;
    return this.props.children;
  }
}

export default function App() {
  return (
    <ApplicationBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomeView />} />
            <Route path="conversation" element={<ConversationView />} />
            <Route path="vision" element={<VisionView />} />
            <Route path="speak" element={<SpeakView />} />
            <Route path="meetings" element={<MeetingsView />} />
            <Route path="history" element={<HistoryView />} />
            <Route path="insights" element={<InsightsView />} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ApplicationBoundary>
  );
}
