'use strict';

const { createHmac } = require('crypto');

const STUN_SERVER = { urls: 'stun:stun.l.google.com:19302' };

function createMeetingIceServers({ urls = [], sharedSecret = '', credentialTtlSeconds = 3_600, now = Date.now() } = {}) {
  const iceServers = [STUN_SERVER];
  if (!urls.length || !sharedSecret) return iceServers;

  const expiresAt = Math.floor(now / 1000) + credentialTtlSeconds;
  const username = `${expiresAt}:awaz`;
  const credential = createHmac('sha1', sharedSecret).update(username).digest('base64');
  iceServers.push({ urls, username, credential });
  return iceServers;
}

module.exports = { createMeetingIceServers };
