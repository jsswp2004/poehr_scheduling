"""
Unit custom-hours shifts: pattern maths, validation, coverage.

    python manage.py test staffing.test_custom_shifts
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from . import hppd
from .coverage_status import compute_coverage_status
from .models import Staff, StaffShift, Unit, UnitCensus

D = datetime.date(2026, 10, 5)
REG = {"key": "u_regular_day", "name": "Regular day", "start": "08:00", "end": "17:00", "break_minutes": 60}
EVE = {"key": "u_evening", "name": "Evening", "start": "17:00", "end": "01:00", "break_minutes": 0}


class PatternTests(TestCase):
    def test_paid_hours_and_shares(self):
        p = hppd.custom_pattern([REG, EVE])
        self.assertEqual(p[0].hours, 8.0)
        self.assertEqual(p[0].span, 9.0)
        self.assertEqual(p[1].hours, 8.0)
        self.assertAlmostEqual(sum(s.share for s in p), 1.0)

    def test_requirement_uses_custom_shifts(self):
        p = hppd.custom_pattern([REG])
        r = hppd.required_staff_by_shift(40, p, hppd=3.5)
        self.assertEqual(len(r), 1)
        self.assertEqual(r[0].shift_type, "u_regular_day")
        self.assertEqual(r[0].required_hours, 140.0)
        self.assertEqual(r[0].required_staff, 18)


class ApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", state="MD")
        u = CustomUser.objects.create_user(username="adm", password="x", role="admin", organization=self.org)
        self.api = APIClient()
        self.api.force_authenticate(u)

    def make(self, shifts, pattern="custom"):
        return self.api.post(
            "/api/staffing/units/",
            {"name": "Clinic", "shift_pattern": pattern, "custom_shifts": shifts},
            format="json",
        )

    def test_create_generates_keys(self):
        r = self.make([{"name": "Regular day", "start": "08:00", "end": "17:00", "break_minutes": 60}])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["custom_shifts"][0]["key"], "u_regular_day")

    def test_duplicate_names_blocked(self):
        r = self.make([
            {"name": "Day", "start": "08:00", "end": "17:00"},
            {"name": "day", "start": "17:00", "end": "23:00"},
        ])
        self.assertEqual(r.status_code, 400)

    def test_custom_needs_a_shift(self):
        self.assertEqual(self.make([]).status_code, 400)

    def test_break_must_be_shorter(self):
        r = self.make([{"name": "Day", "start": "08:00", "end": "09:00", "break_minutes": 60}])
        self.assertEqual(r.status_code, 400)

    def test_shift_type_validated_against_unit(self):
        r = self.make([{"name": "Regular day", "start": "08:00", "end": "17:00"}])
        unit_id = r.json()["id"]
        staff = Staff.objects.create(organization=self.org, first_name="Pat", last_name="Lee", profession="Registered Nurse")
        ok = self.api.post("/api/staffing/shifts/", {
            "staff": staff.id, "unit": unit_id, "date": D.isoformat(), "shift_type": "u_regular_day",
            "start_time": "08:00", "end_time": "17:00",
        }, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)
        bad = self.api.post("/api/staffing/shifts/", {
            "staff": staff.id, "unit": unit_id, "date": D.isoformat(), "shift_type": "u_nope",
        }, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_coverage_runs_for_custom_unit(self):
        r = self.make([{"name": "Regular day", "start": "08:00", "end": "17:00", "break_minutes": 60}])
        unit = Unit.objects.get(pk=r.json()["id"])
        UnitCensus.objects.create(unit=unit, date=D, census=20)
        items = compute_coverage_status(self.org, D, D)["days"][D.isoformat()]["items"]
        mine = [i for i in items if i["unit_id"] == unit.id]
        self.assertTrue(mine)
        self.assertEqual({i["shift_type"] for i in mine}, {"u_regular_day"})


class CountAllRolesTests(TestCase):
    def test_other_role_counts_only_when_enabled(self):
        r = hppd.required_staff_by_shift(20, "8h", hppd=0.0, max_residents_per_staff=30, min_rn=0)[0]
        self.assertFalse(hppd.evaluate_shift(r, [("other", 8.0)]).ratio_ok)
        r2 = hppd.required_staff_by_shift(
            20, "8h", hppd=0.0, max_residents_per_staff=30, min_rn=0, count_all_roles=True
        )[0]
        self.assertTrue(hppd.evaluate_shift(r2, [("other", 8.0)]).compliant)
