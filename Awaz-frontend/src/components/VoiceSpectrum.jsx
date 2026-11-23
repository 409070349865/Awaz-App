export default function VoiceSpectrum({ visible, spectrum, peakHz, level, active, error }) {
  if (!visible) return null;
  const frequencyLabels = ['70 Hz', '250 Hz', '1 kHz', '4 kHz'];

  return (
    <section className="voice-spectrum" aria-label="Live microphone frequency meter">
      <div className="voice-spectrum-heading">
        <span><i className={active ? 'voice-meter-dot active' : 'voice-meter-dot'} />LIVE VOICE FREQUENCIES</span>
        <span>{error ? 'METER UNAVAILABLE' : active ? 'SPECTRUM' : 'CONNECTING'}</span>
      </div>
      {error ? <p className="voice-spectrum-error" role="status">{error}</p> : (
        <>
          <div className="voice-spectrum-bars" role="img" aria-label="Live audio spectrum from 70 hertz to 8 kilohertz">
            {spectrum.map((value, index) => <span key={index} style={{ height: `${Math.max(3, value * 100)}%` }} />)}
          </div>
          <div className="voice-spectrum-axis">{frequencyLabels.map((label) => <span key={label}>{label}</span>)}</div>
          <div className="voice-spectrum-metrics"><span>PEAK <strong>{peakHz ? `${peakHz} Hz` : '—'}</strong></span><span>LEVEL <strong>{Math.round(level * 100)}%</strong></span></div>
          <p className="voice-spectrum-note">Measured locally while the mic is active; this meter does not record audio.</p>
        </>
      )}
    </section>
  );
}
