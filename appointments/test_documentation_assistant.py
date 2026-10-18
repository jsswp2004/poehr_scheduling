"""
Documentation assistant: tools run as the signed-in user (roles, rights, organization scoping), tell the model only
what a chart review needs, leave an access trail, and the endpoint/loop around them behaves. All patients here are
made up; the model is always mocked.
"""

import copy
import datetime
import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from poehr_scheduling_backend.tenancy import clear_current_organization, set_current_organization
from users.models import Organization, Patient, Registration

from . import documentation_assistant as A
from . import documentation_assistant_bedrock as B
from . import documentation_assistant_tools as T
from .models import (
    Appointment,
    ClinicalNote,
    DocumentationAssistantAccess as Access,
    DocumentationAssistantMessage as Log,
    LabReport,
    LabResultItem,
    Order,
    Orderable,
)

User = get_user_model()

ENABLED = dict(
    DOCUMENTATION_ASSISTANT_ENABLED=True,
    DOCUMENTATION_ASSISTANT_MODEL_ID="test-model",
    DICTATION_CLEANUP_MODEL_ID="",
)
CONVERSE = "appointments.documentation_assistant.llm.converse"


def make_user(name, role, org, **extra):
    return User.objects.create_user(
        username=name, email=f"{name}@example.com", password="pw-12345-xyz", role=role, organization=org, **extra
    )


def make_patient(username, first, last, org, provider=None, dob=datetime.date(1960, 1, 2), sex="F"):
    user = make_user(username, "patient", org, first_name=first, last_name=last)
    if provider is not None:
        user.provider = provider
        user.save()
    # creating a patient user also creates their Patient profile (with the MRN), so fill that one in
    profile = Patient.objects.get(user=user)
    profile.organization = org
    profile.date_of_birth = dob
    profile.legal_sex = sex
    profile.phone_number = "3015550123"
    profile.address = "1 Secret Way"
    profile.save()
    return user, profile


def say(text, stop="end_turn", tokens=(10, 5)):
    return {
        "text": text, "tool_uses": [], "stop_reason": stop, "message": {"role": "assistant", "content": [{"text": text}]},
        "input_tokens": tokens[0], "output_tokens": tokens[1],
    }


def call(tool_name, args, use_id="t1"):
    block = {"toolUse": {"toolUseId": use_id, "name": tool_name, "input": args}}
    return {
        "text": "", "tool_uses": [{"id": use_id, "name": tool_name, "input": args}], "stop_reason": "tool_use",
        "message": {"role": "assistant", "content": [block]}, "input_tokens": 20, "output_tokens": 8,
    }


class ChartBase(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other_org = Organization.objects.create(name="Clinic B")
        self.doc = make_user("doc", "doctor", self.org, first_name="Dana", last_name="Reed")
        self.doc2 = make_user("doc2", "doctor", self.org, first_name="Eli", last_name="Stone")
        self.nurse = make_user("nurse", "nurse", self.org, first_name="Nia", last_name="Park")
        self.registrar = make_user("reg", "registrar", self.org)
        self.admin = make_user("adm", "admin", self.org)
        self.sysadmin = make_user("sys", "system_admin", self.org)

        self.maria, self.maria_p = make_patient("maria", "Maria", "Lopez", self.org, provider=self.doc)
        self.sam, self.sam_p = make_patient("sam", "Sam", "Lopez", self.org, provider=self.doc2, dob=datetime.date(1971, 5, 9), sex="M")
        self.stranger, _ = make_patient("stranger", "Maria", "Lopez", self.other_org)

        self.visit = Appointment.objects.create(
            organization=self.org, patient=self.maria, provider=self.doc, title="Chest pain follow-up",
            appointment_datetime=timezone.now() - datetime.timedelta(days=1),
        )
        self.note = ClinicalNote.objects.create(
            organization=self.org, appointment=self.visit, patient=self.maria, author=self.doc,
            note_type="doctor_assessment", documentation_type="progress_note", status="signed",
            subjective="Reports chest pain on exertion.", objective="BP 150/90.", assessment="Stable angina suspected.",
            plan="Start nitroglycerin PRN; stress test.", signed_at=timezone.now(),
        )
        self.draft = ClinicalNote.objects.create(
            organization=self.org, appointment=self.visit, patient=self.maria, author=self.nurse,
            note_type="nursing_assessment", status="draft", subjective="Patient anxious.",
            structured_data={"teaching": "Reviewed low sodium diet"},
        )
        self.stranger_doc = make_user("sdoc", "doctor", self.other_org)
        stranger_visit = Appointment.objects.create(
            organization=self.other_org, patient=self.stranger, provider=self.stranger_doc, title="Visit",
            appointment_datetime=timezone.now(),
        )
        self.secret_note = ClinicalNote.objects.create(
            organization=self.other_org, appointment=stranger_visit, patient=self.stranger, author=self.stranger_doc,
            note_type="doctor_assessment", status="signed", subjective="chest pain at another clinic",
        )

        self.cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory", code_system="loinc", external_code="58410-2")
        self.order = Order.objects.create(
            organization=self.org, appointment=self.visit, patient=self.maria, ordering_provider=self.doc, orderable=self.cbc,
            orderable_name="CBC", orderable_category="laboratory", status="active", priority="urgent",
            indication="Rule out anemia", diagnosis_codes=[{"code": "D64.9", "description": "Anemia"}],
        )
        report = LabReport.objects.create(
            organization=self.org, patient=self.maria, title="Basic metabolic panel", status="final",
            resulted_at=timezone.now(), performing_lab="Main Lab",
        )
        LabResultItem.objects.create(report=report, test_name="Potassium", value="5.9", units="mmol/L", reference_range="3.5-5.1", abnormal_flag="HH", sort_order=1)
        LabResultItem.objects.create(report=report, test_name="Sodium", value="140", units="mmol/L", reference_range="135-145", sort_order=2)

        # the tenant-scoped managers are empty outside a request; a real request sets this at sign-in
        set_current_organization(self.org)

    def tearDown(self):
        clear_current_organization()

    def run_as(self, user, name, args):
        return T.run_tool(user, name, args)


class AccessTests(ChartBase):
    def test_registrar_and_patient_get_no_tools(self):
        self.assertEqual(T.tools_for(self.registrar), [])
        self.assertEqual(T.tools_for(self.maria), [])
        res, err = self.run_as(self.registrar, "search_patients", {"query": "lopez"})
        self.assertTrue(err)

    def test_clinical_roles_get_the_tools(self):
        names = {t["name"] for t in T.tools_for(self.doc)}
        self.assertTrue({"search_patients", "get_patient_overview", "search_notes", "read_note", "search_orders", "get_visits"} <= names)

    def test_no_tool_can_change_anything(self):
        for name in T.TOOLS:
            self.assertTrue(name.startswith(("search_", "get_", "read_")), name)


class SearchPatientsTests(ChartBase):
    def ids(self, res):
        return {p["patient_id"] for p in res["patients"]}

    def test_by_last_name_stays_in_own_clinic(self):
        res, err = self.run_as(self.nurse, "search_patients", {"query": "lopez"})
        self.assertFalse(err)
        self.assertEqual(self.ids(res), {self.maria.pk, self.sam.pk})
        self.assertNotIn(self.stranger.pk, self.ids(res))

    def test_full_name_narrows_to_the_one_patient(self):
        res, _ = self.run_as(self.nurse, "search_patients", {"query": "Maria Lopez"})
        self.assertEqual(self.ids(res), {self.maria.pk})

    def test_by_mrn_and_date_of_birth(self):
        res, _ = self.run_as(self.nurse, "search_patients", {"query": self.maria_p.mrn})
        self.assertEqual(self.ids(res), {self.maria.pk})
        res, _ = self.run_as(self.nurse, "search_patients", {"query": "05/09/1971"})
        self.assertEqual(self.ids(res), {self.sam.pk})
        res, _ = self.run_as(self.nurse, "search_patients", {"query": "1971-05-09"})
        self.assertEqual(self.ids(res), {self.sam.pk})

    def test_doctor_only_sees_own_panel(self):
        res, _ = self.run_as(self.doc, "search_patients", {"query": "lopez"})
        self.assertEqual(self.ids(res), {self.maria.pk})

    def test_system_admin_stays_in_own_clinic(self):
        res, _ = self.run_as(self.sysadmin, "search_patients", {"query": "lopez"})
        self.assertNotIn(self.stranger.pk, self.ids(res))

    def test_contact_details_never_returned(self):
        res, _ = self.run_as(self.nurse, "search_patients", {"query": "maria lopez"})
        text = json.dumps(res)
        for secret in ("3015550123", "1 Secret Way", "maria@example.com"):
            self.assertNotIn(secret, text)

    def test_short_query_refused(self):
        _, err = self.run_as(self.nurse, "search_patients", {"query": "a"})
        self.assertTrue(err)


class OverviewTests(ChartBase):
    def test_overview_has_the_chart_without_contact_details(self):
        res, err = self.run_as(self.nurse, "get_patient_overview", {"patient_id": self.maria.pk})
        self.assertFalse(err, res)
        self.assertEqual(res["patient"]["mrn"], self.maria_p.mrn)
        self.assertEqual(res["patient"]["patient_id"], self.maria.pk)
        text = json.dumps(res, default=str)
        for secret in ("3015550123", "1 Secret Way", "maria@example.com"):
            self.assertNotIn(secret, text)

    def test_other_clinics_patient_is_not_found(self):
        res, err = self.run_as(self.nurse, "get_patient_overview", {"patient_id": self.stranger.pk})
        self.assertTrue(err)
        self.assertIn("wasn't found", res["error"])

    def test_bad_patient_id(self):
        _, err = self.run_as(self.nurse, "get_patient_overview", {"patient_id": "abc"})
        self.assertTrue(err)


class NotesTests(ChartBase):
    def test_search_within_a_patient(self):
        res, err = self.run_as(self.doc, "search_notes", {"patient_id": self.maria.pk})
        self.assertFalse(err, res)
        self.assertEqual({n["note_id"] for n in res["notes"]}, {self.note.pk, self.draft.pk})

    def test_text_search_finds_soap_and_structured_answers(self):
        res, _ = self.run_as(self.doc, "search_notes", {"query": "angina"})
        self.assertEqual([n["note_id"] for n in res["notes"]], [self.note.pk])
        self.assertIn("angina", res["notes"][0]["snippet"].lower())
        res, _ = self.run_as(self.doc, "search_notes", {"query": "low sodium"})
        self.assertEqual([n["note_id"] for n in res["notes"]], [self.draft.pk])

    def test_clinic_wide_search_never_crosses_clinics(self):
        res, _ = self.run_as(self.doc, "search_notes", {"query": "chest pain"})
        ids = {n["note_id"] for n in res["notes"]}
        self.assertIn(self.note.pk, ids)
        self.assertNotIn(self.secret_note.pk, ids)

    def test_status_filter(self):
        res, _ = self.run_as(self.doc, "search_notes", {"patient_id": self.maria.pk, "status": "draft"})
        self.assertEqual([n["note_id"] for n in res["notes"]], [self.draft.pk])

    def test_needs_patient_or_query(self):
        _, err = self.run_as(self.doc, "search_notes", {})
        self.assertTrue(err)

    def test_read_note_returns_text_and_status(self):
        res, err = self.run_as(self.doc, "read_note", {"note_id": self.note.pk})
        self.assertFalse(err, res)
        self.assertEqual(res["status"], "signed")
        self.assertEqual(res["author"], "Dana Reed")
        sections = {s["section"]: s["text"] for s in res["content"]}
        self.assertEqual(sections["Assessment"], "Stable angina suspected.")
        self.assertEqual(sections["Plan"], "Start nitroglycerin PRN; stress test.")

    def test_read_note_lists_addenda(self):
        add = ClinicalNote.objects.create(
            organization=self.org, appointment=self.visit, patient=self.maria, author=self.doc,
            note_type="doctor_assessment", status="draft", subjective="Addendum", amends=self.note,
        )
        res, _ = self.run_as(self.doc, "read_note", {"note_id": self.note.pk})
        self.assertEqual([a["note_id"] for a in res["addenda"]], [add.pk])

    def test_read_note_from_another_clinic_not_found(self):
        res, err = self.run_as(self.doc, "read_note", {"note_id": self.secret_note.pk})
        self.assertTrue(err)
        self.assertNotIn("another clinic", json.dumps(res))

    def test_long_note_is_trimmed(self):
        self.note.subjective = "x" * (T.NOTE_TEXT_CHARS + 500)
        self.note.save()
        res, _ = self.run_as(self.doc, "read_note", {"note_id": self.note.pk})
        self.assertTrue(res["truncated"])


class OrdersLabsVisitsTests(ChartBase):
    def test_orders_by_patient_status_and_text(self):
        res, err = self.run_as(self.doc, "search_orders", {"patient_id": self.maria.pk, "status": "active", "query": "anemia"})
        self.assertFalse(err, res)
        self.assertEqual([o["order_id"] for o in res["orders"]], [self.order.pk])
        o = res["orders"][0]
        self.assertEqual((o["name"], o["status"], o["priority"], o["diagnosis_codes"]), ("CBC", "Active", "urgent", ["D64.9"]))
        res, _ = self.run_as(self.doc, "search_orders", {"patient_id": self.maria.pk, "status": "completed"})
        self.assertEqual(res["orders"], [])

    def test_labs_flags_and_abnormal_only(self):
        res, err = self.run_as(self.doc, "get_lab_results", {"patient_id": self.maria.pk})
        self.assertFalse(err, res)
        names = [r["test"] for r in res["reports"][0]["results"]]
        self.assertEqual(names, ["Potassium", "Sodium"])
        res, _ = self.run_as(self.doc, "get_lab_results", {"patient_id": self.maria.pk, "abnormal_only": True})
        self.assertEqual([r["test"] for r in res["reports"][0]["results"]], ["Potassium"])
        self.assertEqual(res["reports"][0]["results"][0]["flag"], "HH")

    def test_visits_include_registrations_and_appointments(self):
        Registration.objects.create(
            patient=self.maria_p, organization=self.org, care_setting="ambulatory", reason_for_visit="Chest pain",
            appointment=self.visit, attending_provider=self.doc,
        )
        res, err = self.run_as(self.doc, "get_visits", {"patient_id": self.maria.pk})
        self.assertFalse(err, res)
        self.assertEqual(res["visits"][0]["reason"], "Chest pain")
        self.assertEqual(res["visits"][0]["attending"], "Dana Reed")
        self.assertEqual(res["appointments"][0]["title"], "Chest pain follow-up")

    def test_problem_list_and_medications_answer(self):
        res, err = self.run_as(self.doc, "get_problem_list", {"patient_id": self.maria.pk})
        self.assertFalse(err, res)
        res, err = self.run_as(self.doc, "get_medications", {"patient_id": self.maria.pk})
        self.assertFalse(err, res)
        self.assertEqual(res["patient_id"], self.maria.pk)


class AccessTrailTests(ChartBase):
    def test_chart_read_is_recorded(self):
        self.run_as(self.nurse, "get_patient_overview", {"patient_id": self.maria.pk})
        row = Access.objects.get()
        self.assertEqual((row.user_id, row.patient_id, row.tool), (self.nurse.pk, self.maria.pk, "get_patient_overview"))
        self.assertEqual(row.organization_id, self.org.pk)

    def test_refused_lookup_leaves_no_row(self):
        self.run_as(self.nurse, "get_patient_overview", {"patient_id": self.stranger.pk})
        self.assertEqual(Access.objects.count(), 0)

    def test_search_records_each_patient_returned(self):
        self.run_as(self.nurse, "search_patients", {"query": "lopez"})
        self.assertEqual({a.patient_id for a in Access.objects.all()}, {self.maria.pk, self.sam.pk})

    def test_note_search_records_patients_whose_notes_were_returned(self):
        self.run_as(self.doc, "search_notes", {"query": "angina"})
        self.assertEqual({a.patient_id for a in Access.objects.all()}, {self.maria.pk})


class SizeGuardTests(ChartBase):
    def test_oversized_result_is_refused_not_sent(self):
        with patch.object(T, "MAX_RESULT_CHARS", 50):
            res, err = self.run_as(self.nurse, "get_patient_overview", {"patient_id": self.maria.pk})
        self.assertTrue(err)
        self.assertIn("too much data", res["error"])
        self.assertEqual(Access.objects.count(), 0)


@override_settings(**ENABLED)
class EndpointTests(ChartBase):
    URL = "/api/documentation-assistant/message/"

    def client_for(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def test_needs_sign_in(self):
        self.assertEqual(APIClient().post(self.URL, {"message": "hi"}, format="json").status_code, 401)

    def test_registrar_refused(self):
        r = self.client_for(self.registrar).post(self.URL, {"message": "hi"}, format="json")
        self.assertEqual(r.status_code, 403)

    @override_settings(DOCUMENTATION_ASSISTANT_ENABLED=False)
    def test_off_until_turned_on(self):
        with patch(CONVERSE) as conv:
            r = self.client_for(self.nurse).post(self.URL, {"message": "hi"}, format="json")
        self.assertEqual(r.status_code, 503)
        conv.assert_not_called()

    @override_settings(DOCUMENTATION_ASSISTANT_MODEL_ID="", DICTATION_CLEANUP_MODEL_ID="")
    def test_off_without_a_model(self):
        r = self.client_for(self.nurse).post(self.URL, {"message": "hi"}, format="json")
        self.assertEqual(r.status_code, 503)

    def test_kill_switch(self):
        with patch.dict("os.environ", {"ASSISTANT_ENABLED": "false"}):
            r = self.client_for(self.nurse).post(self.URL, {"message": "hi"}, format="json")
        self.assertEqual(r.status_code, 503)

    def test_status_endpoint(self):
        url = "/api/documentation-assistant/status/"
        self.assertEqual(self.client_for(self.nurse).get(url).json(), {"enabled": True})
        self.assertEqual(self.client_for(self.registrar).get(url).json(), {"enabled": False})
        with override_settings(DOCUMENTATION_ASSISTANT_ENABLED=False):
            self.assertEqual(self.client_for(self.nurse).get(url).json(), {"enabled": False})

    def test_empty_and_overlong_questions(self):
        c = self.client_for(self.nurse)
        self.assertEqual(c.post(self.URL, {"message": "  "}, format="json").status_code, 400)
        self.assertEqual(c.post(self.URL, {"message": "x" * 2000}, format="json").status_code, 400)

    def test_tool_loop_end_to_end_and_logging(self):
        replies = [
            call("search_patients", {"query": "Maria Lopez"}, "a"),
            call("get_patient_overview", {"patient_id": self.maria.pk}, "b"),
            say("Maria Lopez has a stable angina note."),
        ]
        seen = []

        def fake(system, messages, tools, max_tokens):
            seen.append(copy.deepcopy(messages))  # the loop reuses one list, so keep what each call was sent
            return replies[len(seen) - 1]

        with patch(CONVERSE, side_effect=fake):
            r = self.client_for(self.nurse).post(self.URL, {"message": "Summarize Maria Lopez"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["answer"], "Maria Lopez has a stable angina note.")
        self.assertEqual((body["actions"], body["confirmations"]), ([], []))
        self.assertEqual(len(seen), 3)

        # the model was handed real tool results for the right patient, as Bedrock toolResult blocks
        result_block = seen[1][-1]["content"][0]["toolResult"]
        self.assertEqual(result_block["status"], "success")
        self.assertEqual(result_block["content"][0]["json"]["patients"][0]["patient_id"], self.maria.pk)

        log = Log.objects.get()
        self.assertEqual((log.user_id, log.model, log.error), (self.nurse.pk, "test-model", ""))
        self.assertEqual([u["tool"] for u in log.tools_used], ["search_patients", "get_patient_overview"])
        self.assertEqual(log.tools_used[1]["args"], {"patient_id": self.maria.pk})
        self.assertEqual(log.tools_used[0]["args"], {"query_chars": 11})   # what was typed is not kept
        self.assertNotIn(self.maria_p.mrn, json.dumps(log.tools_used))     # nor any chart data
        self.assertEqual((log.input_tokens, log.output_tokens), (50, 21))
        self.assertTrue(Access.objects.filter(user=self.nurse, patient_id=self.maria.pk, tool="get_patient_overview").exists())

    def test_tools_offered_depend_on_the_user(self):
        with patch(CONVERSE, return_value=say("ok")) as conv:
            self.client_for(self.nurse).post(self.URL, {"message": "hi"}, format="json")
        offered = {t["name"] for t in conv.call_args.args[2]}
        self.assertIn("search_patients", offered)

    def test_follow_up_replays_text_only(self):
        c = self.client_for(self.nurse)
        with patch(CONVERSE, return_value=say("First answer")):
            first = c.post(self.URL, {"message": "First question"}, format="json").json()
        with patch(CONVERSE, return_value=say("Second answer")) as conv:
            c.post(self.URL, {"message": "Second question", "conversation_id": first["conversation_id"]}, format="json")
        sent = conv.call_args.args[1]
        self.assertEqual(
            [(m["role"], m["content"][0]["text"]) for m in sent],
            [("user", "First question"), ("assistant", "First answer"), ("user", "Second question")],
        )

    def test_open_chart_is_in_the_prompt_only_when_visible(self):
        c = self.client_for(self.nurse)
        with patch(CONVERSE, return_value=say("ok")) as conv:
            c.post(self.URL, {"message": "what meds?", "patient_id": self.maria.pk}, format="json")
        system = conv.call_args.args[0]
        self.assertIn(f"patient_id {self.maria.pk}", system)
        self.assertIn(self.maria_p.mrn, system)
        with patch(CONVERSE, return_value=say("ok")) as conv:
            c.post(self.URL, {"message": "what meds?", "patient_id": self.stranger.pk}, format="json")
        self.assertNotIn("currently has this patient's chart open", conv.call_args.args[0])
        self.assertNotIn(str(self.stranger.pk), conv.call_args.args[0])

    def test_rate_limit(self):
        with patch.dict("os.environ", {"ASSISTANT_RATE_LIMIT_PER_HOUR": "2"}), patch(CONVERSE, return_value=say("ok")):
            c = self.client_for(self.nurse)
            codes = [c.post(self.URL, {"message": f"q{i}"}, format="json").status_code for i in range(3)]
        self.assertEqual(codes, [200, 200, 429])

    def test_model_failure_is_a_clean_502_and_logged(self):
        with patch(CONVERSE, side_effect=RuntimeError("boom")):
            r = self.client_for(self.nurse).post(self.URL, {"message": "hi"}, format="json")
        self.assertEqual(r.status_code, 502)
        self.assertNotIn("boom", r.content.decode())
        self.assertEqual(Log.objects.get().error, "RuntimeError")

    def test_tool_error_reaches_the_model_as_an_error_result(self):
        replies = [call("get_patient_overview", {"patient_id": self.stranger.pk}), say("I can't open that chart.")]
        with patch(CONVERSE, side_effect=replies) as conv:
            r = self.client_for(self.nurse).post(self.URL, {"message": "open it"}, format="json")
        self.assertEqual(r.json()["answer"], "I can't open that chart.")
        block = conv.call_args_list[1].args[1][-1]["content"][0]["toolResult"]
        self.assertEqual(block["status"], "error")
        self.assertEqual(Access.objects.count(), 0)

    def test_runaway_tool_loop_ends_with_a_plain_answer(self):
        with patch(CONVERSE, side_effect=lambda *a, **k: call("search_patients", {"query": "lopez"})):
            r = self.client_for(self.nurse).post(self.URL, {"message": "loop"}, format="json")
        self.assertEqual(r.json()["answer"], A.TIMEOUT_ANSWER)

    def test_cut_off_answer_is_flagged(self):
        with patch(CONVERSE, return_value=say("Partial", stop="max_tokens")):
            r = self.client_for(self.nurse).post(self.URL, {"message": "long"}, format="json")
        self.assertIn("cut short", r.json()["answer"])

    def test_old_exchanges_are_purged_but_the_access_trail_stays(self):
        old = Log.objects.create(user=self.nurse, conversation_id="00000000-0000-0000-0000-000000000001", question="old", answer="old")
        Log.objects.filter(pk=old.pk).update(created_at=timezone.now() - datetime.timedelta(days=400))
        trail = Access.objects.create(user=self.nurse, patient_id=self.maria.pk, tool="get_visits")
        Access.objects.filter(pk=trail.pk).update(created_at=timezone.now() - datetime.timedelta(days=400))
        with patch.object(A, "_last_purge", 0.0), patch(CONVERSE, return_value=say("ok")):
            self.client_for(self.nurse).post(self.URL, {"message": "hi"}, format="json")
        self.assertFalse(Log.objects.filter(pk=old.pk).exists())
        self.assertTrue(Access.objects.filter(pk=trail.pk).exists())


class PromptTests(TestCase):
    def test_prompt_states_the_ground_rules(self):
        text = A.build_system_prompt(datetime.date(2026, 10, 15))
        for must in ("ONLY from tool results", "read-only", "DRAFT", "untrusted", "Never pick one yourself"):
            self.assertIn(must, text)
        self.assertNotIn("currently has this patient's chart open", text)


class BedrockClientTests(TestCase):
    def fake_client(self, content, stop="end_turn"):
        client = MagicMock()
        client.converse.return_value = {
            "output": {"message": {"role": "assistant", "content": content}},
            "stopReason": stop,
            "usage": {"inputTokens": 12, "outputTokens": 7},
        }
        return client

    @override_settings(DOCUMENTATION_ASSISTANT_MODEL_ID="m-1", DICTATION_CLEANUP_MODEL_ID="")
    def test_text_reply(self):
        client = self.fake_client([{"text": "Hello"}])
        with patch.object(B, "_get_client", return_value=client):
            out = B.converse("sys", [{"role": "user", "content": [{"text": "hi"}]}], [], 100)
        self.assertEqual((out["text"], out["tool_uses"], out["stop_reason"]), ("Hello", [], "end_turn"))
        self.assertEqual((out["input_tokens"], out["output_tokens"]), (12, 7))
        kwargs = client.converse.call_args.kwargs
        self.assertEqual(kwargs["modelId"], "m-1")
        self.assertNotIn("toolConfig", kwargs)                    # Bedrock rejects an empty tool list
        self.assertNotIn("temperature", kwargs["inferenceConfig"])  # some newer Claude models reject it

    @override_settings(DOCUMENTATION_ASSISTANT_MODEL_ID="m-1")
    def test_tool_use_reply_and_tool_config(self):
        client = self.fake_client([{"text": "Looking"}, {"toolUse": {"toolUseId": "u1", "name": "search_patients", "input": {"query": "x"}}}], "tool_use")
        tools = [{"name": "search_patients", "description": "d", "input_schema": {"type": "object", "properties": {}}}]
        with patch.object(B, "_get_client", return_value=client):
            out = B.converse("sys", [], tools, 100)
        self.assertEqual(out["tool_uses"], [{"id": "u1", "name": "search_patients", "input": {"query": "x"}}])
        spec = client.converse.call_args.kwargs["toolConfig"]["tools"][0]["toolSpec"]
        self.assertEqual((spec["name"], spec["inputSchema"]["json"]["type"]), ("search_patients", "object"))

    @override_settings(DOCUMENTATION_ASSISTANT_MODEL_ID="", DICTATION_CLEANUP_MODEL_ID="dictation-model")
    def test_model_falls_back_to_the_dictation_model(self):
        self.assertEqual(B.model_id(), "dictation-model")
        self.assertTrue(B.is_configured())

    @override_settings(DOCUMENTATION_ASSISTANT_MODEL_ID="", DICTATION_CLEANUP_MODEL_ID="")
    def test_unconfigured(self):
        self.assertFalse(B.is_configured())
