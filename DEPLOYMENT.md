# Deployment

## Single-origin deployment

1. Use Node.js 20.19+.
2. Configure `awaz-backend/.env` with production values. Set `ALLOWED_ORIGINS` to the deployed site's exact origin. Add MongoDB and provider settings if using cloud history or keyed engines.
3. In `Awaz-frontend`, run `npm ci` then `npm run build`.
4. In `awaz-backend`, run `npm ci --omit=dev` then `npm start`.
5. The backend serves the frontend build from `Awaz-frontend/dist`, reports `/health` and accepts WebSocket connections at `/ws`.

The host must provide persistent environment configuration, HTTPS, and WebSocket support for meetings. Browsers require a secure context for microphone and camera access. WebRTC starts with a public STUN server. For networks that block direct peer connections, configure a coturn relay with REST shared-secret mode and set `TURN_SERVER_URLS` plus `TURN_SHARED_SECRET` on the backend. AWAZ returns short-lived relay credentials from `GET /meeting/ice`; do not put the shared secret in a `VITE_` variable.

## Separate frontend and backend

Build the static frontend with `VITE_API_BASE_URL` set to the backend origin, for example `https://api.example.com`. Set the backend `ALLOWED_ORIGINS` to the frontend origin. Do not use a `VITE_` prefix for secrets; Vite embeds prefixed values in client assets.

GitHub Pages deploys only the frontend. Add a GitHub Actions repository variable named `VITE_API_BASE_URL` containing a reachable backend origin. Without it, the built site makes same-origin API requests to GitHub Pages and translation will not work.

## Environment checklist

- `NODE_ENV=production`
- `PORT` set by the host or `3000`
- Exact `ALLOWED_ORIGINS`
- `MONGO_URI` only when cloud history is offered
- `TRANSLATE_ENGINE` and `TRANSLATE_FALLBACKS`
- Required backend only provider keys
- Optional `OPENAI_API_KEY` and AI model/timeout/audio limit settings for review, code-switch analysis and optional audio API routes
- `REQUEST_TIMEOUT_MS`, `RATE_LIMIT_MAX`, `LOG_LEVEL`
- Frontend `VITE_API_BASE_URL` for split hosting
- Optional `TURN_SERVER_URLS`, `TURN_SHARED_SECRET`, and `TURN_CREDENTIAL_TTL_SECONDS` for meeting relay fallback

The `.env.example` file contains the full list. Keep `.env` out of source control. Do not log API keys or translation request bodies.

The AI additions are optional. Without `OPENAI_API_KEY`, standard text translation and the non-AI review/script fallbacks remain available. Transcription, generated speech and recording-based custom voices require the key; custom voices also require eligible provider access and explicit adult-speaker consent. Audio bytes are sent to OpenAI only when the user invokes those actions. Configure provider retention and access settings for the deployment.

## Health checks and limits

`GET /health` returns `status: degraded` when MongoDB is not connected. That condition disables cloud history, not ordinary translation. Provider status in health reports adapter and credential configuration only; it does not test real provider availability. Use a deployment monitor to call `/health` and separately verify the configured provider from an operator-controlled environment.

Rate limits use in-memory Express storage and are per process. For a multi-instance deployment, use a shared rate-limit store or an upstream gateway. `trust proxy` is configured for a single trusted reverse proxy; adjust it to match the hosting topology.

## Database

MongoDB is optional until Cloud history is enabled. Use a production MongoDB deployment with network access limited to the backend, least-privilege credentials and backups. The schema stores only opted-in translations and a browser UUID; it does not implement account-level authorization.

## Hosting note

The frontend workflow can publish static assets to GitHub Pages, but the backend still needs a Node-capable host. No free-tier service or provider is guaranteed to remain free.
