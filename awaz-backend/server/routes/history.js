'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Translation = require('../models/Translation');

function validDeviceId(deviceId) {
  return typeof deviceId === 'string' && /^[a-f0-9-]{36}$/i.test(deviceId);
}

// GET /history
router.get('/', async (req, res, next) => {
  try {
    const { deviceId } = req.query;
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A valid browser storage ID is required.' });
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: 'HISTORY_UNAVAILABLE', message: 'Cloud history is unavailable.' });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const history = await Translation.find({ deviceId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
      
    res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    const { deviceId, id } = req.query;
    if (!validDeviceId(deviceId)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A valid browser storage ID is required.' });
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: 'HISTORY_UNAVAILABLE', message: 'Cloud history is unavailable.' });
    const filter = { deviceId };
    if (id && !mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid history entry ID.' });
    if (id) filter._id = id;
    const result = await Translation.deleteMany(filter);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
