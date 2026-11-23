# AWAZ additive AI integration plan

## Protected base and scope

AWAZ remains the protected base application. The valid pre-change source backup is `AWAZ-protected-base-before-ai-2026-11-23.zip` (the workspace also contains the original `AWAZ-2.0.zip`). Existing files, routes, translation workflows, storage settings and navigation pages remain in place. No login, account feature, new runtime dependency, new MongoDB collection or audio persistence is introduced.

The current source tree contains these workflows:

- Frontend routes: Translate `/`, Live conversation `/conversation`, Vision `/vision`, Speak `/speak`, History `/history`, Insights `/insights`, Settings `/settings`.
- Backend routes: `GET /health`, `GET /languages`, `POST /translate`, `GET/DELETE /history`, and JSON translation/ping over `/ws`.
- Existing frontend modules: `Layout`, `Sidebar`, `HomeView`, `ConversationView`, `VisionView`, `PracticeView`, `HistoryInsightsViews`, `ControlViews`, `lib/api.js`, `lib/storage.js`, speech hooks, language data and the voice spectrum.
- Existing backend: Express, translation route and provider adapters, WebSocket handler, optional Mongoose `Translation` history, request/security middleware and environment configuration.
- Existing dependencies: React/Vite/Lucide/Tesseract in the frontend; Express/Mongoose/WebSocket/security middleware in the backend. Package manifests and lockfiles are unchanged.

## Integration plan and file map

| Capability | Existing files reused or modified | New files | Fallback when optional AI is unavailable |
| --- | --- | --- | --- |
| Translation verification | `HomeView.jsx`, `App.css`, `lib/api.js`; backend `server.js`, `config.js`, `.env.example` | `TranslationVerificationPanel.jsx`, `server/routes/aiFeatures.js`, `server/services/aiFeatures/openaiClient.js`, `verification.js` | Deterministic quantity/date/currency/unit checks; result stays inconclusive if semantic review cannot run. Regular `/translate` is unchanged. |
| Word/phrase code-switch analysis | `HomeView.jsx`, `App.css`, `lib/api.js`; `server.js`, `config.js`, `.env.example` | `CodeSwitchPanel.jsx`, shared AI route/client, `server/services/aiFeatures/codeSwitch.js` | Approximate script grouping and existing translation adapters; Latin words remain language-unknown without AI. |
| Dubbing and consented voice workflow | `App.jsx`, `App.css`, `Sidebar.jsx`, `Layout.jsx`, `lib/api.js`; `server.js`, `config.js`, `.env.example` | `DubbingView.jsx`, shared AI route/client, `server/services/aiFeatures/dubbing.js` | Existing browser speech synthesis can play the translated transcript. Standard translation and other app pages remain independent. |

Documentation and regression coverage: update `README.md`, `ARCHITECTURE.md`, `AI_ENGINE.md`, `API_DOCUMENTATION.md`, `PRIVACY.md`, `ROADMAP.md`, `DEPLOYMENT.md`, `DEVELOPMENT_GUIDE.md`, and `awaz-backend/README.md`; add `awaz-backend/tests/aiFeatures.test.js`.

The server mounts all additions under `/ai`. Existing history uses its current `Translation` model only when the user's history setting explicitly allows saving translated text. Audio inputs, transcripts and generated audio are not written to a database or filesystem by AWAZ. Provider-side processing and custom voice/consent records are controlled by provider settings and policies.

## Regression verification

After each integration group, run the relevant frontend build/lint/tests and backend lint/tests. The final checks for this implementation passed:

- Frontend: `npm run lint`, `npm run build`, `npm test` — 5 tests passed.
- Backend: `npm run check` — lint passed and 21 tests passed, including 12 optional AI endpoint/service tests and the existing translation API regression tests.
- Local preview: Vite returned HTTP 200 at `http://localhost:5173/`; backend `/health` and `/ai/capabilities` returned successfully at `http://localhost:3000`.

Live paid-provider behavior, browser microphone permissions and recording-based custom voice eligibility remain dependent on the deployment and provider account.
