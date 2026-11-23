# AWAZ frontend

React and Vite client for the AWAZ multilingual communication workspace. It contains no login or account screens.

## Run locally

```powershell
npm ci
npm run dev
```

Vite serves the app, normally at `http://localhost:5173`, and proxies API requests and meeting WebSockets to `http://localhost:3000`. Start the backend separately from `../awaz-backend`.

## Build and checks

```powershell
npm run build
npm run lint
npm test
npm run preview
```

The browser needs a backend for text translation and meeting room signaling. Translation history is stored locally in the browser. Set `VITE_API_BASE_URL` at build time when the API is on another origin. Deployed calls require HTTPS and WebSocket support. Never put provider credentials in a Vite environment variable.

Speech recognition/synthesis and camera access depend on browser permissions and support. OCR uses Tesseract.js in the browser and may download language data the first time. See the root project README and privacy documentation for feature limits and data behavior.
