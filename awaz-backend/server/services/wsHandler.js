/**
 * wsHandler.js — WebSocket connection handler
 * ═══════════════════════════════════════════
 *
 * Currently handles:
 *   • Connection lifecycle (open / close / error / ping-pong heartbeat)
 *   • JSON message routing (type: 'translate' → translate and stream back)
 *
 * Future streaming upgrade path:
 *   • Replace the batch translate call with a streaming OpenAI call
 *     that forwards each chunk as a WS message of type 'chunk'.
 *   • Add type: 'stt_audio' to pipe raw PCM from the browser to a
 *     Whisper / Deepgram pipeline and stream back live transcription.
 *
 * Message protocol (client → server):
 *   { type: 'translate', id: '<uuid>', text: '…', sourceLang: 'en', targetLang: 'es' }
 *   { type: 'ping' }
 *
 * Message protocol (server → client):
 *   { type: 'translation', id: '<uuid>', translatedText: '…', latencyMs: 120 }
 *   { type: 'chunk',       id: '<uuid>', chunk: '…' }          ← future streaming
 *   { type: 'error',       id: '<uuid>', code: '…', message: '…' }
 *   { type: 'pong' }
 */

'use strict';

const { translateText } = require('./translator');
const { logger }        = require('../utils/logger');
const { randomUUID } = require('crypto');

// Keep-alive ping interval in ms
const PING_INTERVAL = 30_000;
const MAX_MEETING_PARTICIPANTS = 6;
const MEETING_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i;
const meetingRooms = new Map();

/**
 * Handle a new WebSocket connection.
 * @param {import('ws').WebSocket} ws
 * @param {import('http').IncomingMessage} req
 */
function handleWsConnection(ws) {
  logger.info('[WS] Client connected.');
  ws.meeting = null;

  // ── Heartbeat ────────────────────────────────────────────
  let isAlive = true;
  let windowStartedAt = Date.now();
  let translationCount = 0;
  ws.on('pong', () => { isAlive = true; });

  const pingTimer = setInterval(() => {
    if (!isAlive) {
      logger.warn('[WS] Client did not respond to ping; terminating socket.');
      return ws.terminate();
    }
    isAlive = false;
    ws.ping();
  }, PING_INTERVAL);

  // ── Message handler ──────────────────────────────────────
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', code: 'INVALID_JSON', message: 'Message must be valid JSON.' });
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      return send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Message must be a JSON object.' });
    }

    switch (msg.type) {
      case 'ping':
        return send(ws, { type: 'pong' });

      case 'translate':
        if (Date.now() - windowStartedAt >= 60_000) {
          windowStartedAt = Date.now();
          translationCount = 0;
        }
        translationCount += 1;
        if (translationCount > 30) {
          return send(ws, { type: 'error', id: msg.id || null, code: 'RATE_LIMIT_EXCEEDED', message: 'Too many translation requests. Please wait a moment.' });
        }
        await handleTranslate(ws, msg);
        break;

      case 'join-room':
        return joinMeetingRoom(ws, msg);

      case 'leave-room':
        return leaveMeetingRoom(ws);

      case 'offer':
      case 'answer':
        return relayDescription(ws, msg);

      case 'ice-candidate':
        return relayIceCandidate(ws, msg);

      case 'meeting-transcript':
        return relayMeetingTranscript(ws, msg);

      case 'meeting-state':
        return relayMeetingState(ws, msg);

      // ── Future: stream audio chunks through STT pipeline ─
      // case 'stt_audio':
      //   await handleSttAudio(ws, msg);
      //   break;

      default:
        send(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: `Unknown message type: ${msg.type}` });
    }
  });

  // ── Cleanup ──────────────────────────────────────────────
  ws.on('close', (code) => {
    clearInterval(pingTimer);
    leaveMeetingRoom(ws);
    logger.info(`[WS] Client disconnected (${code}).`);
  });

  ws.on('error', (err) => {
    logger.error(`[WS] Client socket error: ${err.message}`);
  });

  // Send a welcome message so the client knows the WS is live
  send(ws, { type: 'connected', message: 'Awaz WS ready.' });
}

function joinMeetingRoom(ws, msg) {
  const roomCode = typeof msg.roomCode === 'string' ? msg.roomCode.trim().toUpperCase() : '';
  const mode = ['voice', 'video', 'conference'].includes(msg.mode) ? msg.mode : '';
  if (!MEETING_CODE_RE.test(roomCode) || !mode) {
    return send(ws, { type: 'meeting-error', code: 'INVALID_ROOM', message: 'Enter a valid meeting code and call type.' });
  }

  leaveMeetingRoom(ws);
  let room = meetingRooms.get(roomCode);
  if (room && room.mode !== mode) {
    return send(ws, { type: 'meeting-error', code: 'CALL_TYPE_MISMATCH', message: `This room is a ${room.mode} call.` });
  }
  if (!room) {
    room = { mode, members: new Map() };
    meetingRooms.set(roomCode, room);
  }
  const maxParticipants = mode === 'conference' ? MAX_MEETING_PARTICIPANTS : 2;
  if (room.members.size >= maxParticipants) {
    if (room.members.size === 0) meetingRooms.delete(roomCode);
    return send(ws, { type: 'meeting-error', code: 'ROOM_FULL', message: `This ${mode} call is full.` });
  }

  const peerId = randomUUID();
  const name = typeof msg.name === 'string'
    ? msg.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) || 'Guest'
    : 'Guest';
  const existingPeers = [...room.members.values()].map(({ peerId: id, name: peerName, muted, cameraOff }) => ({ peerId: id, name: peerName, muted, cameraOff }));
  const member = { ws, peerId, name, muted: false, cameraOff: false };
  room.members.set(ws, member);
  ws.meeting = { roomCode, peerId };

  send(ws, { type: 'room-joined', roomCode, mode, peerId, peers: existingPeers });
  for (const existing of room.members.values()) {
    if (existing.ws !== ws) send(existing.ws, { type: 'peer-joined', peer: { peerId, name, muted: false, cameraOff: false } });
  }
}

function leaveMeetingRoom(ws) {
  const membership = ws.meeting;
  if (!membership) return;
  ws.meeting = null;
  const room = meetingRooms.get(membership.roomCode);
  if (!room) return;
  room.members.delete(ws);
  for (const member of room.members.values()) send(member.ws, { type: 'peer-left', peerId: membership.peerId });
  if (room.members.size === 0) meetingRooms.delete(membership.roomCode);
}

function getMeetingRecipient(ws, peerId) {
  const membership = ws.meeting;
  if (!membership || typeof peerId !== 'string') return null;
  const room = meetingRooms.get(membership.roomCode);
  if (!room) return null;
  return [...room.members.values()].find((member) => member.peerId === peerId && member.ws !== ws) || null;
}

function relayDescription(ws, msg) {
  const target = getMeetingRecipient(ws, msg.to);
  const description = msg.description;
  if (!target || !description || !['offer', 'answer'].includes(description.type)
    || typeof description.sdp !== 'string' || description.sdp.length > 50_000) {
    return send(ws, { type: 'meeting-error', code: 'INVALID_SIGNAL', message: 'Could not send the call setup message.' });
  }
  send(target.ws, { type: msg.type, from: ws.meeting.peerId, description });
}

function relayIceCandidate(ws, msg) {
  const target = getMeetingRecipient(ws, msg.to);
  const candidate = msg.candidate;
  if (!target || !candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4_096) {
    return send(ws, { type: 'meeting-error', code: 'INVALID_SIGNAL', message: 'Could not send the network connection candidate.' });
  }
  send(target.ws, { type: 'ice-candidate', from: ws.meeting.peerId, candidate });
}

function relayMeetingTranscript(ws, msg) {
  const membership = ws.meeting;
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  const sourceLang = typeof msg.sourceLang === 'string' ? msg.sourceLang : '';
  if (!membership || !text || text.length > 5_000 || !LANGUAGE_RE.test(sourceLang)) {
    return send(ws, { type: 'meeting-error', code: 'INVALID_TRANSCRIPT', message: 'Could not share that speech turn.' });
  }
  const now = Date.now();
  if (!ws.meetingWindowStartedAt || now - ws.meetingWindowStartedAt >= 60_000) {
    ws.meetingWindowStartedAt = now;
    ws.meetingTranscriptCount = 0;
  }
  ws.meetingTranscriptCount += 1;
  if (ws.meetingTranscriptCount > 30) {
    return send(ws, { type: 'meeting-error', code: 'RATE_LIMIT_EXCEEDED', message: 'Too many speech turns. Wait a moment and try again.' });
  }
  const room = meetingRooms.get(membership.roomCode);
  if (!room) return;
  const speaker = room.members.get(ws);
  for (const member of room.members.values()) {
    if (member.ws !== ws) send(member.ws, {
      type: 'meeting-transcript', from: speaker.peerId, speakerName: speaker.name,
      text, sourceLang, createdAt: new Date().toISOString(),
    });
  }
}

function relayMeetingState(ws, msg) {
  const membership = ws.meeting;
  if (!membership || typeof msg.muted !== 'boolean' || typeof msg.cameraOff !== 'boolean') return;
  const room = meetingRooms.get(membership.roomCode);
  const speaker = room?.members.get(ws);
  if (!room || !speaker) return;
  speaker.muted = msg.muted;
  speaker.cameraOff = msg.cameraOff;
  for (const member of room.members.values()) {
    if (member.ws !== ws) send(member.ws, {
      type: 'meeting-state', peerId: speaker.peerId,
      muted: speaker.muted, cameraOff: speaker.cameraOff,
    });
  }
}

/**
 * Handle a 'translate' WS message.
 * @param {import('ws').WebSocket} ws
 * @param {{ id?: string, text: string, sourceLang: string, targetLang: string }} msg
 */
async function handleTranslate(ws, msg) {
  const { id = null, text, sourceLang, targetLang } = msg;

  if (typeof text !== 'string' || !text.trim() || text.length > 5000 ||
      typeof sourceLang !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i.test(sourceLang) ||
      typeof targetLang !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i.test(targetLang)) {
    return send(ws, {
      type: 'error', id,
      code: 'MISSING_FIELDS',
      message: 'text, sourceLang, and targetLang are required.',
    });
  }

  const t0 = Date.now();
  try {
    const result = await translateText(text.trim(), String(sourceLang).split('-')[0].toLowerCase(), String(targetLang).split('-')[0].toLowerCase());
    const latencyMs = Date.now() - t0;
    send(ws, { type: 'translation', id, translatedText: result.translatedText, latencyMs, engine: result.engine });
  } catch (err) {
    send(ws, { type: 'error', id, code: err.code || 'TRANSLATION_FAILED', message: err.message });
  }
}

/**
 * Safe JSON send — no-op if socket is not open.
 * @param {import('ws').WebSocket} ws
 * @param {object} data
 */
function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

module.exports = { handleWsConnection };
