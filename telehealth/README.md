# telehealth

Django app for video visits on the Amazon Chime SDK Meetings API. Server-minted,
role-scoped join credentials, single-use patient links, a real waiting room,
append-only audit log. No media is stored, and media capture is never enabled.

## Visit flow

1. Staff `POST /api/telehealth/sessions/` with `{appointment_id}`. Creates the Chime meeting plus a provider and a patient participant.
2. Staff `POST .../join-link/` mints a single-use link and texts it through Twilio. Link shape: `https://<host>/telehealth/join#<token>`. The token is in the URL **fragment**, so it never reaches server logs or referrers. The SMS contains only the link.
3. The patient page reads the fragment and `POST /join/redeem/` with the token. The token burns, the session moves to `waiting`, the provider gets a PHI-free WebSocket event, and the patient receives a signed `rejoin_token` so a page refresh doesn't strand them.
4. Patient `POST /join/consent/`, then polls `POST /join/status/`.
5. Provider `POST .../admit/`. Only then does `POST /join/media/` return Chime join info (needs consent AND admission).
6. Provider `POST .../provider-token/` for their own join info. Both sides report `joined`/`left` to the presence endpoints.
7. Staff `GET /api/telehealth/schedule/?date=YYYY-MM-DD` feeds the Today and Waiting Room tabs (today's video appointments with session state, plus `server_time` so the UI can correct for clock skew). Patient `POST /api/telehealth/ping/` is a tiny round trip the device check uses to measure the connection; it shares the `telehealth_join` throttle, which is why the rate above is 60/min.
8. Staff `POST .../end/` ends the session, revokes patient access immediately, deletes the Chime meeting, and fires the `session_ended` signal (Phase 3 hook).

**Who can do what** (rights in `users/rights.py`, overridable per user through the existing rights admin):

- `telehealth.manage`: front desk (receptionist, registrar, admin by default). Create sessions, send links, view the board, end sessions.
- `telehealth.conduct`: doctor and nurse by default. Admit patients and get provider media, but only for visits where they are the appointment's provider.

**Marking a visit as video:** `Appointment.is_video` (checkbox/field on the appointment; it is already part of the appointment API). Only video appointments appear on the Telehealth board.

**Tenant isolation:** every session stores the appointment's `organization`. Staff requests are checked against the caller's organization and another clinic's session answers 404. Patient join endpoints are unauthenticated and rely on the link token, so Telehealth models deliberately don't use `TenantScopedManager`.

## Install

Already wired into this repo: `INSTALLED_APPS`, `api/telehealth/` in `poehr_scheduling_backend/urls.py`, the rights, the `is_video` migration and the `telehealth` migration. `boto3` is in `requirements.txt`.

Settings (all optional except where noted):

| Setting / env var | Default | Purpose |
|---|---|---|
| `TELEHEALTH_PUBLIC_URL` | `http://localhost:3000/telehealth` | Base of the join link. Set to your public frontend URL. |
| `TELEHEALTH_CHIME_API_REGION` / `TELEHEALTH_MEDIA_REGION` | `us-east-1` | Chime control-plane and media regions. |
| `TELEHEALTH_LINK_TTL_MINUTES` | 120 | How long an unopened link works. |
| `TELEHEALTH_REJOIN_TTL_SECONDS` | 7200 | Patient refresh/rejoin window. |
| `TELEHEALTH_CREATE_CHART_DRAFT` | off | When on, ending a visit also creates an **unsigned draft** `ClinicalNote` for the provider. Off by default. |
| `TELEHEALTH_ASSISTANT_BACKEND` | none (assistant off) | Dotted path of the model function. See Phase 4. |

Texts go straight through Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`). Telehealth does not use Communicator, whose lists come from uploads and are matched by phone number. The recipient is always the patient on the appointment, and consent (`sms_consent`) and opt-out (`sms_opt_out`) are read from that patient's own account. Twilio itself refuses numbers that replied STOP, which shows as "opted out". If a text cannot be sent, the UI says why and copies the link for staff to deliver another way. The link is not stored in any message log; the token is single-use and time-limited.

Credentials: no keys in settings. Run under an IAM role that has `iam_policy.json`.

## AWS setup

1. Accept the AWS BAA in **AWS Artifact** on the account that will run video. Prefer a dedicated account or OU for PHI workloads.
2. Attach `iam_policy.json` to the IAM role your Django app runs under (task role or instance profile). No access keys in settings. Verify the action names against the current Chime SDK IAM docs.
3. Pick the media region you want meetings pinned to.

## How it maps onto this repo (`services.py`)

| Function | Uses |
|---|---|
| `video_appointments` | `Appointment` filtered by `is_video=True` and `appointment_datetime` date, excluding cancelled, no-show and rescheduled; tenant-scoped through `Appointment.objects` |
| `appointment_provider_user_id` | `appointment.provider_id` |
| `patient_mobile` / `patient_display_name` | `appointment.patient.phone_number` / full name |
| `send_join_sms` / `send_join_sms_result` | Twilio, to the appointment's own patient; checks that patient's consent and opt-out; returns the reason when not sent (`no_phone`, `no_consent`, `opted_out`, `failed`) |
| `create_draft_note` | Off unless `TELEHEALTH_CREATE_CHART_DRAFT`; creates a draft `ClinicalNote` (nursing or doctor assessment by role), never signed |
| `notify_provider` | Channels group `telehealth_provider_<user_id>`. No consumer is registered; the UI polls |

Tests: `python manage.py test telehealth --settings=poehr_scheduling_backend.settings_test`. Staff requests use real JWTs so tenant scoping is exercised.

## Phase 3: draft note and billing context

When a visit ends, `notes.py` (connected to `session_ended`) creates a `TelehealthVisitRecord` with a draft note stub. The stub states only what this system recorded: modality, connected times, when the patient agreed, and the patient location the provider confirmed. It has no clinical content and no patient identifiers. If it can't be built or pushed, the visit still ends and the failure is logged.

- `GET /api/telehealth/sessions/<id>/visit-record/`: the provider, or anyone with `telehealth.manage`.
- `POST` the same URL: the provider only, because they attest where the patient was. Body, all optional: `patient_location` (`home` or `other`), `patient_state` (two letters), `modality` (`audio_video` or `audio_only`). Works during the visit or after it ends, and rebuilds the stub after it ends.
- The schedule endpoint adds `billing` to each session: `{confirmed, place_of_service, modifier}` or `null`.

`billing.py` holds the rules: patient at home gives POS 10, anywhere else gives POS 02, audio and video gives modifier 95, audio only gives 93. No place of service is guessed: until the provider confirms the location, it stays empty and the visit is not `ready_for_billing`. The app never picks a CPT or E&M level.

**Have billing/compliance confirm these against your payer mix.** Payers differ on whether they want modifier 95, POS only, or something else, and the rules change. Override modifiers with `TELEHEALTH_MODIFIERS = {"audio_video": "95", "audio_only": "93"}` in settings.

Two new audit event types, `billing_context_set` and `note_drafted`, carry no PHI.

## Phase 4: staff assistant

`POST /api/telehealth/assistant/chat/` runs one turn. The browser keeps the conversation and resends it. Off until you set `TELEHEALTH_ASSISTANT_BACKEND` (the endpoint answers 503 `assistant_unavailable` before that).

How it keeps PHI out and stays safe:
- **The model never sees identifiers.** Visits appear as codes like `v_1a2b3c4d` (an HMAC of the appointment and the asking user). Tool results carry only the code, scheduled time, state and minutes waiting. What staff type is scrubbed first: today's patient names become codes, and phone numbers, emails, dates, SSNs and long digit runs are masked (`assistant/scrub.py`). The browser swaps codes back to names locally.
- **It can't change anything.** There is no write tool. `propose_action` only returns a proposal (admit, send link, end visit, set location) after checking permissions and visit state. The UI shows a card; the person's click calls the same endpoints as the board, under their own login, so every existing permission check and audit row applies.
- **Minimal logging.** One log line per turn on the `telehealth.assistant` logger: user id, tool names, proposal kinds, milliseconds. No question or answer text. History is not stored by the server.
- **Limits.** Providers see only their own visits, front desk sees all. Four tool steps per turn, ten messages of history, 2,000 characters each, replies capped, and a `telehealth_assistant` throttle (30/min per user).

Model setup, option A (`assistant/bedrock.py`): Amazon Bedrock Converse, using the same IAM role and AWS BAA as Chime. Set `TELEHEALTH_ASSISTANT_BACKEND = "telehealth.assistant.bedrock.complete"` and `TELEHEALTH_ASSISTANT_MODEL_ID`, and attach `iam_policy_assistant.json` with your model id. Keep Bedrock model invocation logging off. Any other model works by pointing the setting at a function with the same signature. Option B (`assistant/anthropic_backend.py`, `TELEHEALTH_ASSISTANT_BACKEND = \"telehealth.assistant.anthropic_backend.complete\"`) reuses the repo's `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `ASSISTANT_ENABLED`. **Do not use option B for real visits until a BAA covers it**; the model still sees only visit codes, scrubbed text and visit state, but that is a policy decision, not a code one.

Not covered by tests, because they use scripted fakes in place of a model: how a real model behaves, and the Bedrock adapter itself. Try both in a test account with fake visits before real ones.

The audit log doesn't yet say a confirmed action was suggested by the assistant.

## What is deliberately not here yet

- The UI is in `frontend/src/telehealth/` (route `/telehealth`, patient page `/telehealth/join`).
- Patient-side help is fixed text in the UI. There is no patient-facing AI.
- Patient status is polled. Swap to a WebSocket later if the polling load matters.
- Chime-side events (EventBridge) as a cross-check on the client-reported joined/left audit rows.

## Things to verify before go-live

- **Reconnects:** `_issue_media` creates a fresh attendee on every request and deletes the previous one. Test a mid-call refresh on both browsers, including Safari/iOS, to confirm the old attendee drops cleanly.
- **Meeting cleanup:** `delete_meeting` is best effort. Confirm in a test account that an abandoned meeting doesn't linger, and that nothing bills after the last attendee leaves.
- **Client IP:** audit rows use `REMOTE_ADDR`. Behind a load balancer, make sure that is the real client IP.
- **One patient per session:** the unique constraint is 1 provider + 1 patient. Interpreters or family members mean dropping it.
- **Audit retention and access:** the app blocks edits and deletes, but retention policy and database-level permissions are yours to set.
- **Appointment form:** `is_video` is in the API; add a checkbox where appointments are created if it isn't there yet.
- **PHI in the SMS:** the text says only "Your video visit link". Keep it that way if the message ever gets templated.
