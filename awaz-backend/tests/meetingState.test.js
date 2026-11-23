'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');
const { handleWsConnection } = require('../server/services/wsHandler');

let server;
let webSocketServer;
let baseUrl;

test.before(async () => {
  server = http.createServer();
  webSocketServer = new WebSocketServer({ server, path: '/ws' });
  webSocketServer.on('connection', (socket) => handleWsConnection(socket));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `ws://127.0.0.1:${server.address().port}/ws`;
});

test.after(async () => {
  for (const socket of webSocketServer.clients) socket.terminate();
  await new Promise((resolve) => webSocketServer.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

function nextMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for meeting message.')), 3_000);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

async function connectClient() {
  const socket = new WebSocket(baseUrl);
  await nextMessage(socket, (message) => message.type === 'connected');
  return socket;
}

test('relays participant mute and camera state only inside the meeting room', async (t) => {
  const first = await connectClient();
  const second = await connectClient();
  t.after(() => {
    first.terminate();
    second.terminate();
  });

  const firstJoined = nextMessage(first, (message) => message.type === 'room-joined');
  first.send(JSON.stringify({ type: 'join-room', roomCode: 'ABCD2345', mode: 'video', name: 'First' }));
  const joined = await firstJoined;
  assert.equal(joined.peers.length, 0);

  const secondJoined = nextMessage(second, (message) => message.type === 'room-joined');
  const firstNotified = nextMessage(first, (message) => message.type === 'peer-joined');
  second.send(JSON.stringify({ type: 'join-room', roomCode: 'ABCD2345', mode: 'video', name: 'Second' }));
  const [secondRoom, peerJoined] = await Promise.all([secondJoined, firstNotified]);
  assert.equal(secondRoom.peers[0].name, 'First');
  assert.equal(peerJoined.peer.name, 'Second');

  const state = nextMessage(second, (message) => message.type === 'meeting-state');
  first.send(JSON.stringify({ type: 'meeting-state', muted: true, cameraOff: true }));
  const relayed = await state;
  assert.equal(relayed.peerId, joined.peerId);
  assert.equal(relayed.muted, true);
  assert.equal(relayed.cameraOff, true);
});
