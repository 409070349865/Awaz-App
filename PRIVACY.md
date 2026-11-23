# AWAZ privacy

## No account system

AWAZ has no signup, login, user profile or account database. Preferences, translation history and practice attempts are kept in this browser.

## Storage choices

- Successful translations save automatically in browser `localStorage` (up to 500 records) on this device. Delete individual entries or clear them from History.
- Speak practice attempts stay in local browser storage.
- Personal glossary entries stay in this browser and are applied to matching translation requests.
- Temporary conversation context is disabled.
- Meeting captions remain in page memory and disappear when leaving the meeting page. A recap is stored locally only after you review and save it. Meeting transcripts pass through the AWAZ backend for room delivery and translation but are not persisted. Audio and video media use peer-to-peer WebRTC and are not sent through the AWAZ backend.

## External processing

Translation text is sent from the browser to the AWAZ backend and then to the selected translation provider. The free public Google adapter and LibreTranslate endpoint may process the text outside the user's device. Google Cloud, DeepL and OpenAI process it according to their own service policies and the deployment's credentials.

Optional Translation review and Mixed-language translation send the selected text to OpenAI when configured. Back-translation uses the configured translation adapter. Their optional provider processing uses the backend-only `OPENAI_API_KEY`; provider data handling follows the configured provider's terms.

Browser speech recognition may send audio to a browser configured recognition service; behavior varies by browser. The separate voice frequency meter measures audio locally in the browser and does not record or transmit its samples. Text to speech uses browser/device voices. OCR executes in the browser; Tesseract.js may download language data from its distribution provider. AWAZ does not upload the selected image to its own backend.

Do not enter sensitive personal, medical or confidential information unless the configured provider and deployment are appropriate for it.

## Data handling

Backend request logs record method, path, status and latency, but omit query parameters and translation text. Provider adapters do not log prompt text. Meeting transcript messages are relayed in memory only. The legacy cloud-history API only writes MongoDB records when a request explicitly sets `saveHistory: true` and includes a valid browser ID; the frontend no longer offers cloud history.

## Deletion and permissions

History can clear local translations. Browser site settings control microphone and camera permissions. Meeting invite codes are not tied to accounts; anyone with the code can try to join while the room is open.

Local data can also be removed by clearing site data in the browser. The deployment operator controls provider credentials, service logs and any optional legacy database history.

## Security boundary

There is no account authentication by design. Meeting invite codes act as room secrets. Configure HTTPS, WebSocket support, CORS, rate limits, backend access and any TURN relay for the deployment. Do not expose provider keys in frontend code.
