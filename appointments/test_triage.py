import datetime as dt

from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import CustomUser, Organization, Patient, Registration

from . import triage_engine as e
from .models import Appointment, ClinicalNote, FlowsheetTemplate, TriageSettings, VitalSignsFlowsheet

ADULT = 58 * 365
TODDLER = 850        # about 2 years 4 months
TWO_MONTHS = 62


def answers(**over):
    base = {"a_life_saving": False, "b_high_risk": False, "b_confused": False, "b_severe_pain": False, "resources": None, "immunization_incomplete": False}
    base.update(over)
    return base


class EngineTests(SimpleTestCase):
    def test_a_yes_is_level_1(self):
        r = e.suggest(answers(a_life_saving=True), ADULT, {})
        self.assertEqual(r["level"], 1)
        self.assertEqual(r["label"], "ESI 1: Resuscitation")

    def test_b_items_make_level_2_with_reason(self):
        r = e.suggest(answers(b_high_risk=True, b_severe_pain=True), ADULT, {})
        self.assertEqual(r["level"], 2)
        self.assertIn("high-risk situation", r["reasons"][0])
        self.assertIn("severe pain", r["reasons"][0])

    def test_resources_decide_levels_3_to_5(self):
        for count, level in ((0, 5), (1, 4), (2, 3), (6, 3)):
            self.assertEqual(e.suggest(answers(resources=count), ADULT, {})["level"], level)

    def test_unanswered_resources_asks_for_them(self):
        r = e.suggest(answers(), ADULT, {})
        self.assertIsNone(r["level"])
        self.assertTrue(r["needs"])

    def test_level_3_with_danger_zone_vitals_considers_2(self):
        r = e.suggest(answers(resources=2), ADULT, {"hr": 112, "rr": 22, "spo2": 97})
        self.assertEqual(r["level"], 3)
        self.assertEqual(r["consider"], 2)
        self.assertEqual(r["label"], "ESI 3, consider 2")
        self.assertIn("heart rate over 100", r["steps"]["D"]["text"])

    def test_limit_is_over_not_equal(self):
        r = e.suggest(answers(resources=2), ADULT, {"hr": 100, "rr": 20, "spo2": 92})
        self.assertIsNone(r["consider"])
        self.assertEqual(r["label"], "ESI 3: Urgent")

    def test_low_oxygen_is_danger_zone(self):
        r = e.suggest(answers(resources=2), ADULT, {"spo2": 91})
        self.assertEqual(r["consider"], 2)

    def test_danger_zone_only_matters_for_level_3(self):
        r = e.suggest(answers(resources=1), ADULT, {"hr": 130})
        self.assertEqual(r["level"], 4)
        self.assertIsNone(r["consider"])
        self.assertEqual(r["vital_flags"]["hr"]["status"], "high")

    def test_child_uses_age_band(self):
        flags = e.vital_flags(TODDLER, {"hr": 168, "rr": 36})
        self.assertEqual(flags["hr"]["limit"], 160)
        self.assertEqual(flags["hr"]["status"], "high")
        self.assertEqual(flags["rr"]["status"], "ok")
        self.assertEqual(e.band_for(40).get("label"), "Under 3 months")
        self.assertEqual(e.band_for(92)["label"], "3 months to under 3 years")
        self.assertEqual(e.band_for(365 * 5)["label"], "3 to under 8 years")
        self.assertEqual(e.band_for(365 * 9)["label"], "8 years and older")

    def test_toddler_example_from_the_design(self):
        r = e.suggest(answers(resources=2, immunization_incomplete=True), TODDLER, {"hr": 168, "rr": 36, "spo2": 97, "temp_f": 102.9})
        self.assertEqual(r["level"], 3)
        self.assertEqual(r["consider"], 2)
        self.assertTrue(any("102.2" in p for p in r["prompts"]))
        self.assertIn("fever with incomplete immunizations", r["reasons"])

    def test_neonate_fever_is_always_at_least_level_2(self):
        r = e.suggest(answers(resources=0), 20, {"temp_f": 100.6})
        self.assertEqual(r["level"], 2)
        self.assertIn("28 days", r["reasons"][0])

    def test_exactly_100_4_is_not_a_fever(self):
        self.assertEqual(e.f_to_c(100.4), 38.0)
        self.assertIsNone(e.fever_kind(20, 100.4))
        self.assertEqual(e.fever_kind(20, 100.5), "neonate")

    def test_young_infant_fever_considers_2(self):
        r = e.suggest(answers(resources=1), TWO_MONTHS, {"temp_f": 101.0})
        self.assertEqual(r["level"], 4)
        self.assertEqual(r["consider"], 2)

    def test_older_child_fever_considers_3_or_2(self):
        r4 = e.suggest(answers(resources=1), 365, {"temp_f": 103.0})
        self.assertEqual((r4["level"], r4["consider"]), (4, 3))
        r3 = e.suggest(answers(resources=2), 365, {"temp_f": 103.0})
        self.assertEqual((r3["level"], r3["consider"]), (3, 2))
        self.assertIsNone(e.suggest(answers(resources=1), 365, {"temp_f": 101.5})["consider"])

    def test_fever_rules_are_for_children_only(self):
        self.assertEqual(e.vital_flags(ADULT, {"temp_f": 103})["temp"]["status"], "ok")
        self.assertEqual(e.vital_flags(365 * 17, {"temp_f": 103})["temp"]["status"], "fever")
        r = e.suggest(answers(resources=1), ADULT, {"temp_f": 103})
        self.assertEqual((r["level"], r["consider"], r["prompts"]), (4, None, []))

    def test_check_level(self):
        sug = {"level": 2}
        self.assertEqual(e.check_level(2, sug, ""), [])
        self.assertTrue(e.check_level(3, sug, ""))
        self.assertEqual(e.check_level(3, sug, "Stable on recheck"), [])
        self.assertTrue(e.check_level(6, sug, "x"))
        self.assertTrue(e.check_level("abc", sug, "x"))
        self.assertTrue(e.check_level(None, sug, "x"))

    def test_recheck_gap_is_blank_until_set(self):
        self.assertIsNone(e.reassessment_gap_minutes(3, {}))
        self.assertEqual(e.reassessment_gap_minutes(3, {"3": 60}), 60)
        self.assertIsNone(e.reassessment_gap_minutes(3, {"3": "x"}))

    def test_clinic_table_replaces_default(self):
        zone = {"bands": [{"label": "All", "min_months": 0, "max_months": None, "hr_over": 90, "rr_over": 18}], "spo2_below": 94}
        r = e.suggest(answers(resources=2), ADULT, {"hr": 95}, zone)
        self.assertEqual(r["consider"], 2)


class ApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="A")
        self.other = Organization.objects.create(name="B")
        self.nurse = self.user("nurse1", "nurse", self.org)
        self.admin = self.user("admin1", "admin", self.org)
        self.front = self.user("front1", "registrar", self.org)
        self.stranger = self.user("nurse2", "nurse", self.other)
        self.doctor = self.user("doc1", "doctor", self.org)
        self.adult = self.user("marcus", "patient", self.org, dob=timezone.localdate() - dt.timedelta(days=58 * 365 + 20), sex="M")
        self.child = self.user("lily", "patient", self.org, dob=timezone.localdate() - dt.timedelta(days=TODDLER), sex="F")
        self.client = APIClient()
        self.client.force_authenticate(self.nurse)

    def user(self, username, role, org, dob=None, sex=""):
        u = CustomUser.objects.create_user(username=username, password="x", role=role, organization=org)
        if dob:
            profile, _ = Patient.objects.get_or_create(user=u)
            profile.date_of_birth, profile.legal_sex, profile.organization = dob, sex, org
            profile.save()
        return CustomUser.objects.get(pk=u.pk)

    def appointment(self, patient):
        return Appointment.objects.create(organization=self.org, patient=patient, provider=self.doctor, title="ED visit", appointment_datetime=timezone.now())

    def visit(self, patient, appt):
        return Registration.objects.create(patient=Patient.objects.get(user=patient), organization=self.org, care_setting="emergency",
                                           reason_for_visit="Chest pain", appointment=appt)

    def vitals(self, patient, appt, **values):
        template, _ = FlowsheetTemplate.objects.get_or_create(code="vital_signs", defaults={"name": "Vital Signs"})
        data = {k: {"c1": str(v)} for k, v in values.items()}
        VitalSignsFlowsheet.objects.create(organization=self.org, template=template, appointment=appt, patient=patient,
                                           columns=[{"id": "c1", "timestamp": timezone.now().isoformat()}], data=data)

    def url(self, tail, patient=None):
        return f"/api/triage/patient/{(patient or self.adult).pk}/{tail}"

    # ---- context and suggest ----
    def test_context_shows_vitals_flags_and_band(self):
        appt = self.appointment(self.adult)
        self.visit(self.adult, appt)
        self.vitals(self.adult, appt, heart_rate=112, resp_rate=22, spo2=94, temperature_f=98.6, bp_systolic=168, bp_diastolic=94, weight_lb=203)
        body = self.client.get(self.url("context/")).json()
        self.assertEqual(body["problem"], "")
        self.assertFalse(body["patient"]["is_child"])
        self.assertEqual(body["vital_flags"]["hr"]["status"], "high")
        self.assertEqual(body["vital_flags"]["spo2"]["status"], "ok")
        self.assertNotIn("sbp", body["vital_flags"])
        self.assertEqual(body["band"]["hr_over"], 100)
        self.assertEqual(body["vitals"]["weight_kg"], 92.1)
        self.assertEqual(body["visit"]["reason_for_visit"], "Chest pain")
        self.assertFalse(body["screener"]["verified"])
        self.assertEqual(len(body["screener"]["questions"]), 6)

    def test_context_for_a_child(self):
        body = self.client.get(self.url("context/", self.child)).json()
        self.assertTrue(body["patient"]["is_child"])
        self.assertFalse(body["patient"]["show_suicide_screen"])
        self.assertEqual(body["band"]["label"], "3 months to under 3 years")

    def test_no_dob_is_reported(self):
        nodob = self.user("nodob", "patient", self.org)
        self.assertEqual(self.client.get(self.url("context/", nodob)).json()["problem"], "no_dob")

    def test_access_rules(self):
        self.client.force_authenticate(self.front)
        self.assertEqual(self.client.get(self.url("context/")).status_code, 403)
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(self.url("context/")).status_code, 404)

    def test_suggest_uses_latest_vitals(self):
        appt = self.appointment(self.adult)
        self.vitals(self.adult, appt, heart_rate=112)
        r = self.client.post(self.url("suggest/"), {"resources": 2}, format="json").json()
        self.assertEqual(r["level"], 3)
        self.assertEqual(r["consider"], 2)
        r = self.client.post(self.url("suggest/"), {"b_high_risk": True}, format="json").json()
        self.assertEqual(r["level"], 2)

    # ---- clinic settings ----
    def test_settings_default_and_admin_only_write(self):
        body = self.client.get("/api/triage/settings/").json()
        self.assertEqual(body["reassess_minutes"], {})
        self.assertFalse(body["clinic"]["danger_zone"])
        self.assertEqual(self.client.put("/api/triage/settings/", {"reassess_minutes": {"3": 60}}, format="json").status_code, 403)

    def test_admin_saves_numbers_and_is_recorded_as_approver(self):
        self.client.force_authenticate(self.admin)
        zone = {"bands": [{"label": "All", "min_months": 0, "max_months": None, "hr_over": 90, "rr_over": 18}], "spo2_below": 94}
        r = self.client.put("/api/triage/settings/", {"danger_zone": zone, "reassess_minutes": {"3": 45, "4": ""}, "suicide_screen_min_age_years": 12}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        row = TriageSettings.objects.get(organization=self.org)
        self.assertEqual(row.approved_by, self.admin)
        self.assertEqual(row.reassess_minutes, {"3": 45})
        self.assertEqual(r.json()["clinic"]["approved_by"], "admin1")
        appt = self.appointment(self.adult)
        self.vitals(self.adult, appt, heart_rate=95)
        self.client.force_authenticate(self.nurse)
        self.assertEqual(self.client.post(self.url("suggest/"), {"resources": 2}, format="json").json()["consider"], 2)
        self.client.force_authenticate(self.admin)
        self.client.put("/api/triage/settings/", {"danger_zone": None}, format="json")
        self.client.force_authenticate(self.nurse)
        self.assertIsNone(self.client.post(self.url("suggest/"), {"resources": 2}, format="json").json()["consider"])

    def test_age_bands_are_named_from_their_limits(self):
        self.assertEqual(e.band_label(0, 3), "Under 3 months")
        self.assertEqual(e.band_label(3, 36), "3 months to under 3 years")
        self.assertEqual(e.band_label(36, 96), "3 years to under 8 years")
        self.assertEqual(e.band_label(96, None), "8 years and older")
        self.assertEqual(e.band_label(0, 1.5), "Under 1.5 months")

    def test_saved_age_table_gets_labels_even_when_sent_without(self):
        self.client.force_authenticate(self.admin)
        zone = {"bands": [{"min_months": 0, "max_months": 12, "hr_over": 170, "rr_over": 45},
                          {"min_months": 12, "max_months": None, "hr_over": 110, "rr_over": 22}], "spo2_below": 93}
        r = self.client.put("/api/triage/settings/", {"danger_zone": zone}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([b["label"] for b in r.json()["danger_zone"]["bands"]], ["Under 12 months", "12 months and older"])
        appt = self.appointment(self.adult)
        self.visit(self.adult, appt)
        self.client.force_authenticate(self.nurse)
        body = self.client.get(self.url("context/")).json()
        self.assertEqual(body["band"]["label"], "12 months and older")

    def test_bad_settings_are_refused(self):
        self.client.force_authenticate(self.admin)
        for body in (
            {"danger_zone": {"bands": [], "spo2_below": 92}},
            {"danger_zone": {"bands": [{"min_months": 5, "max_months": None, "hr_over": 100, "rr_over": 20}], "spo2_below": 92}},
            {"danger_zone": {"bands": [{"min_months": 0, "max_months": 12, "hr_over": 100, "rr_over": 20}], "spo2_below": 92}},
            {"danger_zone": {"bands": [{"min_months": 0, "max_months": None, "hr_over": "x", "rr_over": 20}], "spo2_below": 92}},
            {"reassess_minutes": {"9": 30}}, {"reassess_minutes": {"3": 0}}, {"suicide_screen_min_age_years": 40}, {"fever": {"fever_c": "hot"}},
        ):
            self.assertEqual(self.client.put("/api/triage/settings/", body, format="json").status_code, 400, body)

    # ---- signing ----
    def note(self, patient, appt, **fields):
        data = {"chief_complaint": "chest_pain", "esi_b_high_risk": True, "esi_level": 2}
        data.update(fields)
        return ClinicalNote.objects.create(organization=self.org, appointment=appt, patient=patient, author=self.nurse, note_type="nursing_assessment",
                                           documentation_type="triage_note", structured_data=data)

    def sign(self, note):
        return self.client.post(f"/api/clinical-notes/{note.pk}/sign/")

    def test_signing_saves_snapshot_and_writes_level_to_the_visit(self):
        appt = self.appointment(self.adult)
        visit = self.visit(self.adult, appt)
        self.vitals(self.adult, appt, heart_rate=112, resp_rate=22)
        note = self.note(self.adult, appt)
        r = self.sign(note)
        self.assertEqual(r.status_code, 200, r.content)
        note.refresh_from_db()
        visit.refresh_from_db()
        self.assertEqual(note.status, "signed")
        self.assertEqual(visit.esi, 2)
        snap = note.structured_data["triage_snapshot"]
        self.assertEqual(snap["suggested_level"], 2)
        self.assertEqual(snap["vitals"]["hr"], 112)
        self.assertEqual(snap["suicide_screen_action"], "none")
        self.assertFalse(snap["screener_verified"])

    def test_level_that_differs_needs_a_reason(self):
        appt = self.appointment(self.adult)
        self.visit(self.adult, appt)
        self.vitals(self.adult, appt, heart_rate=80)
        note = self.note(self.adult, appt, esi_level=3)
        r = self.sign(note)
        self.assertEqual(r.status_code, 400)
        self.assertIn("reason", r.json()["detail"])
        note.refresh_from_db()
        self.assertEqual(note.status, "draft")
        note.structured_data["esi_override_reason"] = "Stable after repeat ECG"
        note.save()
        self.assertEqual(self.sign(note).status_code, 200)

    def test_missing_pieces_stop_signing(self):
        appt = self.appointment(self.adult)
        self.visit(self.adult, appt)
        note = self.note(self.adult, appt, chief_complaint="", esi_level="")
        r = self.sign(note)
        self.assertEqual(r.status_code, 400)
        problems = " ".join(r.json()["problems"])
        self.assertIn("chief complaint", problems)
        self.assertIn("vital signs", problems)
        self.assertIn("triage level", problems)

    def test_child_needs_a_weight(self):
        appt = self.appointment(self.child)
        self.vitals(self.child, appt, heart_rate=120)
        note = self.note(self.child, appt, esi_b_high_risk=False, esi_resources=1, esi_level=4)
        self.assertIn("weight", " ".join(self.sign(note).json()["problems"]))
        note.structured_data["child_weight_kg"] = "13.2"
        note.save()
        self.assertEqual(self.sign(note).status_code, 200)

    def test_child_weight_can_come_from_the_flowsheet(self):
        appt = self.appointment(self.child)
        self.vitals(self.child, appt, heart_rate=120, weight_lb=29)
        note = self.note(self.child, appt, esi_b_high_risk=False, esi_resources=1, esi_level=4)
        self.assertEqual(self.sign(note).status_code, 200)

    def test_suicide_screen_action(self):
        from . import triage_service as s
        self.assertEqual(s.cssrs_action({}), "none")
        self.assertEqual(s.cssrs_action({"cssrs_1": "yes"}), "referral")
        self.assertEqual(s.cssrs_action({"cssrs_2": "yes", "cssrs_3": "yes"}), "referral")
        self.assertEqual(s.cssrs_action({"cssrs_6": "yes", "cssrs_6_recent": "no"}), "referral")
        self.assertEqual(s.cssrs_action({"cssrs_6": "yes", "cssrs_6_recent": "yes"}), "immediate")
        self.assertEqual(s.cssrs_action({"cssrs_2": "yes", "cssrs_4": "yes"}), "immediate")
        self.assertEqual(s.cssrs_action({"cssrs_5": "yes"}), "immediate")

    def test_other_notes_are_not_affected(self):
        appt = self.appointment(self.adult)
        plain = ClinicalNote.objects.create(organization=self.org, appointment=appt, patient=self.adult, author=self.nurse,
                                            note_type="nursing_assessment", documentation_type="progress_note")
        self.assertEqual(self.sign(plain).status_code, 200)

    def test_template_seed_builds_the_note(self):
        import importlib
        from django.apps import apps
        from .models import NoteFieldDefinition, NoteTemplate
        mod = importlib.import_module("appointments.migrations.0064_seed_triage_note")
        mod.seed(apps, None)
        mod.seed(apps, None)   # running twice changes nothing
        t = NoteTemplate.objects.get(code="triage_note")
        fields = {f.key: f for f in NoteFieldDefinition.objects.filter(template=t)}
        self.assertEqual(len(fields), len(mod.FIELDS))
        self.assertTrue(fields["esi_level"].required)
        self.assertEqual(fields["cssrs_6_recent"].depends_on.key, "cssrs_6")
        self.assertEqual(fields["cssrs_3"].depends_on_value, "yes")
        self.assertEqual(fields["arrival_mode"].dictionary.code, "triage_arrival_mode")
        # every key the service reads exists in the template
        for key in ("esi_a_life_saving", "esi_b_high_risk", "esi_b_confused", "esi_b_severe_pain", "esi_resources", "esi_level",
                    "esi_override_reason", "chief_complaint", "child_weight_kg", "child_immunizations", "cssrs_1", "cssrs_2", "cssrs_3",
                    "cssrs_4", "cssrs_5", "cssrs_6", "cssrs_6_recent"):
            self.assertIn(key, fields)
