# Development guide

## Repository layout

```text
Awaz-app-main/
├── Awaz-frontend/       React/Vite application
├── awaz-backend/        Express API, providers, MongoDB model
├── .github/workflows/   Static frontend deployment
├── ARCHITECTURE.md
├── AI_ENGINE.md
├── API_DOCUMENTATION.md
├── PRIVACY.md
├── DEPLOYMENT.md
└── ROADMAP.md
```

The workspace uses separate npm projects and lockfiles. Install dependencies with `npm ci` in each directory. The frontend Vite config proxies API requests to `localhost:3000` while developing.

## Commands

```powershell
# Frontend
cd Awaz-frontend
npm run dev
npm run build
npm run lint
npm test

# Backend
cd ..\awaz-backend
npm run dev
npm start
npm run lint
npm test
npm run check
```

`npm run check` runs backend lint and Node's built in test runner. Frontend lint, tests and production build are separate commands.

## Tests

Backend tests exercise translation request validation and provider behavior, plus AI translation review, mixed-language fallback, transcription, speech output and custom voice consent. Frontend tests verify the language catalog, context modes and history storage. They do not exercise actual provider services or browser microphone/camera behavior.

Before a release, also manually check microphone and camera permissions, browser speech support, Tesseract model download, configured providers, Mongo cloud history, mobile layout and deployed CORS behavior.

## Adding an interface section

1. Add a page under `src/pages/` and route it in `src/App.jsx`.
2. Add its navigation item and route heading in `Sidebar.jsx` and `Layout.jsx`.
3. Use the shared API client in `src/lib/api.js`; keep secrets on the backend.
4. Add explicit privacy behavior for any saved text. Default to no server persistence.
5. Document whether the feature is browser, provider or model dependent.

## Adding a backend endpoint or provider

Validate request fields and size before making a provider call. Use environment based credentials from `server/config/config.js`, provider timeouts, a safe structured error and no prompt or translated text in logs. Add the endpoint to the API documentation and tests. For database features, require explicit opt in and scope records to the browser ID; there are no user accounts.

The additive AI integrations reuse the existing Translate page, API client, translation adapters and history model. Their modules are `TranslationVerificationPanel.jsx`, `CodeSwitchPanel.jsx`, `DubbingView.jsx` and the backend `server/routes/aiFeatures.js` plus `server/services/aiFeatures/`. Keep `/translate` usable when AI configuration is absent; do not add collections for audio or transcripts.

## Error handling

Translation failures should stay visible and actionable. Do not return the source text prefixed with an offline label, a made up fallback translation or an ungrounded confidence score. Keep UI claims aligned with the implementation. If a third party feature is unavailable, render a clear provider or browser capability message.

## Style and accessibility

Keep all actions keyboard reachable, label controls, use the live status area for results/errors, maintain readable contrast and respect the app's reduced motion setting. Keep mobile layouts usable without relying on hover.
