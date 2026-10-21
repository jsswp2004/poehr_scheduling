"""
Ending, editing and deleting a recurring pattern must keep the calendar honest.

    python manage.py test staffing.test_pattern_end_delete
"""
import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from .models import Staff, StaffRecurringPattern, StaffShift
from .shift_generation import generate_shifts_for_pattern

BASE = "/api/staffing"
EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class PatternLifecycleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(
            username="a", password="x", role="admin", organization=self.org)
        self.staff = Staff.objects.create(
            organization=self.org, first_name="Pat", last_name="Lee", profession="Nurse", nursing_role="rn")
        self.today = timezone.localdate()
        self.pattern = StaffRecurringPattern.objects.create(
            organization=self.org, staff=self.staff, shift_type="day",
            start_time=datetime.time(7), end_time=datetime.time(15),
            days_of_week=EVERY_DAY, start_date=self.today - datetime.timedelta(days=10))
        generate_shifts_for_pattern(self.pattern)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = f"{BASE}/recurring-patterns/{self.pattern.id}/"

    def _past_shift(self):
        return StaffShift.objects.create(
            organization=self.org, staff=self.staff, date=self.today - datetime.timedelta(days=3),
            shift_type="day", source="recurring", recurring_pattern=self.pattern)

    def test_end_today_removes_future_shifts_keeps_today_and_past(self):
        past = self._past_shift()
        r = self.client.patch(self.url, {"end_date": self.today.isoformat()}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        dates = set(self.pattern.generated_shifts.values_list("date", flat=True))
        self.assertIn(self.today, dates)
        self.assertIn(past.date, dates)
        self.assertFalse([d for d in dates if d > self.today])

    def test_removing_a_day_removes_those_future_shifts(self):
        r = self.client.patch(self.url, {"days_of_week": ["mon"]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        for d in self.pattern.generated_shifts.filter(date__gte=self.today).values_list("date", flat=True):
            self.assertEqual(d.weekday(), 0)

    def test_edit_keeps_overrides_and_cancelled(self):
        tomorrow = self.today + datetime.timedelta(days=1)
        shift = self.pattern.generated_shifts.get(date=tomorrow)
        shift.is_cancelled = True
        shift.save()
        override = StaffShift.objects.create(
            organization=self.org, staff=self.staff, date=tomorrow, shift_type="night",
            source="override", recurring_pattern=self.pattern)
        self.client.patch(self.url, {"end_date": self.today.isoformat()}, format="json")
        self.assertTrue(StaffShift.objects.filter(pk=shift.pk).exists())
        self.assertTrue(StaffShift.objects.filter(pk=override.pk).exists())

    def test_delete_clears_future_but_keeps_past_history(self):
        past = self._past_shift()
        r = self.client.delete(self.url)
        self.assertEqual(r.status_code, 204)
        self.assertFalse(StaffShift.objects.filter(date__gte=self.today, staff=self.staff).exists())
        kept = StaffShift.objects.get(pk=past.pk)
        self.assertIsNone(kept.recurring_pattern_id)
