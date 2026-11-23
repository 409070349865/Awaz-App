import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Check, Download, FileAudio, Languages, LockKeyhole, Mic, MicOff, Radio, ShieldCheck, Sparkles, Upload, Volume2 } from 'lucide-react';
import { LANGUAGES, languageName } from '../data/languages';
import { createCustomVoice, createVoiceConsent, generateDubSpeech, getAiCapabilities, getVoiceConsentPhrases, transcribeAudio, translateText } from '../lib/api';
import { addHistory } from '../lib/storage';
import { useSpeechSynthesis } from '../hooks/useSpeech';

const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mpga', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/webm', 'audio/mp4', 'video/mp4']);
const AUDIO_MAX = 20 * 1024 * 1024;
const VOICE_MAX = 10 * 1024 * 1024;
const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
const CUSTOM_VOICE_KEY = 'awaz.dubbing.customVoiceId.v1';

function splitText(text, limit = 3_000) {
  const sentences = text.trim().split(/(?<=[.!?।！？。])\s+/u).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const sentence of sentences.length ? sentences : [text.trim()]) {
    if (sentence.length > limit) {
      if (current) { chunks.push(current); current = ''; }
      let part = '';
      for (const word of sentence.split(/\s+/u)) {
          if (word.length > limit) {
            if (part) { chunks.push(part); part = ''; }
            let wordPart = '';
            for (const character of Array.from(word)) {
              if (wordPart && `${wordPart}${character}`.length > limit) { chunks.push(wordPart); wordPart = character; }
              else wordPart += character;
            }
            part = wordPart;
          } else if (part && `${part} ${word}`.length > limit) { chunks.push(part); part = word; }
          else part = part ? `${part} ${word}` : word;
      }
      if (part) chunks.push(part);
    } else if (current && `${current} ${sentence}`.length > limit) {
      chunks.push(current); current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

function makeSegments(text, transcription) {
  const originalTranscript = transcription?.text?.trim() === text.trim();
  const timed = originalTranscript && transcription?.timedSegments && transcription.segments?.length;
  if (!timed) return splitText(text).map((part) => ({ sourceText: part, start: null, end: null, speaker: null }));
  const units = [];
  for (const item of transcription.segments) {
    const parts = splitText(item.text, 3_000);
    const duration = Number.isFinite(item.start) && Number.isFinite(item.end) ? Math.max(0, item.end - item.start) : null;
    parts.forEach((part, index) => units.push({
      sourceText: part,
      start: duration === null ? null : item.start + (duration * index) / parts.length,
      end: duration === null ? null : item.start + (duration * (index + 1)) / parts.length,
      speaker: item.speaker || null,
    }));
  }
  const result = [];
  for (const unit of units) {
    const previous = result.at(-1);
    if (previous && `${previous.sourceText} ${unit.sourceText}`.length <= 3_000) {
      previous.sourceText += ` ${unit.sourceText}`;
      previous.end = unit.end;
      if (previous.speaker !== unit.speaker) previous.speaker = null;
    } else result.push({ ...unit });
  }
  return result;
}

function makeWav(audioBuffer) {
  const samples = audioBuffer.getChannelData(0);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, audioBuffer.sampleRate, true); view.setUint32(28, audioBuffer.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function renderDubTrack(segments, originalDuration) {
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  const OfflineType = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextType || !OfflineType) throw new Error('Synchronized export needs Web Audio support in this browser.');
  const decoder = new AudioContextType();
  try {
    let cursor = 0;
    const decoded = await Promise.all(segments.map(async (segment) => decoder.decodeAudioData(await segment.audioBlob.arrayBuffer())));
    const placements = decoded.map((audio, index) => {
      const segment = segments[index];
      const hasTiming = Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start;
      const start = hasTiming ? segment.start : cursor;
      const targetDuration = hasTiming ? segment.end - segment.start : audio.duration;
      const rate = hasTiming ? Math.max(0.67, Math.min(1.5, audio.duration / targetDuration)) : 1;
      const duration = audio.duration / rate;
      cursor = Math.max(cursor, start + duration);
      return { audio, start, rate, end: start + duration };
    });
    const sampleRate = decoder.sampleRate;
    const totalDuration = Math.max(originalDuration || 0, ...placements.map((item) => item.end), 0.5) + 0.2;
    const offline = new OfflineType(1, Math.ceil(totalDuration * sampleRate), sampleRate);
    placements.forEach(({ audio, start, rate }) => {
      const source = offline.createBufferSource();
      source.buffer = audio;
      source.playbackRate.value = rate;
      source.connect(offline.destination);
      source.start(start);
    });
    return makeWav(await offline.startRendering());
  } finally {
    await decoder.close().catch(() => {});
  }
}

function extensionFor(mimeType) {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('aac')) return 'aac';
  return 'webm';
}

function isValidAudio(file, maxSize) {
  return file && AUDIO_TYPES.has(file.type.split(';')[0].toLowerCase()) && file.size > 0 && file.size <= maxSize;
}

export default function DubbingView() {
  const { speak, supported: browserSpeechSupported } = useSpeechSynthesis();
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('hi-IN');
  const [sourceAudio, setSourceAudio] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceDuration, setSourceDuration] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [transcription, setTranscription] = useState(null);
  const [segments, setSegments] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audioDisclosure, setAudioDisclosure] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState('alloy');
  const [voiceConsentConfirmed, setVoiceConsentConfirmed] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [phrases, setPhrases] = useState([]);
  const [phraseBusy, setPhraseBusy] = useState(false);
  const [consentLanguage, setConsentLanguage] = useState('en');
  const [consentAudio, setConsentAudio] = useState(null);
  const [consentId, setConsentId] = useState('');
  const [voiceSample, setVoiceSample] = useState(null);
  const [voiceSampleUrl, setVoiceSampleUrl] = useState('');
  const [voiceSampleDuration, setVoiceSampleDuration] = useState(null);
  const [voiceName, setVoiceName] = useState('My AWAZ voice');
  const [customVoiceId, setCustomVoiceId] = useState(() => { try { return localStorage.getItem(CUSTOM_VOICE_KEY) || ''; } catch { return ''; } });
  const [exportUrl, setExportUrl] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const sourceUrlRef = useRef('');
  const voiceSampleUrlRef = useRef('');
  const exportUrlRef = useRef('');
  const segmentUrlsRef = useRef([]);

  useEffect(() => {
    getAiCapabilities().then(setCapabilities).catch(() => setCapabilities({ openAiConfigured: false }));
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      recorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
      streamRef.current?.getTracks().forEach((track) => track.stop());
      [sourceUrlRef.current, voiceSampleUrlRef.current, exportUrlRef.current, ...segmentUrlsRef.current].filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const consentPhrase = useMemo(() => phrases.find((item) => item.language.split('-')[0].toLowerCase() === consentLanguage), [phrases, consentLanguage]);
  const allAudioReady = segments.length > 0 && segments.every((segment) => segment.audioBlob);

  const clearDubOutputs = () => {
    segmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    segmentUrlsRef.current = [];
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    exportUrlRef.current = '';
    setExportUrl('');
    setSegments([]);
  };

  const chooseSourceAudio = (file) => {
    if (!file) return;
    setError(''); setNotice('');
    if (!isValidAudio(file, AUDIO_MAX)) {
      setError('Choose MP3, WAV, OGG, AAC, FLAC, WebM or MP4 audio up to 20 MiB.');
      return;
    }
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    const url = URL.createObjectURL(file);
    sourceUrlRef.current = url;
    setSourceUrl(url); setSourceAudio(file); setSourceDuration(null); setTranscript(''); setTranscription(null); clearDubOutputs();
  };

  const startRecording = async () => {
    setError(''); setNotice('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError('Audio recording is not supported by this browser. Upload an audio file instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recordChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) recordChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordChunksRef.current, { type });
        const file = new File([blob], `awaz-recording.${extensionFor(type)}`, { type });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null; recorderRef.current = null;
        if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null; setRecording(false);
        if (file.size > AUDIO_MAX) setError('This recording is larger than 20 MiB. Shorten it or use a compressed audio file.');
        else chooseSourceAudio(file);
      };
      recorder.start(500);
      setRecordSeconds(0); setRecording(true);
      recordTimerRef.current = window.setInterval(() => setRecordSeconds((value) => {
        if (value >= 299) { recorderRef.current?.stop(); return 300; }
        return value + 1;
      }), 1000);
    } catch (recordError) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      setError(recordError.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in browser settings and try again.' : 'Could not start microphone recording. Upload an audio file instead.');
    }
  };

  const stopRecording = () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); };

  const runTranscription = async () => {
    if (!sourceAudio) return;
    setError(''); setNotice(''); setLoading(true); setProgress('Sending audio to the transcription provider…'); clearDubOutputs();
    try {
      const result = await transcribeAudio(sourceAudio, sourceLang.split('-')[0]);
      setTranscript(result.text); setTranscription(result);
      if (sourceLang === 'auto' && result.language) {
        const detected = String(result.language).split('-')[0].toLowerCase();
        const matchingLanguage = LANGUAGES.find((item) => item.code.split('-')[0].toLowerCase() === detected);
        if (matchingLanguage) setSourceLang(matchingLanguage.code);
      }
      setNotice(result.timedSegments ? `Transcript ready · ${result.segments.length} timed speech segments.` : 'Transcript ready. Provider timestamps were not available; segments will be aligned in order.');
    } catch (requestError) {
      setError(requestError.message || 'Audio transcription failed. You can still type the transcript below.');
    } finally { setProgress(''); setLoading(false); }
  };

  const runTranslation = async () => {
    if (!transcript.trim()) return;
    const resolvedSourceLang = sourceLang === 'auto'
      ? LANGUAGES.find((item) => item.code.split('-')[0].toLowerCase() === String(transcription?.language || '').split('-')[0].toLowerCase())?.code
      : sourceLang;
    if (!resolvedSourceLang) { setError('Choose the source language before translating this transcript.'); return; }
    clearDubOutputs(); setError(''); setNotice(''); setLoading(true);
    const chunks = makeSegments(transcript.trim(), transcription);
    const completed = [];
    let notStored = false;
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        setProgress(`Translating segment ${index + 1} of ${chunks.length}…`);
        const result = await translateText(chunk.sourceText, resolvedSourceLang, targetLang);
        const entry = { sourceText: chunk.sourceText, translatedText: result.translatedText, sourceLang: resolvedSourceLang, targetLang, engine: result.engine, latencyMs: result.latencyMs };
        if (!addHistory(entry)) notStored = true;
        completed.push({ ...chunk, ...entry, audioBlob: null, audioUrl: '' });
        setSegments([...completed]);
      }
      setNotice(notStored ? 'Translation completed. Some history entries could not be saved.' : `${completed.length} translated segments saved to history.`);
    } catch (requestError) {
      setError(`${requestError.message} ${completed.length} segment(s) completed and remain available.`);
    } finally { setProgress(''); setLoading(false); }
  };

  const generateDub = async () => {
    if (!segments.length) return;
    setError(''); setNotice(''); setGenerating(true);
    const output = [];
    try {
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        setProgress(`Generating speech ${index + 1} of ${segments.length}…`);
        const audioBlob = await generateDubSpeech({
          text: segment.translatedText,
          voice: voice === 'custom' ? undefined : voice,
          ...(voice === 'custom' ? { customVoiceId, speakerConsentConfirmed: voiceConsentConfirmed } : {}),
          language: languageName(targetLang),
          speed,
        });
        const audioUrl = URL.createObjectURL(audioBlob);
        segmentUrlsRef.current.push(audioUrl);
        output.push({ ...segment, audioBlob, audioUrl });
        setSegments([...output, ...segments.slice(index + 1)]);
      }
      setNotice('AI-generated dubbed segments are ready. Listen through before exporting.');
    } catch (requestError) {
      setError(`${requestError.message} Browser speech playback remains available for each translated segment.`);
    } finally { setProgress(''); setGenerating(false); }
  };

  const exportDub = async () => {
    setError(''); setProgress('Aligning segments and rendering WAV…');
    try {
      const blob = await renderDubTrack(segments, sourceDuration || transcription?.duration);
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      const url = URL.createObjectURL(blob);
      exportUrlRef.current = url; setExportUrl(url);
      setNotice('Synchronized WAV track is ready to download.');
    } catch (exportError) { setError(exportError.message || 'Could not render the synchronized audio track.'); }
    finally { setProgress(''); }
  };

  const loadConsentPhrases = async () => {
    setPhraseBusy(true); setError('');
    try {
      const result = await getVoiceConsentPhrases();
      setPhrases(Array.isArray(result.phrases) ? result.phrases : []);
      if (!result.phrases?.length) setError('The provider returned no voice-consent phrases for this project.');
    } catch (requestError) { setError(`${requestError.message} Recording-based custom voices also require eligible provider access.`); }
    finally { setPhraseBusy(false); }
  };

  const chooseConsentRecording = (file) => {
    if (!file) return;
    if (!isValidAudio(file, VOICE_MAX)) { setError('Consent recording must be a supported audio file no larger than 10 MiB.'); return; }
    setConsentAudio(file); setConsentId(''); setError('');
  };

  const chooseVoiceSample = (file) => {
    if (!file) return;
    if (!isValidAudio(file, VOICE_MAX)) { setError('Voice sample must be a supported audio file no larger than 10 MiB.'); return; }
    if (voiceSampleUrlRef.current) URL.revokeObjectURL(voiceSampleUrlRef.current);
    const url = URL.createObjectURL(file);
    voiceSampleUrlRef.current = url;
    setVoiceSample(file); setVoiceSampleUrl(url); setVoiceSampleDuration(null); setError('');
  };

  const uploadConsent = async () => {
    if (!consentAudio || !consentPhrase || !voiceConsentConfirmed) return;
    setLoading(true); setError(''); setNotice('Uploading the consent recording to the configured provider…');
    try {
      const result = await createVoiceConsent(consentAudio, consentPhrase.language, voiceName, true);
      setConsentId(result.id); setNotice('Speaker consent recording accepted. Upload the same adult speaker’s 10–60 second sample next.');
    } catch (requestError) { setError(`${requestError.message} Recording-based custom voices require eligible provider access.`); }
    finally { setLoading(false); }
  };

  const createVoice = async () => {
    if (!voiceSample || !consentId || !voiceConsentConfirmed || voiceSampleDuration < 10 || voiceSampleDuration > 60) return;
    setLoading(true); setError(''); setNotice('Sending the voice sample to the configured provider…');
    try {
      const result = await createCustomVoice(voiceSample, consentId, voiceName, true);
      setCustomVoiceId(result.id); setVoice('custom');
      try { localStorage.setItem(CUSTOM_VOICE_KEY, result.id); } catch { /* The ID remains available until this page is closed. */ }
      setNotice('Your consented adult voice is ready for this session’s dubbed speech.');
    } catch (requestError) { setError(`${requestError.message} Confirm the phrase and sample use the same consenting adult speaker.`); }
    finally { setLoading(false); }
  };

  const removeCustomVoice = () => {
    setCustomVoiceId(''); setVoice('alloy'); setVoiceConsentConfirmed(false);
    try { localStorage.removeItem(CUSTOM_VOICE_KEY); } catch { /* Keep the current page usable if storage is unavailable. */ }
  };

  const speakOnDevice = (text) => {
    if (!browserSpeechSupported) { setError('Browser speech playback is not supported on this device.'); return; }
    speak(text, targetLang, 1, speed, { onError: () => setError('Browser speech playback failed on this device.') });
  };

  return (
    <div className="workspace-stack">
      <section className="feature-intro surface-card dubbing-intro">
        <div className="feature-intro-mark blue-mark"><AudioLines size={22} /></div>
        <div><div className="eyebrow accent-eyebrow">VOICE WORKSPACE</div><h2>Translate a recording and build a timed voiceover.</h2><p>Transcription, translation and speech generation run only when you request them. Uploaded audio is not stored by AWAZ.</p></div>
        <span className={`capability-tag${capabilities?.openAiConfigured === false ? ' capability-muted' : ''}`}><span className={capabilities?.openAiConfigured ? 'hero-pip' : 'muted-pip'} />{capabilities?.openAiConfigured ? 'AI KEY CONFIGURED' : 'OPTIONAL AI SERVICE'}</span>
      </section>

      <section className="surface-card dub-source-card">
        <div className="dub-card-heading"><span className="dub-step">01</span><div><h3>Source recording</h3><p>Record from your microphone or choose a local audio file.</p></div></div>
        <div className="dub-language-grid">
          <label className="field-label">SOURCE LANGUAGE<select value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>{LANGUAGES.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}<option value="auto">Auto-detect</option></select></label>
          <label className="field-label">DUB LANGUAGE<select value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>{LANGUAGES.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
        </div>
        <div className="dub-source-actions">
          <label className="secondary-button dub-file-button"><Upload size={15} />Choose audio<input type="file" accept="audio/*,video/mp4" onChange={(event) => chooseSourceAudio(event.target.files?.[0])} /></label>
          {recording ? <button className="danger-button recording" type="button" onClick={stopRecording}><MicOff size={15} />Stop recording · {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</button> : <button className="secondary-button" type="button" onClick={startRecording}><Mic size={15} />Record source audio</button>}
          {sourceAudio && <button className="link-button" type="button" onClick={() => { chooseSourceAudio(null); if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current); sourceUrlRef.current = ''; setSourceUrl(''); setSourceAudio(null); setTranscript(''); setTranscription(null); clearDubOutputs(); }}>Clear recording</button>}
        </div>
        {sourceAudio && <div className="dub-audio-preview"><div><FileAudio size={16} /><span><strong>{sourceAudio.name}</strong><small>{(sourceAudio.size / (1024 * 1024)).toFixed(2)} MiB{sourceDuration ? ` · ${Math.round(sourceDuration)} sec` : ''}</small></span></div><audio src={sourceUrl} controls preload="metadata" onLoadedMetadata={(event) => setSourceDuration(event.currentTarget.duration)} /></div>}
        <label className="dub-disclosure-check"><input type="checkbox" checked={audioDisclosure} onChange={(event) => setAudioDisclosure(event.target.checked)} /><span>I understand that pressing Transcribe sends this audio to the configured speech provider for processing.</span></label>
        <div className="dub-action-row"><button className="primary-button" type="button" onClick={runTranscription} disabled={!sourceAudio || !audioDisclosure || loading || capabilities?.openAiConfigured === false}><Radio size={15} />{loading && progress.includes('Sending') ? 'Transcribing…' : 'Transcribe audio'}</button><span className="micro-disclosure">Upload limit: 20 MiB · local recording ends at 5 minutes</span></div>
      </section>

      <section className="surface-card dub-transcript-card">
        <div className="dub-card-heading"><span className="dub-step">02</span><div><h3>Review and translate transcript</h3><p>Correct the transcript before translating. Editing it clears provider timing data.</p></div></div>
        <label className="field-label">SOURCE TRANSCRIPT<textarea value={transcript} maxLength={30_000} onChange={(event) => { setTranscript(event.target.value); setTranscription(null); clearDubOutputs(); }} placeholder="Transcription appears here. You can also type or paste a transcript." /></label>
        <div className="dub-action-row"><button className="primary-button" type="button" disabled={!transcript.trim() || loading} onClick={runTranslation}><Languages size={15} />Translate transcript</button><span className="character-count">{transcript.length.toLocaleString()} / 30,000 characters</span></div>
      </section>

      {segments.length > 0 && <section className="surface-card dub-output-card">
        <div className="dub-card-heading"><span className="dub-step">03</span><div><h3>Generate dubbed speech</h3><p>{transcription?.timedSegments && transcript.trim() === transcription.text.trim() ? 'Provider timestamped segments are kept aligned with the original recording.' : 'Segments play in order because timestamped transcript data is unavailable.'}</p></div></div>
        <div className="dub-voice-controls">
          <label className="field-label">VOICE<select value={voice} onChange={(event) => setVoice(event.target.value)}>{VOICES.map((item) => <option value={item} key={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}{customVoiceId && <option value="custom">My consented voice</option>}</select></label>
          <label className="field-label dub-speed-control">SPEECH SPEED <span>{speed.toFixed(2)}×</span><input type="range" min="0.75" max="1.25" step="0.05" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label>
          <button className="secondary-button" type="button" onClick={() => { setCloneOpen((value) => !value); if (!cloneOpen && !phrases.length) void loadConsentPhrases(); }}><ShieldCheck size={14} />{cloneOpen ? 'Hide voice consent' : customVoiceId ? 'Manage consented voice' : 'Set up my voice'}</button>
        </div>
        {voice === 'custom' && <label className="dub-disclosure-check"><input type="checkbox" checked={voiceConsentConfirmed} onChange={(event) => setVoiceConsentConfirmed(event.target.checked)} /><span>I confirm this custom voice is mine or belongs to the adult speaker who gave consent.</span></label>}
        {cloneOpen && <section className="voice-consent-panel">
          <div className="voice-consent-note"><LockKeyhole size={16} /><p>Only create a voice for an adult speaker who owns the voice or gave permission. The speaker must read the exact provider phrase, and both recordings must be from that same person. Recording-based voice creation may be unavailable for this provider account.</p></div>
          <label className="dub-disclosure-check"><input type="checkbox" checked={voiceConsentConfirmed} onChange={(event) => setVoiceConsentConfirmed(event.target.checked)} /><span>I am an adult and confirm that I own this voice or have the speaker’s explicit permission to create and use it.</span></label>
          {phrases.length > 0 && <div className="voice-clone-grid">
            <label className="field-label">CONSENT PHRASE LANGUAGE<select value={consentLanguage} onChange={(event) => setConsentLanguage(event.target.value)}>{Array.from(new Map(phrases.map((item) => [item.language.split('-')[0], item])).values()).map((item) => <option key={item.language} value={item.language.split('-')[0]}>{item.language}</option>)}</select></label>
            <label className="field-label">VOICE NAME<input value={voiceName} maxLength={50} onChange={(event) => setVoiceName(event.target.value)} /></label>
            <div className="voice-consent-phrase"><span>READ THIS EXACTLY</span><p>{consentPhrase?.phrase || 'No consent phrase is available in this language.'}</p></div>
            <label className="field-label">CONSENT RECORDING<input type="file" accept="audio/*,video/mp4" onChange={(event) => chooseConsentRecording(event.target.files?.[0])} /><small>Record only the exact phrase above. Maximum 10 MiB.</small></label>
            <button className="secondary-button" type="button" disabled={!voiceConsentConfirmed || !consentAudio || !consentPhrase || loading} onClick={uploadConsent}>Upload consent recording</button>
            {consentId && <div className="voice-consent-ok"><Check size={14} />Provider accepted the consent recording.</div>}
            <label className="field-label">SAME SPEAKER’S SAMPLE<input type="file" accept="audio/*,video/mp4" onChange={(event) => chooseVoiceSample(event.target.files?.[0])} /><small>10–60 seconds, maximum 10 MiB, with at least five seconds of clear speech.</small></label>
            {voiceSampleUrl && <audio className="voice-sample-check" src={voiceSampleUrl} controls preload="metadata" onLoadedMetadata={(event) => setVoiceSampleDuration(event.currentTarget.duration)} />}
            {voiceSampleDuration !== null && <span className={`voice-sample-duration${voiceSampleDuration >= 10 && voiceSampleDuration <= 60 ? '' : ' invalid'}`}>{voiceSampleDuration.toFixed(1)} seconds · must be 10–60 seconds</span>}
            <button className="primary-button" type="button" disabled={!consentId || !voiceSample || !voiceConsentConfirmed || voiceSampleDuration < 10 || voiceSampleDuration > 60 || loading} onClick={createVoice}>Create consented voice</button>
          </div>}
          {!phrases.length && <button className="secondary-button" type="button" disabled={phraseBusy} onClick={loadConsentPhrases}>{phraseBusy ? 'Loading provider phrases…' : 'Load provider consent phrases'}</button>}
          {customVoiceId && <div className="voice-consent-ok"><Check size={14} />A consented voice ID is saved in this browser.<button className="link-button" type="button" onClick={removeCustomVoice}>Remove saved ID</button></div>}
        </section>}
        <div className="dub-action-row"><button className="primary-button" type="button" disabled={generating || !capabilities?.openAiConfigured || (voice === 'custom' && (!customVoiceId || !voiceConsentConfirmed))} onClick={generateDub}><Sparkles size={15} />{generating ? 'Generating…' : 'Generate all AI speech'}</button><span className="micro-disclosure">AI-generated speech is labeled; review translated meaning before sharing.</span></div>
        {segments.map((segment, index) => <article className="dub-segment" key={`${index}-${segment.sourceText}`}>
          <div className="dub-segment-head"><span>SEGMENT {String(index + 1).padStart(2, '0')}</span>{segment.start !== null && segment.end !== null ? <small>{segment.start.toFixed(1)}–{segment.end.toFixed(1)} sec{segment.speaker ? ` · Speaker ${segment.speaker}` : ''}</small> : <small>Sequence aligned</small>}</div>
          <p className="dub-source-line">{segment.sourceText}</p><p className="dub-target-line">{segment.translatedText}</p>
          <div className="dub-segment-actions">
            {segment.audioUrl && <><audio src={segment.audioUrl} controls preload="none" onPlay={(event) => { event.currentTarget.playbackRate = speed; }} aria-label={`AI generated audio for segment ${index + 1}`} /><a className="link-button" href={segment.audioUrl} download={`awaz-dub-${index + 1}.mp3`}><Download size={13} />MP3</a></>}
            <button className="link-button" type="button" onClick={() => speakOnDevice(segment.translatedText)} disabled={!browserSpeechSupported}><Volume2 size={14} />Play on this device</button>
          </div>
        </article>)}
        <div className="dub-export-row">
          <p className="micro-disclosure">WAV export places timestamped segments at their source start times and adjusts speed within a limited range to fit each original slot. Review overlaps and pacing; this is segment alignment, not lip-sync.</p>
          <button className="secondary-button" type="button" onClick={exportDub} disabled={!allAudioReady || Boolean(progress)}>Render synchronized WAV</button>
          {exportUrl && <a className="primary-button" href={exportUrl} download="awaz-synchronized-dub.wav"><Download size={14} />Download WAV</a>}
        </div>
      </section>}

      {(progress || loading || generating) && <div className="inline-message" role="status"><span className="spinner" />{progress || 'Working…'}</div>}
      {error && <div className="inline-message message-error" role="alert">{error}</div>}
      {notice && <div className="inline-message" role="status">{notice}</div>}
      {!segments.length && <div className="dub-empty surface-card"><AudioLines size={20} /><strong>Your dubbing workflow will appear here</strong><span>Choose or record audio, transcribe it, review the text and translate the transcript.</span></div>}
      <p className="privacy-footnote"><ShieldCheck size={14} />Audio is sent to the configured provider only after your action. AWAZ does not retain uploaded recordings or generated audio.</p>
    </div>
  );
}
