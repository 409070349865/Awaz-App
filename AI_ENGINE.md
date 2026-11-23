# AI engine and provider behavior

## Translation routing

The server's translation adapter map contains `freegoogle`, `libretranslate`, `google`, `deepl` and `openai`. `TRANSLATE_ENGINE` selects the default; a request may choose another adapter from that allowlist. `TRANSLATE_FALLBACKS` defines ordered fallbacks. The router tries the selected provider and then configured fallbacks, returning the first successful translation. If every adapter fails, the HTTP API returns an error.

The sample defaults to `freegoogle` followed by `libretranslate`. FreeGoogle is an undocumented public endpoint, so it can change or stop working. The default public LibreTranslate endpoint requires an API key; a self-hosted instance may not. If LibreTranslate is selected without its required key, AWAZ falls back to FreeGoogle. Neither public service has an SLA. Google Cloud, DeepL and OpenAI require backend credentials.

## Provider behavior

| Provider | Key | Behavior and limitations |
| --- | --- | --- |
| FreeGoogle | No configured key | Uses Google's undocumented `translate_a/single` endpoint. Availability and terms may change. |
| LibreTranslate | Required for the default public endpoint | Uses the configured `LIBRETRANSLATE_URL`; models and supported pairs depend on that instance. |
| Google Cloud | `GOOGLE_TRANSLATE_API_KEY` | Google Cloud Translation v2. |
| DeepL | `DEEPL_API_KEY` | DeepL API. Endpoint is configured with `DEEPL_API_URL`. |
| OpenAI | `OPENAI_API_KEY` | Chat completions are prompted to translate; cost and availability follow the configured account/model. |

The health endpoint reports adapter presence, selected default and whether a credential is configured. It does not send a probe request to paid or public providers, so it is not a live quality or reachability check.

## Optional translation review

`POST /ai/verify` runs only when the user asks to review a completed translation. It compares number, date, currency and unit tokens deterministically. When `OPENAI_API_KEY` is configured, an analysis model also flags possible omissions, additions, negation, names, safety changes, tone and ambiguity, and may suggest wording. An optional back-translation uses the currently configured translation adapter.

The response may include an uncalibrated 0–100 estimate. It is not a probability and is never labeled verified. Provider failures produce an inconclusive result while deterministic checks remain visible. The standard `/translate` path does not call this feature.

## Optional code-switch analysis

`POST /ai/code-switch` can analyze mixed-language text at word or short-phrase level, label language and script, provide transliteration and target-language meaning, and return a natural whole-message translation. Returned segments are checked to ensure they preserve source words and order. If AI analysis is unavailable or invalid, AWAZ groups recognizable scripts, leaves uncertain Latin-script language labels unknown, and calls the existing translation adapters. Same-language fallback returns the input unchanged. The standard `/translate` path does not call this analysis.

## Optional dubbing studio

The separate Dubbing studio has explicit steps to choose or record source audio, disclose provider processing, transcribe it, review/edit the transcript, translate it, and generate speech. The UI does not upload the recording until the user checks the disclosure and starts transcription. Source transcription is capped at 20 MiB by default and 30,000 transcript characters in the UI. The configured models are `OPENAI_TRANSCRIBE_MODEL` (`gpt-4o-transcribe-diarize` by default) and `OPENAI_SPEECH_MODEL` (`gpt-4o-mini-tts` by default).

When transcription returns timestamps, translated chunks keep segment start/end times. Generated audio is served as MP3 with `X-AWAZ-AI-Generated: true`; the browser can render a WAV track by placing segments at those times and fitting speed within a limited range. This is segment alignment, not word-level synchronization or lip-sync. Browser speech synthesis can play translated segments without the AI speech model. Audio uploaded or generated in this workflow is not stored by AWAZ; audio is sent to the configured provider when the user invokes the operation.

Recording-based custom voices are optional and depend on provider account eligibility. The speaker must be an adult who owns the voice or gave explicit permission, read the exact provider phrase, and supply a sample from that same speaker. AWAZ requires confirmation in the UI and validates 10 MiB file limits; the provider validates phrase content, speech duration and sample requirements. A custom voice ID is stored in this browser only. The provider holds its own voice and consent records; removing the local ID does not delete them. Manage or delete provider-side recordings and voices through that provider's account controls.

## Context and meaning features

- General translation through traditional adapters translates the current text only.
- Context mode affects translation only when OpenAI is the selected adapter. The server adds a short instruction for the selected context and asks the provider not to add details.
- Temporary turn history is sent only when contextual memory is enabled and OpenAI is selected. It is off by default, limited to six recent turns and each turn is size capped.
- The ordinary translation endpoint does not generate a translation quality score or automatic language detection. Optional review and code-switch analysis are separate user-triggered features described above.

## Browser speech and OCR

Speech recognition and speech synthesis use browser APIs and device voices. Speech recognition support and whether audio is processed locally or by a browser provider vary by browser. TTS voice availability varies by OS/browser. AWAZ does not claim emotion detection, phoneme scoring, voice matching, noise removal or offline recognition.

Tesseract.js runs OCR in the browser with a language data file. The confidence field is the OCR engine's estimate only. The image is not sent to the AWAZ backend. No live AR overlay or layout-preserving document renderer is included.

## Adding a provider

1. Add an adapter in `awaz-backend/server/services/engines/` that exports `translate(text, source, target, options)`.
2. Read credentials and timeout configuration through `server/config/config.js`.
3. Add the adapter to the provider map and the request allowlist in `server/routes/translate.js`.
4. Return provider errors with a safe `code` and `status`; do not log request text or credential-bearing URLs.
5. Add the provider's setup and pair limitations to this document and `.env.example`.
