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
