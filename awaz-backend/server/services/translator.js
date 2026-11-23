'use strict';

const config = require('../config/config');
const { logger } = require('../utils/logger');

// ── Engine adapters ──────────────────────────────────────────
const engines = {
  libretranslate: require('./engines/libreTranslate'),
  freegoogle: require('./engines/freegoogle'),
  google: require('./engines/google'),
  deepl: require('./engines/deepl'),
  openai: require('./engines/openai'),
};

async function translateText(text, sourceLang, targetLang, options = {}) {
  const requestedEngine = options.engine || config.translateEngine;
  const engineName = engines[requestedEngine] ? requestedEngine : null;
  if (!engineName) {
    const err = new Error(`Unknown translation engine: "${requestedEngine}".`);
    err.code = 'ENGINE_UNAVAILABLE';
    throw err;
  }

  const contextHistory = Array.isArray(options.contextHistory) ? options.contextHistory.slice(-6) : [];
  const contextual = ((options.contextMode && options.contextMode !== 'general') || contextHistory.length > 0) && engineName === 'openai';
  const candidates = [engineName, ...config.fallbackEngines]
    .filter((name, index, list) => engines[name] && list.indexOf(name) === index);
  let lastError;

  for (const name of candidates) {
    const startedAt = Date.now();
    try {
      logger.info(`[Translator] engine=${name} ${sourceLang}→${targetLang} chars=${text.length}`);
      const result = await engines[name].translate(text, sourceLang, targetLang, {
        contextMode: contextual ? options.contextMode : 'general',
        contextHistory: contextual ? contextHistory : [],
      });
      const latencyMs = Date.now() - startedAt;
      logger.info(`[Translator] engine=${name} completed in ${latencyMs}ms`);
      return { translatedText: result, engine: name, latencyMs, contextApplied: contextual && name === 'openai' };
    } catch (error) {
      lastError = error;
      logger.warn(`[Translator] engine=${name} failed (${error.code || 'UNKNOWN'}); trying configured fallback if available.`);
    }
  }

  throw lastError || new Error('No translation provider is configured.');
}

function getEngineStatus() {
  return Object.keys(engines).map((name) => {
    let librePublicEndpoint = false;
    if (name === 'libretranslate') {
      try { librePublicEndpoint = /(^|\.)libretranslate\.com$/i.test(new URL(config.libreTranslate.url).hostname); } catch { /* invalid provider URLs are handled by the adapter */ }
    }
    const credentialRequired = ['google', 'deepl', 'openai'].includes(name) || librePublicEndpoint;
    const credentialsConfigured = name === 'google' ? Boolean(config.google.apiKey)
      : name === 'deepl' ? Boolean(config.deepl.apiKey)
        : name === 'openai' ? Boolean(config.openai.apiKey)
          : name === 'libretranslate' && librePublicEndpoint ? Boolean(config.libreTranslate.apiKey) : false;
    return {
      name,
      available: true,
      credentialRequired,
      configured: !credentialRequired || credentialsConfigured,
      selected: name === config.translateEngine,
    };
  });
}

module.exports = { translateText, getEngineStatus };
