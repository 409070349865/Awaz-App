'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createMeetingIceServers } = require('../server/services/meetingIce');

test('returns STUN only when TURN is not configured', () => {
  assert.deepEqual(createMeetingIceServers(), [{ urls: 'stun:stun.l.google.com:19302' }]);
  assert.deepEqual(createMeetingIceServers({ urls: ['turn:turn.example.com:3478'] }), [{ urls: 'stun:stun.l.google.com:19302' }]);
});

test('issues expiring coturn shared-secret credentials without returning the secret', () => {
  const secret = 'backend-only-secret';
  const expiresAt = Math.floor(Date.UTC(2026, 0, 1) / 1000) + 600;
  const servers = createMeetingIceServers({
    urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349?transport=tcp'],
    sharedSecret: secret,
    credentialTtlSeconds: 600,
    now: Date.UTC(2026, 0, 1),
  });

  assert.equal(servers.length, 2);
  assert.equal(servers[1].username, `${expiresAt}:awaz`);
  assert.equal(servers[1].credential, createHmac('sha1', secret).update(`${expiresAt}:awaz`).digest('base64'));
  assert.deepEqual(servers[1].urls, ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349?transport=tcp']);
  assert.equal(JSON.stringify(servers).includes(secret), false);
});
