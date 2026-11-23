'use strict';

const config = require('../../config/config');

function aiError(message, code = 'AI_PROVIDER_UNAVAILABLE', status = 503) {
  return Object.assign(new Error(message), { code, status });
}

async function openAiFetch(path, fetchOptions = {}) {
  if (!config.openai.apiKey) throw aiError('Optional AI features need OPENAI_API_KEY configured on the backend.');
  const requestOptions = fetchOptions.fetchOptions || fetchOptions;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.aiRequestTimeoutMs || 45_000);
  try {
    const response = await fetch(`https://api.openai.com/v1${path}`, {
      ...requestOptions,
      headers: { Authorization: `Bearer ${config.openai.apiKey}`, ...requestOptions.headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401) throw aiError('OpenAI rejected OPENAI_API_KEY. Replace it in the backend environment and restart the backend.', 'AI_AUTHENTICATION_FAILED', 503);
      if (response.status === 403 || response.status === 404) throw aiError('The configured OpenAI model or feature is unavailable to this API project.', 'AI_FEATURE_UNAVAILABLE', 503);
      if (response.status === 429) throw aiError('OpenAI rate limits or project quota stopped this request. Check the API project limits and retry.', 'AI_RATE_LIMITED', 503);
      throw aiError('The configured AI provider could not complete this request.', 'AI_PROVIDER_ERROR', 502);
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw aiError('The AI provider request timed out.', 'AI_PROVIDER_TIMEOUT', 504);
    if (error.code) throw error;
    throw aiError('The AI provider could not be reached.', 'AI_PROVIDER_UNAVAILABLE', 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function completeJson(messages, maxTokens = 1400) {
  const response = await openAiFetch('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.openai.analysisModel || config.openai.model,
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw aiError('The AI provider returned an empty result.', 'AI_PROVIDER_ERROR', 502);
  try { return JSON.parse(content); } catch { throw aiError('The AI provider returned an unreadable result.', 'AI_PROVIDER_ERROR', 502); }
}

module.exports = { aiError, completeJson, openAiFetch };
