"""The physician demo seed is safe to run on every deploy: a later day refreshes the demo visits, it never adds copies."""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import Appointment, FlowsheetTemplate, VitalSignsFlowsheet


class SeedPhysicianDemoIdempotentTests(TestCase):
    def _seed(self):
        call_command("seed_physician_demo", stdout=StringIO(), stderr=StringIO())

    def test_running_on_a_later_day_does_not_duplicate_visits_or_flowsheets(self):
        call_command("seed_demo_data", stdout=StringIO(), stderr=StringIO())
        FlowsheetTemplate.objects.create(code="vital_signs", name="Vital Signs", is_active=True)
        self._seed()
        visits, sheets = Appointment.all_objects.count(), VitalSignsFlowsheet.objects.count()
        self.assertGreater(sheets, 0)
        real_localdate = timezone.localdate
        with mock.patch("django.utils.timezone.localdate", lambda *a, **k: real_localdate() + timedelta(days=1)):
            self._seed()
        self.assertEqual(Appointment.all_objects.count(), visits)
        self.assertEqual(VitalSignsFlowsheet.objects.count(), sheets)


class DedupeDemoVisitsTests(TestCase):
    def _setup(self):
        from django.contrib.auth import get_user_model

        from users.models import Organization

        call_command("seed_demo_data", stdout=StringIO(), stderr=StringIO())
        self.org = Organization.objects.get(name="Riverside Family Clinic (Demo)")
        self.priya = get_user_model().objects.get(username="patient_priya_kapoor")
        self.doc = get_user_model().objects.filter(organization=self.org, role="doctor").first()

    def _dupes(self, n, title, **kw):
        base = timezone.now() - timedelta(days=100)
        return [
            Appointment.all_objects.create(
                organization=self.org, patient=self.priya, provider=self.doc, title=title,
                appointment_datetime=base + timedelta(days=i), status="completed", duration_minutes=30, **kw,
            )
            for i in range(n)
        ]

    def test_dry_run_changes_nothing_and_apply_keeps_newest_and_used_visits(self):
        from .models import ClinicalNote

        self._setup()
        rows = self._dupes(4, "6-month well visit")
        ClinicalNote.objects.create(
            appointment=rows[0], organization=self.org, patient=self.priya, author=self.doc,
            note_type="doctor_assessment", status="draft",
        )
        before = Appointment.all_objects.count()
        call_command("dedupe_demo_visits", stdout=StringIO())
        self.assertEqual(Appointment.all_objects.count(), before)
        call_command("dedupe_demo_visits", "--apply", stdout=StringIO())
        left = Appointment.all_objects.filter(patient=self.priya, title="6-month well visit")
        self.assertEqual(sorted(left.values_list("pk", flat=True)), sorted([rows[0].pk, rows[3].pk]))

    def test_seed_demo_data_adds_one_visit_per_slot_on_rerun(self):
        self._setup()
        count = Appointment.all_objects.count()
        for _ in range(3):
            call_command("seed_demo_data", stdout=StringIO(), stderr=StringIO())
        self.assertEqual(Appointment.all_objects.count(), count)


class DeleteFlowsheetsWithoutVnTests(TestCase):
    def test_deletes_only_no_vn_flowsheets_and_keeps_newest_well_visit_per_patient(self):
        from django.contrib.auth import get_user_model

        from users.models import Organization, Registration

        org = Organization.objects.create(name="Org")
        user = get_user_model().objects.create_user(username="p1", password="x", role="patient", organization=org)
        tmpl = FlowsheetTemplate.objects.create(code="vital_signs", name="Vital Signs", is_active=True)

        def sheet(title, vn=None):
            appt = Appointment.all_objects.create(
                organization=org, patient=user, title=title, appointment_datetime=timezone.now(), status="completed",
            )
            if vn:
                Registration.objects.create(patient=user.patient_profile, organization=org, appointment=appt, visit_number=vn)
            return VitalSignsFlowsheet.objects.create(organization=org, template=tmpl, appointment=appt, patient=user)

        a = sheet("Sick Visit")
        old_well = sheet("2-month well visit")
        new_well = sheet("2-month well visit")
        with_vn = sheet("Follow-up Visit", vn="VN-000001")
        call_command("delete_flowsheets_without_vn", stdout=StringIO())
        self.assertEqual(VitalSignsFlowsheet.objects.count(), 4)
        call_command("delete_flowsheets_without_vn", "--apply", stdout=StringIO())
        left = set(VitalSignsFlowsheet.objects.values_list("pk", flat=True))
        self.assertEqual(left, {new_well.pk, with_vn.pk})
        self.assertNotIn(a.pk, left)
        self.assertNotIn(old_well.pk, left)
