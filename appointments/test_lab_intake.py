"""Lab results intake: HL7 and FHIR readers, patient matching, add-on gating,
duplicates, updates, cancellation, the unmatched queue, and key authentication."""

import json
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Organization

from . import lab_fhir, lab_hl7, lab_intake
from . import orders_workflow as ow
from .models import Appointment, LabInboundMessage, LabInterfaceConnection, LabReport, Orderable

User = get_user_model()
HL7_URL = "/api/lab-interface/hl7/"
FHIR_URL = "/api/lab-interface/fhir/"
MSG_URL = "/api/lab-messages/"


def hl7(control="MSG1", mrn="MRN-000001", last="DOE", first="JANE", dob="19800115", placer="", filler="ACC1",
        status="F", obx=None, extra_obr=""):
    obx = obx or [
        "OBX|1|NM|2823-3^Potassium^LN||5.4|mmol/L|3.5-5.0|H|||F",
        "OBX|2|NM|2951-2^Sodium^LN||140|mmol/L|135-145|N|||F",
    ]
    lines = [
        f"MSH|^~\\&|QUEST|QDX|POWER|CLINIC|20261001101500||ORU^R01|{control}|P|2.5.1",
        f"PID|1||{mrn}^^^CLINIC^MR||{last}^{first}||{dob}|F",
        f"ORC|RE|{placer}|{filler}",
        f"OBR|1|{placer}|{filler}|80048^Basic metabolic panel^CPT|||20261001080000|||||||||||||||20261001101000|||{status}",
        *obx,
    ]
    return "\r".join(lines) + "\r" + extra_obr


class ReaderTests(SimpleTestCase):
    def test_hl7_basic(self):
        p = lab_hl7.parse_oru(hl7(placer="ORD-00000007"))
        self.assertEqual(p["control_id"], "MSG1")
        self.assertEqual(p["patient"]["last"], "DOE")
        self.assertEqual(p["patient"]["dob"], date(1980, 1, 15))
        self.assertIn("MRN-000001", p["patient"]["ids"])
        r = p["reports"][0]
        self.assertEqual((r["placer"], r["filler"], r["status"]), ("ORD-00000007", "ACC1", "final"))
        self.assertEqual([i["test_name"] for i in r["items"]], ["Potassium", "Sodium"])
        self.assertEqual(r["items"][0]["abnormal_flag"], "H")
        self.assertEqual(r["items"][1]["abnormal_flag"], "")
        self.assertEqual(r["items"][0]["loinc_code"], "2823-3")

    def test_hl7_newlines_and_multiple_obr(self):
        extra = "OBR|2||ACC2|85025^CBC^CPT||||||||||||||||||||F\rOBX|1|NM|718-7^Hemoglobin^LN||9.1|g/dL|12-16|L|||F\r"
        text = hl7(extra_obr=extra).replace("\r", "\n")
        p = lab_hl7.parse_oru(text)
        self.assertEqual(len(p["reports"]), 2)
        self.assertEqual(p["reports"][1]["items"][0]["abnormal_flag"], "L")

    def test_hl7_escapes_and_flags_and_documents(self):
        obx = [
            "OBX|1|ST|X^Comment||Value with \\F\\ pipe||||A|||F",
            "OBX|2|NM|K^Potassium||7.1|mmol/L|3.5-5.0|HH|||F",
            "OBX|3|ED|PDF^Report||^^^^base64data||||||F",
        ]
        r = lab_hl7.parse_oru(hl7(obx=obx))["reports"][0]
        self.assertEqual(r["items"][0]["value"], "Value with | pipe")
        self.assertEqual(r["items"][1]["abnormal_flag"], "HH")
        self.assertTrue(r["has_document"])
        self.assertEqual(len(r["items"]), 2)

    def test_hl7_statuses(self):
        self.assertEqual(lab_hl7.parse_oru(hl7(status="P"))["reports"][0]["status"], "preliminary")
        self.assertEqual(lab_hl7.parse_oru(hl7(status="C"))["reports"][0]["status"], "corrected")
        self.assertEqual(lab_hl7.parse_oru(hl7(status="X"))["reports"][0]["status"], "cancelled")

    def test_hl7_rejects_bad_messages(self):
        for bad in ("", "hello", "MSH|^~\\&|A|B|C|D|2026||ADT^A01|1|P|2.5\rPID|1||x", hl7().split("\r")[0] + "\r"):
            with self.assertRaises(lab_hl7.Hl7Error):
                lab_hl7.parse_oru(bad)

    def test_ack(self):
        ack = lab_hl7.build_ack("AA", "MSG1", "ok", "QUEST", "QDX")
        self.assertIn("MSA|AA|MSG1", ack)
        self.assertTrue(ack.startswith("MSH|"))

    def test_fhir_bundle(self):
        bundle = {
            "resourceType": "Bundle",
            "id": "b1",
            "type": "message",
            "entry": [
                {"resource": {"resourceType": "Patient", "id": "p1", "identifier": [{"value": "MRN-000001"}],
                              "name": [{"family": "Doe", "given": ["Jane"]}], "birthDate": "1980-01-15"}},
                {"resource": {"resourceType": "Observation", "id": "o1", "status": "final",
                              "code": {"coding": [{"system": "http://loinc.org", "code": "2823-3", "display": "Potassium"}]},
                              "valueQuantity": {"value": 5.4, "unit": "mmol/L"},
                              "interpretation": [{"coding": [{"code": "H"}]}],
                              "referenceRange": [{"low": {"value": 3.5}, "high": {"value": 5.0}}]}},
                {"resource": {"resourceType": "DiagnosticReport", "id": "r1", "status": "final",
                              "identifier": [{"value": "ACC9"}],
                              "code": {"text": "Basic metabolic panel"}, "subject": {"reference": "Patient/p1"},
                              "result": [{"reference": "Observation/o1"}]}},
            ],
        }
        p = lab_fhir.parse_bundle(bundle)
        self.assertEqual(p["patient"]["last"], "Doe")
        r = p["reports"][0]
        self.assertEqual(r["filler"], "ACC9")
        self.assertEqual(r["items"][0]["abnormal_flag"], "H")
        with self.assertRaises(lab_fhir.FhirError):
            lab_fhir.parse_bundle({"resourceType": "Patient"})


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A", lab_interface_enabled=True)
        self.other = Organization.objects.create(name="Clinic B", lab_interface_enabled=True)
        mk = lambda u, role, org, **kw: User.objects.create_user(
            username=u, email=f"{u}@x.com", password="pw-12345-xyz", role=role, organization=org, **kw)
        self.doctor = mk("doc", "doctor", self.org)
        self.nurse = mk("nurse", "nurse", self.org)
        self.reg = mk("reg", "registrar", self.org)
        self.patient = mk("jane", "patient", self.org, first_name="Jane", last_name="Doe")
        self.patient2 = mk("john", "patient", self.org, first_name="John", last_name="Roe")
        self.stranger = mk("out", "patient", self.other, first_name="Jane", last_name="Doe")
        for u, dob in ((self.patient, date(1980, 1, 15)), (self.patient2, date(1975, 5, 5)), (self.stranger, date(1980, 1, 15))):
            prof = u.patient_profile
            prof.date_of_birth, prof.organization = dob, u.organization
            prof.save()
            prof.refresh_from_db()
        self.mrn = self.patient.patient_profile.mrn
        self.mrn2 = self.patient2.patient_profile.mrn
        self.conn, self.key = self.make_connection(self.org, "Quest")
        self.client = APIClient()

    def make_connection(self, org, name):
        key = "lab_test_" + name
        c = LabInterfaceConnection.objects.create(
            organization=org, name=name, lab_name=name + " Diagnostics", key_hash=lab_intake.hash_key(key), key_prefix=key[:8])
        return c, key

    def post(self, body, key=None, url=HL7_URL, ctype="text/plain"):
        headers = {"HTTP_X_INTERFACE_KEY": key or self.key}
        return self.client.post(url, data=body, content_type=ctype, **headers)

    def msg(self, **kw):
        kw.setdefault("mrn", self.mrn)
        return hl7(**kw)

    def order_for(self, patient):
        appt = Appointment.objects.create(
            organization=self.org, patient=patient, provider=self.doctor, title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1))
        return ow.create_draft_order(self.doctor, appt, Orderable.objects.create(code="bmp", name="BMP", category="laboratory"))


class IntakeTests(Base):
    def test_matched_by_mrn_is_filed_and_acked(self):
        r = self.post(self.msg())
        self.assertEqual(r.status_code, 200)
        self.assertIn("MSA|AA|MSG1", r.content.decode())
        report = LabReport.objects.get()
        self.assertEqual((report.patient, report.source, report.status, report.review_status),
                         (self.patient, "interface", "final", "unreviewed"))
        self.assertEqual(report.performing_lab, "Quest Diagnostics")
        self.assertEqual(report.items.count(), 2)
        self.assertEqual(report.inbound_message.status, "processed")
        self.assertIn("received", [e.event_type for e in report.events.all()])

    def test_placer_order_number_links_the_order(self):
        order = self.order_for(self.patient)
        self.post(self.msg(placer=order.placer_order_number))
        self.assertEqual(LabReport.objects.get().order, order)

    def test_name_and_dob_match_when_unique(self):
        self.post(self.msg(mrn="", ))
        self.assertEqual(LabReport.objects.get().patient, self.patient)

    def test_name_match_never_crosses_organizations(self):
        # the other clinic's Jane Doe has the same DOB; only this clinic's is used
        self.post(self.msg(mrn=""))
        self.assertEqual(LabReport.objects.get().organization, self.org)

    def test_dob_mismatch_is_not_filed(self):
        r = self.post(self.msg(dob="19900101"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(LabReport.objects.count(), 0)
        m = LabInboundMessage.objects.get()
        self.assertEqual(m.status, "unmatched")
        self.assertIn("date of birth", m.detail)

    def test_order_and_mrn_for_different_patients_is_not_filed(self):
        order = self.order_for(self.patient2)
        self.post(self.msg(placer=order.placer_order_number))
        self.assertEqual(LabReport.objects.count(), 0)
        self.assertIn("different patients", LabInboundMessage.objects.get().detail)

    def test_ambiguous_name_and_dob_is_not_filed(self):
        twin = User.objects.create_user(username="twin", email="t@x.com", password="pw-12345-xyz", role="patient",
                                        organization=self.org, first_name="Jane", last_name="Doe")
        prof = twin.patient_profile
        prof.date_of_birth, prof.organization = date(1980, 1, 15), self.org
        prof.save()
        self.post(self.msg(mrn=""))
        self.assertEqual(LabInboundMessage.objects.get().status, "unmatched")
        self.assertIn("More than one", LabInboundMessage.objects.get().detail)

    def test_unknown_patient_is_kept_for_staff(self):
        r = self.post(self.msg(mrn="NOPE", last="NOBODY", first="X"))
        self.assertIn("MSA|AA", r.content.decode())  # accepted: we hold it, the lab need not resend
        self.assertEqual(LabInboundMessage.objects.get().status, "unmatched")

    def test_duplicate_control_id_is_acked_but_not_filed_twice(self):
        self.post(self.msg())
        r = self.post(self.msg())
        self.assertIn("MSA|AA", r.content.decode())
        self.assertEqual(LabReport.objects.count(), 1)
        self.assertEqual(LabInboundMessage.objects.count(), 1)

    def test_preliminary_then_final_updates_one_report(self):
        self.post(self.msg(control="M1", status="P"))
        self.post(self.msg(control="M2", status="F"))
        report = LabReport.objects.get()
        self.assertEqual(report.status, "final")

    def test_changed_result_resets_a_review(self):
        self.post(self.msg(control="M1"))
        report = LabReport.objects.get()
        report.review_status, report.reviewed_by, report.reviewed_at = "reviewed", self.doctor, timezone.now()
        report.save()
        obx = ["OBX|1|NM|2823-3^Potassium^LN||6.8|mmol/L|3.5-5.0|HH|||C"]
        self.post(self.msg(control="M2", status="C", obx=obx))
        report.refresh_from_db()
        self.assertEqual((report.review_status, report.status), ("unreviewed", "corrected"))
        self.assertEqual(report.items.get().abnormal_flag, "HH")
        self.assertIn("review_reset", [e.event_type for e in report.events.all()])

    def test_identical_resend_with_new_control_id_changes_nothing(self):
        self.post(self.msg(control="M1"))
        report = LabReport.objects.get()
        report.review_status, report.reviewed_by, report.reviewed_at = "reviewed", self.doctor, timezone.now()
        report.save()
        self.post(self.msg(control="M2"))
        report.refresh_from_db()
        self.assertEqual(report.review_status, "reviewed")
        self.assertEqual(LabReport.objects.count(), 1)

    def test_cancellation_marks_entered_in_error(self):
        self.post(self.msg(control="M1"))
        self.post(self.msg(control="M2", status="X"))
        self.assertEqual(LabReport.objects.get().status, "entered_in_error")

    def test_completes_a_signed_order(self):
        order = self.order_for(self.patient)
        ow.sign_order(order, self.doctor)
        order.refresh_from_db()
        self.assertEqual(order.status, "active")
        self.post(self.msg(placer=order.placer_order_number))
        order.refresh_from_db()
        self.assertEqual(order.status, "completed")
        self.assertEqual(order.filler_order_number, "ACC1")

    def test_a_draft_order_is_left_alone_but_the_result_is_still_filed(self):
        order = self.order_for(self.patient)
        self.post(self.msg(placer=order.placer_order_number))
        order.refresh_from_db()
        self.assertEqual(order.status, "draft")
        self.assertEqual(LabReport.objects.get().order, order)

    def test_two_reports_in_one_message(self):
        extra = "OBR|2||ACC2|85025^CBC^CPT||||||||||||||||||||F\rOBX|1|NM|718-7^Hemoglobin^LN||13|g/dL|12-16|N|||F\r"
        self.post(self.msg(extra_obr=extra))
        self.assertEqual(LabReport.objects.count(), 2)


class GatingAndAuthTests(Base):
    def test_missing_or_wrong_key_is_401(self):
        self.assertEqual(self.client.post(HL7_URL, data=self.msg(), content_type="text/plain").status_code, 401)
        self.assertEqual(self.post(self.msg(), key="wrong").status_code, 401)
        self.assertEqual(LabInboundMessage.objects.count(), 0)

    def test_disabled_connection_is_401(self):
        self.conn.is_active = False
        self.conn.save()
        self.assertEqual(self.post(self.msg()).status_code, 401)

    def test_add_on_off_is_403_with_reject_ack_and_nothing_stored(self):
        self.org.lab_interface_enabled = False
        self.org.save()
        r = self.post(self.msg())
        self.assertEqual(r.status_code, 403)
        self.assertIn("MSA|AR", r.content.decode())
        self.assertEqual(LabInboundMessage.objects.count(), 0)

    def test_malformed_message_is_400_reject(self):
        r = self.post("garbage")
        self.assertEqual(r.status_code, 400)
        self.assertIn("MSA|AR", r.content.decode())

    def test_get_not_allowed_and_mllp_framing_tolerated(self):
        self.assertEqual(self.client.get(HL7_URL, HTTP_X_INTERFACE_KEY=self.key).status_code, 405)
        self.assertEqual(self.post("\x0b" + self.msg() + "\x1c\r").status_code, 200)
        self.assertEqual(LabReport.objects.count(), 1)

    def test_one_clinic_key_cannot_file_into_another_clinic(self):
        conn_b, key_b = self.make_connection(self.other, "Labcorp")
        # message names clinic A's MRN, but arrives on clinic B's connection
        self.post(self.msg(), key=key_b)
        self.assertEqual(LabReport.objects.filter(patient=self.patient).count(), 0)

    def test_fhir_endpoint(self):
        bundle = {"resourceType": "Bundle", "id": "bx1", "type": "message", "entry": [
            {"resource": {"resourceType": "Patient", "id": "p1", "identifier": [{"value": self.mrn}],
                          "name": [{"family": "Doe", "given": ["Jane"]}], "birthDate": "1980-01-15"}},
            {"resource": {"resourceType": "Observation", "id": "o1", "status": "final",
                          "code": {"coding": [{"system": "http://loinc.org", "code": "2823-3", "display": "Potassium"}]},
                          "valueQuantity": {"value": 4.1, "unit": "mmol/L"}}},
            {"resource": {"resourceType": "DiagnosticReport", "id": "r1", "status": "final", "identifier": [{"value": "F1"}],
                          "code": {"text": "BMP"}, "subject": {"reference": "Patient/p1"}, "result": [{"reference": "Observation/o1"}]}},
        ]}
        r = self.post(json.dumps(bundle), url=FHIR_URL, ctype="application/json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(LabReport.objects.get().patient, self.patient)
        self.assertEqual(self.post("{bad", url=FHIR_URL, ctype="application/json").status_code, 400)
        self.assertEqual(self.client.post(FHIR_URL, data="{}", content_type="application/json").status_code, 401)


class UnmatchedQueueTests(Base):
    def setUp(self):
        super().setUp()
        self.post(self.msg(mrn="NOPE", last="SMYTH", first="JANE", dob="19800115"))
        self.message = LabInboundMessage.objects.get()
        self.client.force_authenticate(self.nurse)

    def test_list_and_scope(self):
        rows = self.client.get(MSG_URL).json()["results"]
        self.assertEqual([r["id"] for r in rows], [self.message.pk])
        self.assertIn("SMYTH", rows[0]["patient_hint"])
        outsider = User.objects.create_user(username="o2", email="o2@x.com", password="pw-12345-xyz", role="nurse", organization=self.other)
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(MSG_URL).json()["results"], [])
        self.assertEqual(self.client.get(f"{MSG_URL}{self.message.pk}/").status_code, 404)

    def test_registrar_and_patient_cannot_use_it(self):
        for u in (self.reg, self.patient):
            self.client.force_authenticate(u)
            self.assertEqual(self.client.get(MSG_URL).status_code, 403)

    def test_assign_by_mrn_files_the_report(self):
        r = self.client.post(f"{MSG_URL}{self.message.pk}/assign/", {"mrn": self.mrn2}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        report = LabReport.objects.get()
        self.assertEqual(report.patient, self.patient2)
        self.assertIn("assigned", [e.event_type for e in report.events.all()])
        self.message.refresh_from_db()
        self.assertEqual((self.message.status, self.message.resolved_by), ("assigned", self.nurse))
        # cannot assign twice
        self.assertEqual(self.client.post(f"{MSG_URL}{self.message.pk}/assign/", {"mrn": self.mrn}, format="json").status_code, 409)

    def test_assign_needs_a_real_patient_in_this_clinic(self):
        for body in ({}, {"mrn": "MRN-999999"}, {"mrn": self.stranger.patient_profile.mrn}, {"patient": self.stranger.pk}):
            r = self.client.post(f"{MSG_URL}{self.message.pk}/assign/", body, format="json")
            self.assertIn(r.status_code, (400, 404), body)
        self.assertEqual(LabReport.objects.count(), 0)

    def test_dismiss_needs_a_reason(self):
        self.assertEqual(self.client.post(f"{MSG_URL}{self.message.pk}/dismiss/", {}, format="json").status_code, 400)
        r = self.client.post(f"{MSG_URL}{self.message.pk}/dismiss/", {"reason": "Not our patient"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get(MSG_URL).json()["results"], [])
        self.assertEqual(self.client.get(MSG_URL, {"status": "dismissed"}).json()["count"], 1)

    def test_inbox_reports_unmatched_count(self):
        body = self.client.get("/api/lab-reports/inbox/").json()
        self.assertEqual(body["unmatched"], 1)


class CommandTests(TestCase):
    def test_create_rotate_disable(self):
        from io import StringIO
        org = Organization.objects.create(name="C")
        out = StringIO()
        call_command("lab_connection", "create", "--org", str(org.pk), "--name", "Quest", "--lab", "Quest Diagnostics", "--enable", stdout=out)
        key = [l for l in out.getvalue().splitlines() if l.startswith("lab_")][0]
        org.refresh_from_db()
        self.assertTrue(org.lab_interface_enabled)
        c = LabInterfaceConnection.objects.get()
        self.assertEqual(c.key_hash, lab_intake.hash_key(key))
        self.assertNotIn(key, c.key_hash)
        self.assertIsNotNone(lab_intake.authenticate(key))
        out2 = StringIO()
        call_command("lab_connection", "rotate", "--id", str(c.pk), stdout=out2)
        self.assertIsNone(lab_intake.authenticate(key))
        call_command("lab_connection", "disable", "--id", str(c.pk), stdout=StringIO())
        newkey = [l for l in out2.getvalue().splitlines() if l.startswith("lab_")][0]
        self.assertIsNone(lab_intake.authenticate(newkey))
