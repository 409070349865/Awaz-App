'use strict';

const express = require('express');
const config = require('../config/config');
const { createMeetingIceServers } = require('../services/meetingIce');

const router = express.Router();

router.get('/ice', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ iceServers: createMeetingIceServers(config.turn) });
});

module.exports = router;
