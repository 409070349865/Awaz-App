# AWAZ roadmap and implementation status

Status refers to this repository build, not a future product promise.

## Implemented

- Responsive no-account application shell and AWAZ logo/favicon.
- Text translation through backend adapters, language swap and provider error/retry behavior.
- Browser speech recognition input and speech synthesis playback where supported by the browser/device.
- Local history by default, disable option, private session and opt-in MongoDB history scoped to a browser ID.
- Explicit history deletion and export.
- Browser OCR from uploaded images or camera capture, text editing and translation.
- Turn based speaker A/B conversation with sequential translation.
- Optional translation review with deterministic critical-token comparison, semantic issue flags, suggested wording and back-translation; no correctness guarantee.
- Optional word/phrase-level mixed-language analysis with script, language, transliteration and natural translation, plus script-level fallback.
- Optional Dubbing studio with audio recording/upload, transcription, editable transcript, translation, speech output, segment-aligned WAV export and consent-gated custom voices.
- Local live microphone spectrum meter with peak frequency and input level.
- Speech practice with reference playback and exact transcript text comparison; saved attempts are actual browser transcripts.
- Actual history-based usage counts and daily/hourly frequency charts, provider selection, health/config reporting, CORS, rate limits, input validation and security headers.
- Data storage and accessibility controls for history, contextual memory, text size, contrast and motion in Settings.
- API documentation, architecture, privacy and deployment documentation.

## Partial or provider/browser dependent

- **Translation coverage and quality:** depends on the selected provider and language pair. The default public endpoints have no SLA. No confidence score is returned.
- **Contextual translation:** only applied through OpenAI. Local context is optional and off by default.
- **Speech recognition/synthesis:** depends on browser support, OS voices, permissions and possibly network access. No guaranteed offline speech.
- **AI review, code-switch analysis and dubbing:** require optional OpenAI configuration for their AI portions. Review scores are uncalibrated. Recording-based custom voices depend on provider eligibility and explicit adult speaker consent. WAV segment alignment is not lip-sync.
- **Live conversation:** turn based and sequential; it is not full duplex real time interpretation, does not stream audio, and does not identify speakers.
- **Vision:** capture and OCR work in the browser. No live AR overlay, selectable region OCR or layout preserving document output.
- **Speak practice:** compares transcript text only. No phoneme, accent, rhythm or pronunciation score.
- **Cloud history:** requires a live MongoDB connection and is an anonymous browser-ID partition, not account-secured data.
- **Provider health:** reports configured adapters/credentials; it does not actively probe upstream providers.

## Not implemented

- Automatic language detection in the regular Translate workflow, provider quality routing, translation cache or calibrated confidence estimation.
- Continuous bidirectional audio interpretation, speech segmentation/VAD, audio queue controls, device routing or noise cancellation.
- Downloadable offline translation or speech packs, a pack manager or offline machine translation.
- Live AR translation overlay, handwriting optimized OCR or region selection.
- Pronunciation models, phoneme evaluation or verified pronunciation feedback.
- Streaming dubbing, precise word-level timing or lip-sync, meeting summaries, decisions and action item extraction.
- Account features of any kind.

## Suggested next work

1. Add integration tests for history isolation, deletion, CORS, rate limits and the WebSocket protocol.
2. Select and document a supported production translation provider; add provider-specific language-pair checks and live health probes.
3. Add WebSocket audio only with a real speech provider, explicit audio disclosure, buffering limits and interruption handling.
4. Add a real speech evaluation model before displaying pronunciation feedback.
5. Evaluate an offline translation model and its download/storage size before advertising offline capability.
6. Add diarization and summaries only after implementing verified audio segmentation and attribution.
