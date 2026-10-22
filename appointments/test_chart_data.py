"""Chart data fields: a note field that shows part of the patient's chart, read-only."""

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from .chart_data import SOURCES
from .models import HomeMedication, NoteFieldDefinition, PatientAllergy, PatientAllergyStatus, ProblemListEntry


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


class ChartDataTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.org = Organization.objects.create(name="Clinic")
        other = Organization.objects.create(name="Elsewhere")
        mk = lambda name, role, org=self.org: User.objects.create_user(
            username=name, email=f"{name}@x.com", password="pw-12345-xyz", role=role, organization=org
        )
        self.doctor = mk("doc", "doctor")
        self.nurse = mk("nur", "nurse")
        self.admin = mk("adm", "admin")
        self.patient = mk("pat", "patient")
        self.stranger = mk("far", "patient", other)
        self.api = client_for(self.doctor)

    def get(self, source, patient=None, api=None):
        patient = patient or self.patient
        return (api or self.api).get(f"/api/note-chart-data/?patient={patient.pk}&source={source}")

    # ---- access
    def test_unknown_source_is_refused(self):
        self.assertEqual(self.get("nonsense").status_code, 400)

    def test_patient_cannot_use_it(self):
        self.assertEqual(self.get("problems", api=client_for(self.patient)).status_code, 403)

    def test_other_clinic_patient_is_not_found(self):
        self.assertEqual(self.get("problems", patient=self.stranger).status_code, 404)

    def test_nurse_can_read(self):
        self.assertEqual(self.get("problems", api=client_for(self.nurse)).status_code, 200)

    def test_every_source_answers_for_an_empty_chart(self):
        for source in SOURCES:
            res = self.get(source)
            self.assertEqual(res.status_code, 200, f"{source}: {res.content}")
            body = res.json()
            self.assertEqual(body["source"], source)
            self.assertIn("title", body)

    # ---- sources
    def test_problems_lists_only_open_problems(self):
        mk = lambda d, c, s: ProblemListEntry.objects.create(
            organization=self.org, patient=self.patient, description=d, code=c, status=s
        )
        mk("Type 2 diabetes mellitus with hyperglycemia", "E11.65", "active")
        mk("Essential hypertension", "I10", "chronic")
        mk("Acute bronchitis", "J20.9", "resolved")
        body = self.get("problems").json()
        self.assertEqual([r["code"] for r in body["rows"]], ["E11.65", "I10"])
        self.assertEqual(body["columns"][0]["key"], "description")

    def test_allergies_empty_text_tells_unknown_from_none(self):
        self.assertEqual(self.get("allergies").json()["empty"], "Not documented.")
        PatientAllergyStatus.objects.create(patient=self.patient, no_known_allergies=True)
        self.assertEqual(self.get("allergies").json()["empty"], "No known allergies.")

    def test_allergies_rows(self):
        PatientAllergy.objects.create(
            organization=self.org, patient=self.patient, substance="Penicillin", reaction="Hives", severity="moderate"
        )
        PatientAllergy.objects.create(
            organization=self.org, patient=self.patient, substance="Latex", status="inactive"
        )
        rows = self.get("allergies").json()["rows"]
        self.assertEqual([(r["substance"], r["severity"]) for r in rows], [("Penicillin", "Moderate")])

    def test_medications_rows_skip_stopped(self):
        HomeMedication.objects.create(
            organization=self.org, patient=self.patient, drug_name="Metformin", strength="500 mg", status="active"
        )
        HomeMedication.objects.create(
            organization=self.org, patient=self.patient, drug_name="Old drug", status="stopped"
        )
        rows = self.get("medications").json()["rows"]
        self.assertEqual([r["drug"] for r in rows], ["Metformin 500 mg"])

    # ---- what a note keeps
    def test_capture_replaces_whatever_the_client_sent(self):
        from types import SimpleNamespace

        from .chart_data import capture

        ProblemListEntry.objects.create(
            organization=self.org, patient=self.patient, description="Essential hypertension", code="I10", status="active"
        )
        fields = [
            SimpleNamespace(key="problems", field_type="chart_data", calc={"source": "problems"}),
            SimpleNamespace(key="hpi", field_type="textarea", calc={}),
        ]
        values = {"problems": {"rows": [{"description": "Made up"}]}, "hpi": "Cough"}
        capture(values, fields, self.patient, self.doctor)
        self.assertEqual(values["hpi"], "Cough")
        self.assertEqual(values["problems"]["rows"][0]["code"], "I10")
        self.assertEqual(values["problems"]["source"], "problems")
        self.assertIn("captured_at", values["problems"])

    def test_capture_skips_a_field_with_an_unknown_source(self):
        from types import SimpleNamespace

        from .chart_data import capture

        values = {}
        capture(values, [SimpleNamespace(key="x", field_type="chart_data", calc={"source": "nope"})], self.patient, self.doctor)
        self.assertEqual(values, {})

    # ---- template builder
    def payload(self, **field):
        base = {
            "client_id": "c1", "key": "problems", "label": "Problem list", "field_type": "chart_data",
            "section_label": "", "tab_label": "", "required": True, "help_text": "", "sort_order": 0,
            "calc": {"source": "problems"},
        }
        base.update(field)
        return {"code": "chart_note", "name": "Chart Note", "kind": "note", "is_active": True, "fields": [base]}

    def test_template_saves_a_chart_data_field_and_ignores_required(self):
        res = client_for(self.admin).post("/api/admin/note-templates/", self.payload(), format="json")
        self.assertEqual(res.status_code, 201, res.content)
        field = NoteFieldDefinition.objects.get(template__code="chart_note", key="problems")
        self.assertEqual(field.calc, {"source": "problems"})
        self.assertFalse(field.required)

    def test_template_needs_a_known_source(self):
        res = client_for(self.admin).post("/api/admin/note-templates/", self.payload(calc={}), format="json")
        self.assertEqual(res.status_code, 400)
        res = client_for(self.admin).post(
            "/api/admin/note-templates/", self.payload(calc={"source": "nope"}), format="json"
        )
        self.assertEqual(res.status_code, 400)
