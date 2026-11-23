'use strict';

const http = require('http');
const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');

const config = require('./config/config');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { logger } = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const securityMiddleware = require('./middleware/security');

const translateRouter = require('./routes/translate');
const languagesRouter = require('./routes/languages');
const healthRouter = require('./routes/health');
const historyRouter = require('./routes/history');
const aiFeaturesRouter = require('./routes/aiFeatures');
const meetingRouter = require('./routes/meeting');

// Initialize MongoDB
connectDB();

const { handleWsConnection } = require('./services/wsHandler');

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (socket, req) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins !== '*' && !config.allowedOrigins.includes(origin)) {
    socket.close(1008, 'Origin is not allowed.');
    return;
  }
  handleWsConnection(socket, req);
});
wss.on('error', (err) => logger.error('[WSS] Server error:', err.message));

mongoose.connection.on('disconnected', () => logger.warn('[MongoDB] Connection lost; cloud history is unavailable.'));
mongoose.connection.on('reconnected', () => logger.info('[MongoDB] Connection restored.'));

securityMiddleware(app);

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

app.use(requestLogger);

// Serve the frontend static files
app.use(express.static(path.join(__dirname, '../../Awaz-frontend/dist')));

app.use('/health', healthRouter);
app.use('/languages', languagesRouter);
app.use('/translate', translateRouter);
app.use('/history', historyRouter);
app.use('/ai', aiFeaturesRouter);
app.use('/meeting', meetingRouter);

// Catch-all route to serve React index.html for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || ['/health', '/translate', '/history', '/languages', '/ai', '/meeting'].some(pathname => req.path === pathname || req.path.startsWith(`${pathname}/`))) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../../Awaz-frontend/dist/index.html'));
});

app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} does not exist.`,
  });
});

app.use(errorHandler);

server.listen(config.port, () => {
  logger.info(`
╔══════════════════════════════════════════════════╗
║   AWAZ (آواز) Backend — Production Server        ║
╠══════════════════════════════════════════════════╣
║  HTTP  → http://localhost:${config.port}          ║
║  WS    → ws://localhost:${config.port}            ║
║  Engine→ ${config.translateEngine}                 ║
║  Env   → ${config.env}                             ║
╚══════════════════════════════════════════════════╝
`);
});

const shutdown = (signal) => {
  logger.info(`[Server] ${signal} received — shutting down gracefully…`);

  server.close(() => {
    logger.info('[Server] HTTP server closed.');

    wss.close(() => {
      logger.info('[Server] WebSocket server closed.');
      process.exit(0);
    });
  });

  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('[Uncaught]', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('[Unhandled]', err);
  process.exit(1);
});

module.exports = { app, server };
