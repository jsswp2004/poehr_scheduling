"""Progress Note (Acute): the seeded template, and the two chart sources it adds."""

from datetime import timedelta
from importlib import import_module

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from .chart_data import SOURCES
from .models import (
    Appointment,
    FlowsheetTemplate,
    NoteFieldDefinition,
    NoteTemplate,
    Order,
    Orderable,
    VitalSignsFlowsheet,
)

seed_module = import_module("appointments.migrations.0073_seed_progress_note_acute")


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


class SeedTests(TestCase):
    def setUp(self):
        seed_module.seed(django_apps, None)
        self.template = NoteTemplate.objects.get(code="progress_note_acute")
        self.fields = {f.key: f for f in self.template.fields.all()}

    def test_template_and_tabs(self):
        self.assertEqual(self.template.name, "Progress Note (Acute)")
        self.assertEqual(self.template.note_type, "progress")
        tabs = []
        for f in self.template.fields.order_by("sort_order"):
            if f.tab_label not in tabs:
                tabs.append(f.tab_label)
        self.assertEqual(tabs, ["Subjective", "Objective", "Devices", "Assessment & Plan", "Attestation"])

    def test_chart_fields_use_known_sources(self):
        chart = [f for f in self.fields.values() if f.field_type == "chart_data"]
        self.assertEqual({f.calc["source"] for f in chart}, {"vitals", "intake_output", "inpatient_meds", "labs", "problems"})
        for f in chart:
            self.assertIn(f.calc["source"], SOURCES)
            self.assertFalse(f.required)

    def test_ros_has_eighteen_systems_each_with_findings_when_positive(self):
        statuses = [k for k in self.fields if k.startswith("ros_") and k.endswith("_status")]
        self.assertEqual(len(statuses), 18)
        findings = self.fields["ros_respiratory_findings"]
        self.assertEqual((findings.depends_on.key, findings.depends_on_value), ("ros_respiratory_status", "positive"))

    def test_device_lines(self):
        for key in ("central_line", "peripheral_line", "foley", "telemetry"):
            self.assertTrue(self.fields[key].required, key)
        self.assertFalse(self.fields["ventilator"].required)
        self.assertEqual(self.fields["central_line_indication"].depends_on.key, "central_line")
        self.assertEqual(self.fields["central_line_indication"].depends_on_value, "yes")
        self.assertEqual(self.fields["foley_indication"].depends_on.key, "foley")
        self.assertEqual(self.fields["telemetry_indications"].depends_on.key, "telemetry")

    def test_ten_problem_pairs_open_one_at_a_time(self):
        self.assertTrue(self.fields["problem_1"].required and self.fields["plan_1"].required)
        self.assertIsNone(self.fields["problem_1"].depends_on)
        self.assertEqual(self.fields["problem_2"].depends_on.key, "problem_1_more")
        self.assertEqual(self.fields["plan_10"].depends_on.key, "problem_9_more")
        self.assertNotIn("problem_10_more", self.fields)
        self.assertFalse(self.fields["problem_2"].required)

    def test_required_fields(self):
        required = {k for k, f in self.fields.items() if f.required}
        self.assertEqual(required, {"service", "reason_for_admission", "subjective", "central_line", "peripheral_line", "foley", "telemetry", "problem_1", "plan_1"})

    def test_running_it_again_changes_nothing(self):
        before = NoteFieldDefinition.objects.filter(template=self.template).count()
        seed_module.seed(django_apps, None)
        self.assertEqual(NoteFieldDefinition.objects.filter(template=self.template).count(), before)
        self.assertEqual(NoteTemplate.objects.filter(code="progress_note_acute").count(), 1)

    def test_a_clinics_edit_survives(self):
        self.fields["service"].label = "Admitting service"
        self.fields["service"].save()
        seed_module.seed(django_apps, None)
        self.assertEqual(NoteFieldDefinition.objects.get(template=self.template, key="service").label, "Admitting service")


class ChartSourceTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.org = Organization.objects.create(name="Hospital")
        mk = lambda name, role: User.objects.create_user(username=name, email=f"{name}@x.com", password="pw-12345-xyz", role=role, organization=self.org)
        self.doctor, self.patient = mk("doc", "doctor"), mk("pat", "patient")
        self.appt = Appointment.objects.create(
            organization=self.org, patient=self.patient, provider=self.doctor, title="Admission",
            appointment_datetime=timezone.now())
        self.api = client_for(self.doctor)

    def get(self, source):
        res = self.api.get(f"/api/note-chart-data/?patient={self.patient.pk}&source={source}")
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_active_meds_lists_only_active_medication_orders(self):
        amox = Orderable.objects.create(code="amox", name="Amoxicillin 500 mg capsule", category="medication")
        cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory")

        def order(orderable, status, **kw):
            return Order.objects.create(
                organization=self.org, appointment=self.appt, patient=self.patient, ordering_provider=self.doctor,
                orderable=orderable, orderable_name=orderable.name, orderable_category=orderable.category,
                status=status, signed_at=timezone.now(), **kw)

        order(amox, "active", schedule={"frequency": "q8h", "dose": "500 mg", "route": "PO"})
        order(amox, "discontinued", schedule={"frequency": "bid"})
        order(cbc, "active")
        body = self.get("inpatient_meds")
        self.assertEqual(len(body["rows"]), 1)
        row = body["rows"][0]
        self.assertEqual((row["drug"], row["dose"], row["frequency"]), ("Amoxicillin 500 mg capsule", "500 mg PO", "Every 8 hours"))

    def test_active_meds_empty(self):
        self.assertEqual(self.get("inpatient_meds")["rows"], [])

    def test_intake_output_with_nothing_charted(self):
        body = self.get("intake_output")
        self.assertEqual(body["rows"], [])
        self.assertEqual(body["empty"], "No intake and output charted.")

    def test_intake_output_totals(self):
        template = FlowsheetTemplate.objects.create(code="intake_output", name="Intake & Output")
        VitalSignsFlowsheet.objects.create(
            organization=self.org, template=template, appointment=self.appt, patient=self.patient,
            columns=[{"id": "c1", "timestamp": (timezone.now() - timedelta(hours=2)).isoformat()}],
            data={"oral_fluids": {"c1": "240"}, "urine_voided": {"c1": "100"}})
        rows = {r["measure"]: r["value"] for r in self.get("intake_output")["rows"]}
        self.assertEqual(rows["Intake"], "240 mL")
        self.assertEqual(rows["Output"], "100 mL")
        self.assertEqual(rows["Net"], "+140 mL")
