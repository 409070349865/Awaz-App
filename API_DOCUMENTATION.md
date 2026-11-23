# AWAZ API

All HTTP endpoints are mounted at the backend origin. JSON request bodies are limited to 50 KiB; documented raw-audio routes have their own stricter size limits. The translation endpoint accepts at most 5,000 characters. The browser Vite server proxies these paths during local development.

## `GET /health`

Returns backend liveness, database connection state, default engine, uptime and adapter credential status. `status: "degraded"` means MongoDB is not connected; text translation can still work, but opt-in cloud history is unavailable. Provider configuration is not a live endpoint probe.

## `GET /languages`

Returns language display names and ISO language codes. Engine support depends on the selected provider and pair.

## `GET /meeting/ice`

Returns ICE server configuration for WebRTC calls with `Cache-Control: no-store`. It always includes the public STUN server. When `TURN_SERVER_URLS` and `TURN_SHARED_SECRET` are configured on the backend, it also returns coturn REST credentials that expire after `TURN_CREDENTIAL_TTL_SECONDS` (default one hour). The shared secret is never sent to the browser.

## `POST /translate`

Request:

```json
{
  "text": "Could you help me?",
  "sourceLang": "en-US",
  "targetLang": "hi-IN",
  "contextMode": "polite",
  "engine": "openai",
  "contextHistory": [],
  "saveHistory": false
}
```

`contextMode` defaults to `general`. Allowed modes are general, casual, professional, business, travel, academic, healthcare, friendly, polite, formal, emotional and slang. `engine` may be omitted to use the backend default. `contextHistory` is optional, limited to six short turns and applied only when OpenAI is selected.

Cloud history is off unless `saveHistory` is explicitly `true`. An opted-in request also needs a random browser `deviceId` UUID. If MongoDB is unavailable or a cloud write fails, translation still succeeds and returns `stored: false`; the frontend reports that the history save did not complete.

Success:

```json
{
  "translatedText": "क्या आप मेरी मदद कर सकते हैं?",
  "engine": "openai",
  "latencyMs": 420,
  "contextApplied": true,
  "stored": false
}
```

Common errors are `400 VALIDATION_ERROR` / `MISSING_FIELDS`, `429 RATE_LIMIT_EXCEEDED`, `502 TRANSLATION_FAILED`, `503 ENGINE_UNAVAILABLE`, and `504 TRANSLATION_TIMEOUT`. Failed providers never return a placeholder translation.

## Optional AI features

All `/ai/*` routes have a shared limit of 15 requests per minute per client. They require `OPENAI_API_KEY` except deterministic verification checks and script-level code-switch fallback. Provider errors are returned as structured errors or, for review/analysis fallbacks, as an inconclusive/script-only result. These routes are not used by the regular `/translate` request.

### `GET /ai/capabilities`

Returns whether an `OPENAI_API_KEY` value is present, the transcription and speech model names, whether transcription/neural speech are available, custom-voice eligibility guidance, and whether AWAZ stores audio. This is a configuration check, not an upstream credential or model-access probe. An upstream credential rejection returns a safe message directing the operator to update the backend key.

### `POST /ai/verify`

JSON body (maximum 5,000 characters in each text field):

```json
{
  "sourceText": "Take 2 tablets before 2026-11-23.",
  "translatedText": "Take 3 tablets before 2026-11-23.",
  "sourceLang": "en-US",
  "targetLang": "hi-IN",
  "backTranslate": false
}
```

Returns `status` (`REVIEW_RECOMMENDED`, `CHECKED_NO_OBVIOUS_ISSUES`, or `INCONCLUSIVE`), deterministic or semantic `issues`, optional `suggestedTranslation`, optional `backTranslation`, and an uncalibrated `confidenceScore` when the AI review completes. No response certifies translation correctness.

### `POST /ai/code-switch`

JSON body with `text`, `sourceLang`, `targetLang`, optional display names, and optional `saveHistory` plus `deviceId`. Text is limited to 5,000 characters. Returns `translatedText`, word/phrase `segments` with language, script, transliteration and meaning, `analysisAvailable`, and translation provider metadata. Without usable AI analysis, it returns approximate script groups and uses the existing translation adapters. If history is enabled, the result is written to the existing `Translation` collection; no new database collection is added.

### `POST /ai/dub/transcribe?sourceLang=en-US`

Send the raw bytes of an audio file using its MIME type, for example `Content-Type: audio/webm;codecs=opus`. Omit `sourceLang` or use `auto` for provider language detection. The default maximum body is 20 MiB (`AI_AUDIO_MAX_BYTES`, capped at 25 MiB); supported MIME families include MP3, WAV, OGG, AAC, FLAC, WebM and MP4. Returns transcript text, detected language when available, duration, timestamped segments/speaker labels when provided, and the model name. In the UI, an explicit disclosure checkbox is required before upload.

### `POST /ai/dub/speech`

JSON body with `text` (1–4,096 characters), optional built-in `voice`, optional `language` and `speed` (0.25–4), or `customVoiceId` plus `speakerConsentConfirmed: true`. Success returns `audio/mpeg` MP3 bytes, `Cache-Control: no-store`, and `X-AWAZ-AI-Generated: true`.

### Voice consent routes

- `GET /ai/dub/consent-phrases` returns the provider's current exact consent phrases.
- `POST /ai/dub/voice-consents?language=en&name=My%20voice&speakerConsent=true` accepts raw consent-audio bytes. Maximum 10 MiB. Returns the provider consent ID.
- `POST /ai/dub/voices?consentId=cons_...&name=My%20voice&speakerConsent=true` accepts the same adult speaker's raw sample bytes (maximum 10 MiB) and returns the provider voice ID.

The UI requires an adult-speaker permission confirmation, exact phrase recording and a 10–60 second sample. Recording-based custom voices require eligible provider access; provider validation and account restrictions still apply. AWAZ stores neither recordings nor generated audio. A custom voice ID is kept in browser local storage; provider-side voice and consent records must be managed through the provider account. No login or new database table is introduced.

## `GET /history`

Requires the browser ID that owns opted-in records:

```text
GET /history?deviceId=<uuid>&limit=100
```

The limit is clamped to 1–200. The returned records are sorted newest first. A random browser ID is a data partition key, not account authentication.

## `DELETE /history`

Delete one record or all records for a browser ID:

```text
DELETE /history?deviceId=<uuid>&id=<mongo-object-id>
DELETE /history?deviceId=<uuid>
```

## `WS /ws`

This endpoint handles JSON `ping` and `translate` messages plus meeting room signaling, participant mute/camera state and completed speech transcripts. It does not accept microphone or audio/video frames. Browser speech recognition happens on each participant's device; audio and video call media use peer-to-peer WebRTC. Meeting transcript text is relayed in memory and is not persisted.

```json
{ "type": "translate", "id": "turn-1", "text": "Hello", "sourceLang": "en", "targetLang": "es" }
```

Responses use `type: "translation"` with translated text, engine and latency, or `type: "error"`. Payloads are capped at 64 KiB; each connection is limited to 30 translation messages per minute.

Meeting signaling messages:

```json
{ "type": "join-room", "roomCode": "ABCD2345", "mode": "conference", "name": "Sam" }
{ "type": "offer", "to": "peer-uuid", "description": { "type": "offer", "sdp": "..." } }
{ "type": "answer", "to": "peer-uuid", "description": { "type": "answer", "sdp": "..." } }
{ "type": "ice-candidate", "to": "peer-uuid", "candidate": { "candidate": "..." } }
{ "type": "meeting-transcript", "text": "Hello there", "sourceLang": "en-US" }
{ "type": "meeting-state", "muted": false, "cameraOff": false }
{ "type": "leave-room" }
```

`mode` is `voice`, `video` or `conference`. Voice/video rooms allow two participants; conference rooms allow up to six. The server responds with `room-joined`, `peer-joined`, `peer-left`, `meeting-transcript`, or `meeting-error` messages and relays WebRTC `offer`, `answer` and `ice-candidate` messages only to peers in the same room. Room codes act as invite secrets; the service does not authenticate participants or accounts. Production deployments need HTTPS, WebSocket support and may need a TURN relay for restrictive NATs.
