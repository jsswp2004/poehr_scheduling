"""
The same person entered twice for the same shift counts once in the labor and shift-type reports.

    python manage.py test staffing.test_duplicate_shifts
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from .models import Staff, StaffShift

BASE = "/api/staffing/reports"
DAY = datetime.date(2026, 10, 20)


class DuplicateShiftReportTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.staff = Staff.objects.create(organization=self.org, first_name="Chris", last_name="Jansen", profession="Activities")
        for _ in range(2):  # the same slot entered twice
            StaffShift.objects.create(
                organization=self.org, staff=self.staff, date=DAY, shift_type="day",
                start_time=datetime.time(8), end_time=datetime.time(16))
        StaffShift.objects.create(  # a different day is a real second shift
            organization=self.org, staff=self.staff, date=DAY + datetime.timedelta(days=1), shift_type="day",
            start_time=datetime.time(8), end_time=datetime.time(16))
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.q = "?start=2026-10-19&end=2026-10-25"

    def test_labor_hours_counts_a_repeated_entry_once(self):
        data = self.client.get(f"{BASE}/labor-hours/{self.q}").json()
        row = data["rows"][0]
        self.assertEqual(row["shift_count"], 2)
        self.assertEqual(row["total_hours"], 16.0)
        self.assertEqual(data["duplicates_ignored"], 1)

    def test_shift_distribution_counts_a_repeated_entry_once(self):
        data = self.client.get(f"{BASE}/shift-distribution/{self.q}").json()
        self.assertEqual(data["rows"][0]["total"], 2)
        self.assertEqual(data["totals"]["day"], 2)
