'use strict';

const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const config     = require('../config/config');
const { logger } = require('../utils/logger');

function buildCorsOptions() {
  if (config.allowedOrigins === '*') {
    return {
      origin: '*',
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    };
  }

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (config.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] Blocked origin: ${origin}`);
        callback(Object.assign(new Error('CORS origin is not allowed.'), { status: 403, code: 'CORS_ORIGIN_NOT_ALLOWED' }));
      }
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    optionsSuccessStatus: 204,
  };
}

const limiter = rateLimit({
  windowMs:        config.rateLimit.windowMs,
  max:             config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    error:   'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please slow down.',
  },
  handler(req, res, next, options) {
    logger.warn(`[RateLimit] Request limit reached on ${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

function securityMiddleware(app) {
  // Helmet
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https:', 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  // Trust proxy
  app.set('trust proxy', 1);

  // ✅ CORS (this alone is enough)
  app.use(cors(buildCorsOptions()));

  // ❌ REMOVE THIS LINE (causing your crash)
  // app.options('*', cors(buildCorsOptions()));

  // ✅ Optional safe alternative (if needed)
  // app.options('/*', cors(buildCorsOptions()));

  // Rate limiting
  app.use(limiter);
}

module.exports = securityMiddleware;
