# Documentation assistant

A chat panel in the web app for finding and understanding what is documented about a patient: demographics,
problems, allergies, medications, notes, orders, results, vitals and visits. It is **read-only**: it cannot create,
edit, sign or delete anything in the chart. It can help word a summary or handoff in the chat; the clinician copies
what they want into the chart themselves.

Same shape as the Staffing, Communicator and Scheduler assistants (backend view + tools, shared `AssistantDock`
in the browser), with one difference: it handles PHI, so it is **off until you turn it on** and it runs on
Amazon Bedrock under your AWS BAA instead of calling a model API directly.

## Turning it on

1. AWS: the BAA must be in place, the role must be able to `bedrock:InvokeModel` the model (already true if
   POWER Dictate's cleanup works: `dictation/iam_policy.json`), and **Bedrock model invocation logging must stay
   OFF** (the default), or chart text would be stored in your AWS account.
2. Environment:

   | Variable | Meaning |
   |---|---|
   | `DOCUMENTATION_ASSISTANT_ENABLED=true` | the switch (default off) |
   | `DOCUMENTATION_ASSISTANT_MODEL_ID` | Bedrock model or inference-profile id; falls back to `DICTATION_CLEANUP_MODEL_ID` |
   | `DICTATION_AWS_REGION` | shared with Dictation |
   | `ASSISTANT_ENABLED=false` | the existing kill switch for all assistants also stops this one |
   | `ASSISTANT_RATE_LIMIT_PER_HOUR` | questions per user per hour (default 40) |
   | `ASSISTANT_LOG_RETENTION_DAYS` | how long question/answer text is kept (default 30) |

3. Run the migration (`appointments/0060_documentation_assistant`).
4. Users with the doctor, nurse, admin or system admin role then see a "Documentation assistant" tab on the right
   of the Patients page and of each patient chart page. Registrars and patients never see it.

## What it can look at

`search_patients` (name, MRN, date of birth), `get_patient_overview`, `get_problem_list`, `get_medications`,
`get_vitals`, `search_notes`, `read_note`, `search_orders`, `get_lab_results`, `get_visits`
(`appointments/documentation_assistant_tools.py`). On a patient's chart page, "this patient" means that chart.

## How it stays inside the rules

* Every tool runs the app's **existing views as the signed-in user**, so roles, rights (`clinical_notes.view_author`,
  `orders.view`, `lab_results.view`, `flowsheets.chart`) and organization scoping are the app's own. A system
  admin's assistant stays in their own clinic.
* Only what a chart review needs reaches the model. Phone numbers, addresses, emails, insurance and SSN digits do not.
* Text inside notes and orders is treated as untrusted; the prompt tells the model never to follow instructions in it.
  Since no tool can change anything, a bad note can at worst make the model say something wrong, not do something.
* Answers come only from tool results; the prompt makes it cite patient name + MRN and dates, and never guess.

## Audit

* `DocumentationAssistantAccess`: one row per chart read (user, patient id, tool, time). Ids only. **Never purged**
  by the assistant. "Who looked at patient 123 through the assistant?" is
  `DocumentationAssistantAccess.objects.filter(patient_id=123)`.
* `DocumentationAssistantMessage`: question, answer, tool names and redacted arguments (what was typed is kept only
  as a length; chart data is never stored). The question and answer text can mention a patient, so these rows are
  purged after `ASSISTANT_LOG_RETENTION_DAYS`.

## Known limits

* Doctors' *patient search* shows their own panel (the Patients list rule), but once a patient id is known the chart
  tools follow the chart screens' rule, which is clinic-wide. This matches the app today.
* Text search over notes reads the 400 newest notes in scope; it says so when older ones were not read.
* Not covered yet: referrals, nurse task detail, flowsheets other than vitals, and a mobile version.
* Possible next step: prepare a **draft** note behind a confirmation card (the pattern the Scheduler and Communicator
  assistants use). Signing would stay manual.

## Tests

`python manage.py test appointments.test_documentation_assistant` (53 tests, model mocked, synthetic patients) and
`frontend/src/components/__tests__/DocumentationAssistantDock.test.js`.
