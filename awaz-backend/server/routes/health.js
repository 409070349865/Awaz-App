/**
 * routes/health.js — GET /health
 * ════════════════════════════════
 * Lightweight health-check endpoint.
 * Used by load balancers, uptime monitors (e.g. UptimeRobot),
 * and container orchestrators (Docker/Kubernetes liveness probes).
 *
 * Response:
 *   200 { status: 'ok', engine: '…', uptime: 42.3, timestamp: '…' }
 */

'use strict';

const { Router } = require('express');
const config     = require('../config/config');
const mongoose   = require('mongoose');
const engines    = require('../services/translator').getEngineStatus;
const START_TIME = Date.now();

const router = Router();

router.get('/', (req, res) => {
  const providers = engines();
  res.json({
    status:    mongoose.connection.readyState === 1 ? 'ok' : 'degraded',
    service:   'Awaz Translation API',
    engine:    config.translateEngine,
    database:  mongoose.connection.readyState === 1 ? 'connected' : 'unavailable',
    providers,
    env:       config.env,
    uptime:    parseFloat(((Date.now() - START_TIME) / 1000).toFixed(1)),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
