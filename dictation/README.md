# Dictation

Voice dictation into clinical notes, with an optional AI "clean up & structure" step.

- **Speech-to-text:** AWS Transcribe Medical streaming (US English, HIPAA-eligible under your AWS BAA).
- **Cleanup:** a Bedrock model tidies the dictation and *proposes* values for note fields. A person reviews and applies; nothing is saved automatically.
- **Switch:** per organization, in **Settings > Dictation** (stored on `users.Organization`: `dictation_enabled`, `dictation_cleanup_enabled`, `dictation_specialty`, `dictation_access`). **Off by default.** When off, the microphone does not appear and the server refuses every request.

## How it works

```
browser mic --16 kHz PCM--> wss://transcribestreaming.<region>.amazonaws.com:8443  (signed URL from this server)
browser     --transcript--> POST /api/dictation/cleanup/ --> Bedrock --> proposals --> reviewed in the UI
```

Audio goes from the browser straight to AWS. This server only signs a 60-second URL with its own IAM role, so no AWS key ever reaches the browser and no audio passes through (or is stored by) POWER.

| Endpoint | What it does |
|---|---|
| `GET  /api/dictation/config/` | Tells the UI whether to show the microphone (never an error). |
| `POST /api/dictation/stream-url/` | Returns the signed WebSocket URL. Logs `stream_start`. |
| `POST /api/dictation/session-end/` | Browser reports how long a dictation ran. Logs `stream_end`. |
| `POST /api/dictation/cleanup/` | Returns `{cleaned, fields, uncertain, unplaced}`. Nothing is saved. |

Access needs: login, the `clinical_notes.view_author` right, the organization's switch on, and (if chosen) the doctors-only setting. Anyone else gets one generic 403.

## Setup

1. **BAA.** Make sure your AWS BAA (AWS Artifact) is accepted. Transcribe Medical and your chosen Bedrock model must be HIPAA-eligible.
2. **IAM.** Give the role this server runs as the actions in `dictation/iam_policy.json` (replace the model id). No access keys go in settings: `boto3` uses the role (or the keys already used for Chime).
3. **Settings / environment**
   - `DICTATION_AWS_REGION` (default `us-east-1`)
   - `DICTATION_CLEANUP_MODEL_ID`: a Bedrock model or inference-profile id. Unset means AI cleanup answers 503; plain dictation still works.
   - Keep **Bedrock model invocation logging OFF** (the default). Turning it on would store dictated text in your AWS account.
4. **Migrate:** `python manage.py migrate` (adds the four organization fields and the `DictationEvent` audit table).
5. **Turn it on:** an admin opens Settings > Dictation, switches it on, picks the specialty, and saves.

### Network and browser requirements
- The page must be served over **HTTPS** (or `localhost`); browsers only allow the microphone there.
- Clinic networks must allow outbound **WebSocket traffic on port 8443** to `transcribestreaming.<region>.amazonaws.com`. Hospital firewalls often block 8443. If dictation connects then drops at once, ask IT to allow it.
- No Content-Security-Policy or Permissions-Policy header currently blocks the microphone. If you add one, allow `connect-src wss://transcribestreaming.*.amazonaws.com:8443` and `microphone=(self)`.

## What is and is not stored
- **Not stored:** audio, transcript text, cleaned text. Nothing in logs either (errors log a short code only).
- **Stored (`DictationEvent`):** organization, user, kind (`stream_start` / `stream_end` / `cleanup`), session id, seconds, number of characters sent to cleanup, ok/failed, short error code, time.
- Dictated text only reaches the chart if the provider applies it, and then it is part of the normal note (draft, then signed and locked as usual).

## Safety design for the AI step
- The transcript is passed as data inside `<transcript>` tags; the prompt says never to follow instructions inside it.
- The prompt forbids adding or guessing any clinical fact, number, drug or dose, and requires hedges ("I think") to be kept and flagged.
- The server only accepts back keys the caller sent, and option fields only with a valid option. Anything else is dropped.
- The UI shows the original words beside each proposal; each field is accepted individually; text is added after existing text, never over it.

## Limits
US English only (Transcribe Medical streaming). A stream ends after 4 hours. One microphone at a time per browser. Rate limits: 120 requests/min for streaming, 20/min for cleanup, per user (`DEFAULT_THROTTLE_RATES`). A cleanup transcript may be up to 12,000 characters.

## Tests
```
python manage.py test dictation --settings=poehr_scheduling_backend.settings_test
```
If your local SQLite run stops in an older migration (`appointments.0008`, a list default SQLite cannot quote), run against PostgreSQL, or use a settings file that sets `MIGRATION_MODULES` to skip migrations. Front end: `src/components/__tests__/Dictation*.test.js`.

## Adding another engine (for example ElevenLabs)
Speech engines live in `dictation/engines/`. A new one needs: a module that can start a stream or transcribe audio, a choice in the organization settings, and a branch in `views.stream_url`. If the vendor cannot stream straight from the browser, the front end would send audio chunks to a new endpoint instead of opening the AWS socket (`useDictation.js`). Sign a BAA with the vendor before sending real patient audio.

## Not included yet
- Transcribing a whole telehealth visit (this is provider dictation only).
- A per-user right in Security & rights (access is "authors" or "doctors only").
- Custom vocabularies (Transcribe Medical supports them; add `vocabulary-name` in `engines/transcribe.py`).
