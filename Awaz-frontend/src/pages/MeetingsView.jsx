import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines, BookOpen, Camera, CameraOff, Check, CircleStop, Copy, Languages, Mic, MicOff, Phone, Signal, Users, Video,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { LANGUAGES } from '../data/languages';
import { addHistory, addMeetingRecap, getMeetingRecaps } from '../lib/storage';
import { getMeetingIceServers, openMeetingSocket, translateText } from '../lib/api';
import { useSpeechRecognition } from '../hooks/useSpeech';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const CALL_MODES = [
  { id: 'voice', label: 'Voice call', detail: 'Translated voice, two people', icon: Phone },
  { id: 'video', label: 'Video call', detail: 'Face to face, two people', icon: Video },
  { id: 'conference', label: 'Conference', detail: 'Translated group call, up to six', icon: Users },
];

function createRoomCode() {
  const values = new Uint8Array(8);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');
}

function ParticipantTile({ participant, hearOriginalAudio }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const stream = participant.stream;
  const hasVideo = Boolean(stream?.getVideoTracks().length) && !participant.cameraOff;

  useEffect(() => {
    const videoElement = videoRef.current;
    const audioElement = audioRef.current;
    if (videoElement) videoElement.srcObject = stream || null;
    if (audioElement) {
      audioElement.srcObject = stream || null;
      audioElement.muted = !hearOriginalAudio || Boolean(participant.muted);
      if (hearOriginalAudio) void audioElement.play().catch(() => {});
    }
    return () => {
      if (videoElement) videoElement.srcObject = null;
      if (audioElement) audioElement.srcObject = null;
    };
  }, [hearOriginalAudio, participant.muted, stream]);

  return (
    <article className="meeting-participant surface-card">
      {hasVideo ? <video ref={videoRef} autoPlay playsInline muted aria-label={`${participant.name} video`} /> : <div className="meeting-avatar">{participant.name.slice(0, 1).toUpperCase()}</div>}
      <audio ref={audioRef} autoPlay muted={!hearOriginalAudio} />
      <div className="meeting-participant-caption"><span>{participant.name}</span><small>{participant.cameraOff ? 'Camera off' : participant.muted ? 'Muted' : participant.connectionState || 'Connecting'}</small></div>
    </article>
  );
}

function appendMessage(setMessages, message) {
  setMessages((current) => [message, ...current].slice(0, 80));
}

export default function MeetingsView() {
  const [searchParams] = useSearchParams();
  const linkedRoomCode = searchParams.get('room');
  const linkedMode = searchParams.get('mode');
  const [callMode, setCallMode] = useState(() => CALL_MODES.some((mode) => mode.id === linkedMode) ? linkedMode : 'voice');
  const [sourceLang, setSourceLang] = useState('en-US');
  const [hearLanguage, setHearLanguage] = useState('hi-IN');
  const [displayName, setDisplayName] = useState(() => {
    try { return localStorage.getItem('awaz.meeting-name.v1') || ''; } catch { return ''; }
  });
  const [roomInput, setRoomInput] = useState(() => linkedRoomCode?.toUpperCase() || '');
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState('idle');
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hearOriginalAudio, setHearOriginalAudio] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [cameraDisabled, setCameraDisabled] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState({ level: 'pending', label: 'Waiting' });
  const [autoFinishSpeech, setAutoFinishSpeech] = useState(() => {
    try { return localStorage.getItem('awaz.meeting-auto-finish.v1') === 'true'; } catch { return false; }
  });
  const [savedRecaps, setSavedRecaps] = useState(() => getMeetingRecaps());
  const [recapEditorOpen, setRecapEditorOpen] = useState(false);
  const [recapTitle, setRecapTitle] = useState('');
  const [recapSummary, setRecapSummary] = useState('');
  const [recapActionItems, setRecapActionItems] = useState('');
  const localVideoRef = useRef(null);
  const socketRef = useRef(null);
  const iceServersRef = useRef(ICE_SERVERS);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const participantNamesRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const connectionTimeoutRef = useRef(null);
  const autoFinishTimerRef = useRef(null);
  const joinedRef = useRef(false);
  const microphoneMutedRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const speechControlsRef = useRef(null);
  const speechQueueRef = useRef([]);
  const speechBusyRef = useRef(false);
  const resumeListeningAfterPlaybackRef = useRef(false);
  const speechRunnerRef = useRef(null);
  const activeUtteranceRef = useRef(null);
  const incomingTranslationsRef = useRef(Promise.resolve());

  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (videoElement) videoElement.srcObject = localStream || null;
    return () => { if (videoElement) videoElement.srcObject = null; };
  }, [localStream]);

  const sendMeetingMessage = useCallback((message) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const runSpeechQueue = useCallback(() => {
    if (speechBusyRef.current || typeof window === 'undefined' || !window.speechSynthesis) return;
    const next = speechQueueRef.current.shift();
    if (!next) {
      if (resumeListeningAfterPlaybackRef.current) {
        resumeListeningAfterPlaybackRef.current = false;
        if (joinedRef.current && !microphoneMutedRef.current && speechControlsRef.current?.supported) {
          window.setTimeout(() => {
            if (joinedRef.current) speechControlsRef.current?.startListening(sourceLang);
          }, 180);
        }
      }
      return;
    }
    const utterance = new SpeechSynthesisUtterance(next.text);
    utterance.lang = next.language || 'en-US';
    utterance.rate = 0.96;
    const voices = window.speechSynthesis.getVoices();
    const language = utterance.lang.toLowerCase();
    const baseLanguage = language.split('-')[0];
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === language)
      || voices.find((voice) => voice.lang.toLowerCase().split('-')[0] === baseLanguage)
      || null;
    speechBusyRef.current = true;
    activeUtteranceRef.current = utterance;
    const finish = () => {
      if (activeUtteranceRef.current !== utterance) return;
      activeUtteranceRef.current = null;
      speechBusyRef.current = false;
      speechRunnerRef.current?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }, [sourceLang]);
  useEffect(() => { speechRunnerRef.current = runSpeechQueue; }, [runSpeechQueue]);

  const queueTranslatedSpeech = useCallback((text, language) => {
    if (!text?.trim() || !('speechSynthesis' in window)) return false;
    if (joinedRef.current) {
      resumeListeningAfterPlaybackRef.current = !microphoneMutedRef.current;
      if (speechControlsRef.current?.isListening) speechControlsRef.current.stopListening();
    }
    speechQueueRef.current.push({ text, language });
    speechRunnerRef.current?.();
    return true;
  }, []);

  const stopTranslatedSpeech = useCallback(() => {
    speechQueueRef.current = [];
    speechBusyRef.current = false;
    resumeListeningAfterPlaybackRef.current = false;
    activeUtteranceRef.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  const closePeerConnections = useCallback(() => {
    for (const peerConnection of peerConnectionsRef.current.values()) peerConnection.close();
    peerConnectionsRef.current.clear();
    participantNamesRef.current.clear();
    pendingCandidatesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setParticipants([]);
  }, []);

  const stopActiveSpeech = useCallback(() => speechControlsRef.current?.stopListening(), []);

  const leaveMeeting = useCallback(() => {
    joinedRef.current = false;
    intentionalCloseRef.current = true;
    if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = null;
    stopActiveSpeech();
    sendMeetingMessage({ type: 'leave-room' });
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState < WebSocket.CLOSING) socket.close();
    }
    closePeerConnections();
    stopTranslatedSpeech();
    setStatus('idle');
    setRoomCode('');
    setConnectionQuality({ level: 'pending', label: 'Waiting' });
    setError('');
    setNotice('You left the meeting.');
  }, [closePeerConnections, sendMeetingMessage, stopActiveSpeech, stopTranslatedSpeech]);

  const createPeerConnection = useCallback((peer, initiateOffer = false) => {
    if (peerConnectionsRef.current.has(peer.peerId)) return peerConnectionsRef.current.get(peer.peerId);
    const peerConnection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peerConnectionsRef.current.set(peer.peerId, peerConnection);
    participantNamesRef.current.set(peer.peerId, peer.name || 'Guest');
    localStreamRef.current?.getTracks().forEach((track) => peerConnection.addTrack(track, localStreamRef.current));
    setParticipants((current) => {
      const found = current.some((participant) => participant.peerId === peer.peerId);
      return found ? current.map((participant) => participant.peerId === peer.peerId ? { ...participant, name: peer.name || participant.name, muted: Boolean(peer.muted), cameraOff: Boolean(peer.cameraOff) } : participant)
        : [...current, { peerId: peer.peerId, name: peer.name || 'Guest', muted: Boolean(peer.muted), cameraOff: Boolean(peer.cameraOff), connectionState: 'Connecting', stream: null }];
    });
    peerConnection.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setParticipants((current) => current.map((participant) => participant.peerId === peer.peerId ? { ...participant, stream, connectionState: 'Connected' } : participant));
    };
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) sendMeetingMessage({ type: 'ice-candidate', to: peer.peerId, candidate: event.candidate.toJSON() });
    };
    peerConnection.onconnectionstatechange = () => {
      const connectionState = peerConnection.connectionState;
      setParticipants((current) => current.map((participant) => participant.peerId === peer.peerId ? { ...participant, connectionState } : participant));
      if (connectionState === 'failed') {
        try { peerConnection.restartIce(); } catch { /* Browser does not support ICE restart. */ }
      }
    };
    if (initiateOffer) {
      void (async () => {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendMeetingMessage({ type: 'offer', to: peer.peerId, description: peerConnection.localDescription });
      })().catch(() => setError('Could not start a peer connection. Check the network and try again.'));
    }
    return peerConnection;
  }, [sendMeetingMessage]);

  const flushPendingCandidates = useCallback(async (peerId, peerConnection) => {
    const pending = pendingCandidatesRef.current.get(peerId) || [];
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of pending) {
      try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch { /* Ignore stale candidates after a peer reconnects. */ }
    }
  }, []);

  const processIncomingTranscript = useCallback(async (message) => {
    const targetLang = hearLanguage;
    const sourceLang = message.sourceLang;
    const sameLanguage = sourceLang.toLowerCase().split('-')[0] === targetLang.toLowerCase().split('-')[0];
    let result;
    try {
      result = sameLanguage ? { translatedText: message.text, engine: 'identity', latencyMs: 0 }
        : await translateText(message.text, sourceLang, targetLang);
    } catch {
      appendMessage(setMessages, {
        sourceText: message.text, translatedText: message.text, sourceLang, targetLang,
        speakerName: message.speakerName || 'Guest', createdAt: message.createdAt || new Date().toISOString(),
        id: crypto.randomUUID(), translationUnavailable: true,
      });
      setError(`Could not translate ${message.speakerName || 'the speaker'}'s turn into ${targetLang}. The original speech is shown in captions.`);
      return;
    }
    const entry = {
      sourceText: message.text, translatedText: result.translatedText,
      sourceLang, targetLang, engine: result.engine, latencyMs: result.latencyMs,
    };
    addHistory(entry);
    appendMessage(setMessages, { ...entry, speakerName: message.speakerName || 'Guest', createdAt: message.createdAt || new Date().toISOString(), id: crypto.randomUUID() });
    queueTranslatedSpeech(result.translatedText, targetLang);
  }, [hearLanguage, queueTranslatedSpeech]);

  const enqueueIncomingTranscript = useCallback((message) => {
    incomingTranslationsRef.current = incomingTranslationsRef.current
      .then(() => processIncomingTranscript(message))
      .catch((requestError) => setError(requestError.message || 'Could not translate a meeting turn.'));
  }, [processIncomingTranscript]);

  const handleServerMessage = useCallback(async (message) => {
    if (message.type === 'room-joined') {
      if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
      joinedRef.current = true;
      setRoomCode(message.roomCode);
      setStatus('live');
      setNotice('Meeting connected. Speak, then stop listening to translate your turn.');
      const peers = Array.isArray(message.peers) ? message.peers : [];
      setParticipants(peers.map((peer) => ({ ...peer, connectionState: 'Connecting', stream: null })));
      peers.forEach((peer) => createPeerConnection(peer, true));
      if (!microphoneMutedRef.current && speechControlsRef.current?.supported) speechControlsRef.current.startListening(sourceLang);
      else setNotice('Meeting connected. Type a message to translate; live speech recognition is not supported here.');
      return;
    }
    if (message.type === 'peer-joined') {
      createPeerConnection(message.peer, false);
      setNotice(`${message.peer.name} joined the meeting.`);
      return;
    }
    if (message.type === 'peer-left') {
      peerConnectionsRef.current.get(message.peerId)?.close();
      peerConnectionsRef.current.delete(message.peerId);
      pendingCandidatesRef.current.delete(message.peerId);
      setParticipants((current) => current.filter((participant) => participant.peerId !== message.peerId));
      setNotice(`${participantNamesRef.current.get(message.peerId) || 'A participant'} left the meeting.`);
      participantNamesRef.current.delete(message.peerId);
      return;
    }
    if (message.type === 'meeting-state') {
      setParticipants((current) => current.map((participant) => participant.peerId === message.peerId
        ? { ...participant, muted: Boolean(message.muted), cameraOff: Boolean(message.cameraOff) } : participant));
      return;
    }
    if (message.type === 'offer') {
      const peerConnection = createPeerConnection({ peerId: message.from, name: participantNamesRef.current.get(message.from) || 'Guest' });
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.description));
      await flushPendingCandidates(message.from, peerConnection);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      sendMeetingMessage({ type: 'answer', to: message.from, description: peerConnection.localDescription });
      return;
    }
    if (message.type === 'answer') {
      const peerConnection = peerConnectionsRef.current.get(message.from);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.description));
        await flushPendingCandidates(message.from, peerConnection);
      }
      return;
    }
    if (message.type === 'ice-candidate') {
      const peerConnection = peerConnectionsRef.current.get(message.from);
      if (!peerConnection) return;
      if (peerConnection.remoteDescription) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate)); }
        catch { /* Ignore expired ICE candidates. */ }
      } else {
        const pending = pendingCandidatesRef.current.get(message.from) || [];
        pending.push(message.candidate);
        pendingCandidatesRef.current.set(message.from, pending);
      }
      return;
    }
    if (message.type === 'meeting-transcript') {
      enqueueIncomingTranscript(message);
      return;
    }
    if (message.type === 'meeting-error') {
      setError(message.message || 'The meeting could not continue.');
      if (!joinedRef.current) {
        if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
        stopActiveSpeech();
        closePeerConnections();
        const socket = socketRef.current;
        socketRef.current = null;
        if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
        setStatus('idle');
      }
    }
  }, [closePeerConnections, createPeerConnection, enqueueIncomingTranscript, flushPendingCandidates, sendMeetingMessage, sourceLang, stopActiveSpeech]);

  const onFinalSpeech = useCallback(async (text) => {
    const clean = text.trim();
    if (!clean || !joinedRef.current) return;
    const targetLang = hearLanguage;
    const speakerName = displayName.trim() || 'Guest';
    if (!sendMeetingMessage({ type: 'meeting-transcript', text: clean, sourceLang })) {
      setError('The meeting connection is unavailable. Rejoin before sending speech.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('Translating your completed turn…');
    try {
      const sameLanguage = sourceLang.toLowerCase().split('-')[0] === targetLang.toLowerCase().split('-')[0];
      const result = sameLanguage ? { translatedText: clean, engine: 'identity', latencyMs: 0 }
        : await translateText(clean, sourceLang, targetLang);
      const entry = { sourceText: clean, translatedText: result.translatedText, sourceLang, targetLang, engine: result.engine, latencyMs: result.latencyMs };
      addHistory(entry);
      appendMessage(setMessages, { ...entry, speakerName, createdAt: new Date().toISOString(), id: crypto.randomUUID(), isLocal: true });
      setNotice('Your translated turn was shared with the meeting.');
    } catch (requestError) {
      setError(requestError.message || 'Could not translate your speech. The original transcript was shared.');
    } finally {
      setBusy(false);
      if (joinedRef.current && !microphoneMutedRef.current && speechControlsRef.current?.supported) {
        if (speechBusyRef.current || speechQueueRef.current.length) resumeListeningAfterPlaybackRef.current = true;
        else window.setTimeout(() => {
          if (joinedRef.current) speechControlsRef.current?.startListening(sourceLang);
        }, 180);
      }
    }
  }, [displayName, hearLanguage, sendMeetingMessage, sourceLang]);

  const speech = useSpeechRecognition(onFinalSpeech, undefined, { spectrumEnabled: false });
  useEffect(() => { speechControlsRef.current = speech; }, [speech]);

  useEffect(() => {
    if (autoFinishTimerRef.current) window.clearTimeout(autoFinishTimerRef.current);
    autoFinishTimerRef.current = null;
    if (!autoFinishSpeech || !speech.isListening || !speech.interimText.trim()) return undefined;
    autoFinishTimerRef.current = window.setTimeout(() => {
      autoFinishTimerRef.current = null;
      if (speechControlsRef.current?.isListening) speechControlsRef.current.stopListening();
    }, 2_200);
    return () => {
      if (autoFinishTimerRef.current) window.clearTimeout(autoFinishTimerRef.current);
      autoFinishTimerRef.current = null;
    };
  }, [autoFinishSpeech, speech.interimText, speech.isListening]);

  useEffect(() => {
    if (status !== 'live') {
      return undefined;
    }
    let active = true;
    const updateQuality = async () => {
      const peerConnections = [...peerConnectionsRef.current.values()];
      if (!peerConnections.length) {
        if (active) setConnectionQuality({ level: 'waiting', label: 'Waiting for guest' });
        return;
      }
      let connectedPeers = 0;
      let packetsLost = 0;
      let packetsReceived = 0;
      let jitter = 0;
      let roundTripTime = 0;
      const reports = await Promise.all(peerConnections.map(async (peerConnection) => {
        if (peerConnection.connectionState === 'connected') connectedPeers += 1;
        try { return await peerConnection.getStats(); } catch { return null; }
      }));
      reports.forEach((report) => report?.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
          packetsLost += Math.max(0, stat.packetsLost || 0);
          packetsReceived += stat.packetsReceived || 0;
          jitter = Math.max(jitter, stat.jitter || 0);
        }
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && (stat.selected || stat.nominated)) {
          roundTripTime = Math.max(roundTripTime, stat.currentRoundTripTime || 0);
        }
      }));
      if (!active) return;
      if (!connectedPeers) {
        setConnectionQuality({ level: 'pending', label: 'Connecting' });
        return;
      }
      const lossRate = packetsLost / Math.max(1, packetsLost + packetsReceived);
      const level = lossRate > .08 || jitter > .06 || roundTripTime > .5 ? 'weak'
        : lossRate > .03 || jitter > .03 || roundTripTime > .25 ? 'fair' : 'good';
      const label = level === 'weak' ? 'Weak' : level === 'fair' ? 'Fair' : 'Good';
      const detail = `Packet loss ${Math.round(lossRate * 100)}%, jitter ${Math.round(jitter * 1000)} ms${roundTripTime ? `, RTT ${Math.round(roundTripTime * 1000)} ms` : ''}`;
      setConnectionQuality({ level, label, detail });
    };
    void updateQuality();
    const timer = window.setInterval(updateQuality, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [participants.length, status]);

  const toggleMicrophone = () => {
    const nextMuted = !microphoneMutedRef.current;
    microphoneMutedRef.current = nextMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMicrophoneMuted(nextMuted);
    sendMeetingMessage({ type: 'meeting-state', muted: nextMuted, cameraOff: cameraDisabled });
    if (nextMuted) speechControlsRef.current?.stopListening();
    else if (joinedRef.current && speechControlsRef.current?.supported) speechControlsRef.current.startListening(sourceLang);
  };

  const toggleCamera = () => {
    const nextDisabled = !cameraDisabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !nextDisabled; });
    setCameraDisabled(nextDisabled);
    sendMeetingMessage({ type: 'meeting-state', muted: microphoneMutedRef.current, cameraOff: nextDisabled });
  };

  const toggleAutoFinish = (enabled) => {
    setAutoFinishSpeech(enabled);
    try { localStorage.setItem('awaz.meeting-auto-finish.v1', String(enabled)); } catch { /* The option remains active for this page. */ }
  };

  const prepareMeetingRecap = () => {
    const turns = messages.slice().reverse().slice(-25);
    setRecapTitle(`Meeting ${roomCode} · ${new Date().toLocaleDateString()}`);
    setRecapSummary(turns.map((turn) => `${turn.speakerName}: ${turn.translatedText}`).join('\n'));
    setRecapActionItems('');
    setRecapEditorOpen(true);
  };

  const saveMeetingRecap = () => {
    const title = recapTitle.trim();
    const summary = recapSummary.trim();
    if (!title || !summary) return;
    if (!addMeetingRecap({ title, summary, actionItems: recapActionItems.trim(), roomCode })) {
      setError('Could not save the recap in this browser.');
      return;
    }
    setSavedRecaps(getMeetingRecaps());
    setRecapEditorOpen(false);
    setNotice('Your reviewed meeting recap was saved on this device.');
  };

  const startMeeting = async (createNew) => {
    setError('');
    setNotice('');
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setError('Calls need a browser with microphone, camera, and WebRTC support.');
      return;
    }
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setError('Camera and microphone calls need HTTPS on deployed sites.');
      return;
    }
    const code = createNew ? createRoomCode() : roomInput.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      setError('Meeting codes have eight letters or numbers.');
      return;
    }
    const cleanName = displayName.trim().slice(0, 40) || 'Guest';
    setDisplayName(cleanName);
    try { localStorage.setItem('awaz.meeting-name.v1', cleanName); } catch { /* Name remains available for this meeting. */ }
    setRoomCode(code);
    setConnectionQuality({ level: 'pending', label: 'Connecting' });
    setStatus('connecting');
    try {
      iceServersRef.current = await getMeetingIceServers();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: callMode === 'voice' ? false : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      microphoneMutedRef.current = false;
      setMicrophoneMuted(false);
      setCameraDisabled(false);
      localStreamRef.current = stream;
      setLocalStream(stream);
      intentionalCloseRef.current = false;
      const socket = openMeetingSocket();
      socketRef.current = socket;
      socket.onopen = () => socket.send(JSON.stringify({ type: 'join-room', roomCode: code, mode: callMode, name: cleanName }));
      socket.onmessage = (event) => {
        if (socketRef.current !== socket) return;
        try { void handleServerMessage(JSON.parse(event.data)).catch((messageError) => setError(messageError.message || 'A meeting message could not be processed.')); }
        catch (messageError) { setError(messageError.message || 'A meeting message could not be processed.'); }
      };
      socket.onerror = () => { if (socketRef.current === socket) setError('Could not connect to the meeting service. Check the backend and try again.'); };
      socket.onclose = () => {
        if (socketRef.current !== socket || intentionalCloseRef.current) return;
        if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
        joinedRef.current = false;
        stopActiveSpeech();
        closePeerConnections();
        socketRef.current = null;
        setStatus('idle');
        setError('The meeting connection closed. Rejoin to continue.');
      };
      connectionTimeoutRef.current = window.setTimeout(() => {
        if (socketRef.current !== socket || joinedRef.current) return;
        socketRef.current = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        closePeerConnections();
        setStatus('idle');
        setError('The meeting service did not respond. Check the backend and try again.');
      }, 15_000);
    } catch (requestError) {
      if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
      closePeerConnections();
      setStatus('idle');
      setError(requestError.name === 'NotAllowedError'
        ? 'Microphone or camera access was blocked. Allow access and try again.'
        : requestError.message || 'Could not start the call. Check your devices and try again.');
    }
  };

  const submitTypedMessage = (event) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const text = draft.trim();
    setDraft('');
    void onFinalSpeech(text);
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setNotice('Meeting code copied. Send it to the other participants.');
    } catch { setNotice(`Share this meeting code: ${roomCode}`); }
  };

  const copyInvite = async () => {
    const url = new URL(window.location.href);
    url.hash = `/meetings?room=${encodeURIComponent(roomCode)}&mode=${callMode}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice('Meeting invite link copied.');
    } catch { setNotice(`Share code ${roomCode} and call type ${callMode}.`); }
  };

  useEffect(() => () => {
    joinedRef.current = false;
    intentionalCloseRef.current = true;
    if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = null;
    stopActiveSpeech();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
    closePeerConnections();
    stopTranslatedSpeech();
  }, [closePeerConnections, stopActiveSpeech, stopTranslatedSpeech]);

  const isLive = status === 'live';
  const activeMode = CALL_MODES.find((mode) => mode.id === callMode) || CALL_MODES[0];

  return (
    <div className="workspace-stack horizontal-workspace meetings-page">
      <section className="feature-intro surface-card">
        <div className="feature-intro-mark"><Users size={21} /></div>
        <div><div className="eyebrow accent-eyebrow">LIVE MEETINGS</div><h2>Talk across languages, together.</h2><p>Speak in your language, stop to finish a turn, and each guest hears translated speech in their chosen language. Video calls and group rooms are available.</p></div>
        <span className={`capability-tag${isLive ? ' meeting-live-tag' : ''}`}><span className={isLive ? 'hero-pip' : 'muted-pip'} />{isLive ? 'IN MEETING' : 'ROOMS UP TO SIX'}</span>
      </section>

      {!isLive && <section className="meeting-setup surface-card">
        <div className="pane-heading"><span>START OR JOIN A ROOM</span><span className="language-caption">{status === 'connecting' ? 'Connecting…' : 'Create a private room code'}</span></div>
        <div className="meeting-mode-grid" role="radiogroup" aria-label="Call type">
          {CALL_MODES.map(({ id, label, detail, icon }) => <button type="button" key={id} className={`meeting-mode-option${callMode === id ? ' selected' : ''}`} role="radio" aria-checked={callMode === id} onClick={() => setCallMode(id)} disabled={status === 'connecting'}>{createElement(icon, { size: 18 })}<strong>{label}</strong><small>{detail}</small></button>)}
        </div>
        <div className="meeting-language-grid">
          <label className="field-label">I SPEAK<select value={sourceLang} onChange={(event) => setSourceLang(event.target.value)} disabled={status === 'connecting'}>{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}</select></label>
          <label className="field-label">I WANT TO HEAR<select value={hearLanguage} onChange={(event) => setHearLanguage(event.target.value)} disabled={status === 'connecting'}>{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}</select></label>
        </div>
        <label className="field-label meeting-name-field">YOUR NAME<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} placeholder="Name shown to other participants" disabled={status === 'connecting'} /></label>
        <label className="field-label">ROOM CODE TO JOIN<input value={roomInput} onChange={(event) => setRoomInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} maxLength={8} placeholder="Enter an 8 character code" disabled={status === 'connecting'} /></label>
        <div className="meeting-setup-actions"><button className="primary-button" onClick={() => startMeeting(true)} disabled={status === 'connecting'}><Phone size={16} />Create {activeMode.label.toLowerCase()}</button><button className="secondary-button" onClick={() => startMeeting(false)} disabled={status === 'connecting' || !roomInput.trim()}><Users size={16} />Join room</button></div>
        {error && <div className="inline-message message-error" role="alert">{error}</div>}
        {notice && <div className="inline-message" role="status">{notice}</div>}
      </section>}

      {isLive && <>
        <section className="meeting-call-panel surface-card">
          <div className="meeting-call-heading"><div><div className="eyebrow accent-eyebrow">{callMode.toUpperCase()} CALL</div><h3>Room {roomCode}</h3><p>{participants.length + 1} participant{participants.length === 0 ? '' : 's'} · You speak {sourceLang}, hear {hearLanguage}</p></div><div className="meeting-call-actions"><button className="secondary-button" onClick={copyRoomCode}><Copy size={15} />Copy code</button><button className="secondary-button" onClick={copyInvite}><Copy size={15} />Copy invite</button><button className="danger-button" onClick={leaveMeeting}><Phone size={15} />Leave</button></div></div>
          <div className={`meeting-video-grid${callMode === 'voice' ? ' voice-grid' : ''}`}>
            {callMode !== 'voice' && <article className="meeting-participant local-participant surface-card">{localStream && !cameraDisabled ? <video ref={localVideoRef} autoPlay playsInline muted aria-label="Your video preview" /> : <div className="meeting-avatar">{displayName.slice(0, 1).toUpperCase()}</div>}<div className="meeting-participant-caption"><span>{displayName || 'You'} (you)</span><small>{cameraDisabled ? 'Camera off' : microphoneMuted ? 'Mic muted' : 'Connected'}</small></div></article>}
            {participants.map((participant) => <ParticipantTile key={participant.peerId} participant={participant} hearOriginalAudio={hearOriginalAudio} />)}
            {callMode === 'voice' && !participants.length && <div className="meeting-waiting"><span className="spinner" />Waiting for another participant to join…</div>}
          </div>
          {error && <div className="inline-message message-error" role="alert">{error}</div>}
          {notice && <div className="inline-message" role="status">{notice}</div>}
        </section>

        <section className="meeting-control-strip surface-card">
          <div className={`meeting-quality-chip quality-${connectionQuality.level}`} title={connectionQuality.detail || connectionQuality.label}><Signal size={16} /><span>Call quality</span><strong>{connectionQuality.label}</strong></div>
          <div className="meeting-control-buttons">
            <button className={`secondary-button${microphoneMuted ? ' recording' : ''}`} onClick={toggleMicrophone} aria-pressed={microphoneMuted}>{microphoneMuted ? <MicOff size={15} /> : <Mic size={15} />}{microphoneMuted ? 'Unmute mic' : 'Mute mic'}</button>
            {callMode !== 'voice' && <button className={`secondary-button${cameraDisabled ? ' recording' : ''}`} onClick={toggleCamera} aria-pressed={cameraDisabled}>{cameraDisabled ? <Camera size={15} /> : <CameraOff size={15} />}{cameraDisabled ? 'Turn camera on' : 'Turn camera off'}</button>}
          </div>
        </section>

        <section className="meeting-speech-panel surface-card">
          <div className="pane-heading"><span>YOUR TRANSLATED SPEECH</span><span className="language-caption">Recognized after you stop</span></div>
          <div className="meeting-speech-controls"><button className={`primary-button${speech.isListening ? ' recording' : ''}`} onClick={() => speech.isListening ? speech.stopListening() : speech.startListening(sourceLang)} disabled={!speech.supported || busy}>{speech.isListening ? <CircleStop size={17} /> : <Mic size={17} />}{speech.isListening ? 'Stop & translate this turn' : 'Start listening'}</button>{speech.isListening && <span className="meeting-listening-indicator"><span className="hero-pip" />Listening in {sourceLang}</span>}{busy && <span className="language-caption">Translating…</span>}</div>
          {speech.interimText && <div className="meeting-recognition-preview"><AudioLines size={15} /><span>{speech.interimText}</span></div>}
          {speech.error && <div className="inline-message message-error" role="alert">{speech.error}</div>}
          {!speech.supported && <div className="inline-hint">Live recognition is not supported by this browser. Type a message below to translate it.</div>}
          <label className="meeting-auto-finish"><input type="checkbox" checked={autoFinishSpeech} onChange={(event) => toggleAutoFinish(event.target.checked)} />Auto-finish after a 2.2 second pause</label>
          <form className="meeting-message-form" onSubmit={submitTypedMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} placeholder="Type a message to translate" aria-label="Meeting message" disabled={busy} /><button className="secondary-button" type="submit" disabled={!draft.trim() || busy || !isLive}><Languages size={15} />Send translated message</button></form>
          <label className="meeting-original-audio"><input type="checkbox" checked={hearOriginalAudio} onChange={(event) => setHearOriginalAudio(event.target.checked)} />Hear original participant voices too</label>
        </section>

        <section className="meeting-transcript-panel surface-card">
          <div className="pane-heading"><span>LIVE TRANSLATION CAPTIONS</span><div className="meeting-recap-actions"><span className="language-caption">{messages.length} turn{messages.length === 1 ? '' : 's'}</span><button className="secondary-button" onClick={prepareMeetingRecap} disabled={!messages.length}><BookOpen size={14} />Draft recap</button></div></div>
          {!messages.length ? <div className="empty-inline"><Languages size={17} />Translated turns will appear here for everyone in the room.</div> : <div className="meeting-transcript-list" aria-live="polite">{messages.map((message) => <article className="meeting-transcript-item" key={message.id}><div className="meeting-transcript-heading"><strong>{message.speakerName}{message.isLocal ? ' (you)' : ''}</strong><time>{new Date(message.createdAt).toLocaleTimeString()}</time></div><p className="meeting-original-text">{message.sourceText}</p><p className={message.translationUnavailable ? 'meeting-translation-unavailable' : 'meeting-translated-text'}>{message.translationUnavailable ? 'Translation unavailable; original shown above.' : message.translatedText}</p><small>{message.sourceLang} → {message.targetLang}</small></article>)}</div>}
        </section>
        {recapEditorOpen && <section className="meeting-recap-editor surface-card">
          <div className="pane-heading"><span>REVIEW YOUR RECAP BEFORE SAVING</span><span className="language-caption">Saved only on this device</span></div>
          <label className="field-label">TITLE<input value={recapTitle} onChange={(event) => setRecapTitle(event.target.value)} maxLength={120} /></label>
          <label className="field-label">RECAP FROM TRANSLATED CAPTIONS<textarea value={recapSummary} onChange={(event) => setRecapSummary(event.target.value)} maxLength={10000} rows={7} /></label>
          <label className="field-label">ACTION ITEMS<textarea value={recapActionItems} onChange={(event) => setRecapActionItems(event.target.value)} maxLength={4000} rows={3} placeholder="Add follow-ups or decisions here" /></label>
          <div className="meeting-recap-actions"><button className="primary-button" onClick={saveMeetingRecap} disabled={!recapTitle.trim() || !recapSummary.trim()}>Save reviewed recap</button><button className="secondary-button" onClick={() => setRecapEditorOpen(false)}>Cancel</button></div>
        </section>}
      </>}

      {savedRecaps.length > 0 && <section className="meeting-saved-recaps surface-card">
        <div className="pane-heading"><span>SAVED MEETING RECAPS</span><span className="language-caption">Stored only in this browser</span></div>
        <div className="meeting-saved-recap-list">{savedRecaps.map((recap) => <details className="meeting-saved-recap" key={recap.id}><summary><strong>{recap.title}</strong><time>{new Date(recap.createdAt).toLocaleDateString()}</time></summary><pre>{recap.summary}</pre>{recap.actionItems && <div><strong className="meeting-action-items-title">Action items</strong><pre>{recap.actionItems}</pre></div>}</details>)}</div>
      </section>}
      <p className="meeting-disclosure"><Check size={14} />Translated speech uses each listener’s browser voice. Speech recognition may use your browser’s provider; transcripts pass through the AWAZ backend, while call audio and video use peer to peer WebRTC.</p>
    </div>
  );
}
