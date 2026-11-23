# AWAZ backend

Express API for AWAZ 2.0. The service can start without MongoDB; MongoDB is only required for explicitly enabled cloud history.

## Run

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

Run `npm start` for production. The backend serves `../Awaz-frontend/dist` when that frontend build exists. Node.js 20.19 or newer is required.

## Environment

Configure `.env` on the backend only. `TRANSLATE_ENGINE` selects the default provider. `TRANSLATE_FALLBACKS` supplies ordered fallback adapters and defaults to `freegoogle,libretranslate`. FreeGoogle is an undocumented public endpoint. The default public LibreTranslate endpoint requires `LIBRETRANSLATE_APIKEY`; without it, AWAZ skips that endpoint and tries the next configured provider. Self-hosted LibreTranslate instances may not require a key.

Add `MONGO_URI` only for legacy cloud-history API clients. The AWAZ frontend keeps translation history in browser storage. `OPENAI_API_KEY` is used for contextual translations when OpenAI is selected.

See the root [README](../README.md), [API documentation](../API_DOCUMENTATION.md), [AI engine notes](../AI_ENGINE.md), [privacy](../PRIVACY.md), and [deployment guide](../DEPLOYMENT.md).

The optional translation review, mixed-language analysis and `/ai/dub/*` API routes also use `OPENAI_API_KEY`. Configure `OPENAI_ANALYSIS_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_SPEECH_MODEL`, `AI_REQUEST_TIMEOUT_MS` and `AI_AUDIO_MAX_BYTES` as needed. Audio is forwarded to the provider only on an explicit user action and is not stored by AWAZ. Recording-based custom voices require provider eligibility and explicit adult-speaker consent; removing a local voice ID does not remove provider-side records.

## API routes

- `GET /health`
- `GET /languages`
- `POST /translate`
- `GET /history?deviceId=...`
- `DELETE /history?deviceId=...`
- `GET /meeting/ice` returns STUN and optional short-lived TURN credentials for WebRTC.
- `GET /ai/capabilities`
- `POST /ai/verify`
- `POST /ai/code-switch`
- `POST /ai/dub/transcribe` (raw audio body)
- `POST /ai/dub/speech`
- `GET /ai/dub/consent-phrases`
- `POST /ai/dub/voice-consents` and `POST /ai/dub/voices` (raw audio bodies)
- WebSocket `/ws` for JSON translation, ping, meeting signaling and in-memory transcript relay; audio/video frames use peer-to-peer WebRTC

For TURN fallback, configure coturn with REST shared-secret authentication and set `TURN_SERVER_URLS`, `TURN_SHARED_SECRET`, and optionally `TURN_CREDENTIAL_TTL_SECONDS` in the backend environment. Never expose the shared secret to the frontend.

## Checks

```powershell
npm run lint
npm test
npm run check
```

MongoDB, provider APIs, browser speech and camera behavior require separate integration/manual verification in the deployment environment.
