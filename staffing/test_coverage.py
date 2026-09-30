"""
Tests for staffing/coverage.py (effective requirement + assigned count).

    python manage.py test staffing.test_coverage
"""
import datetime

from django.test import TestCase

from users.models import Organization

from .coverage import (
    MAX_CARRY_FORWARD_DAYS,
    assigned_staff_count,
    effective_requirement,
    evaluate_requirement,
    shift_hours,
)
from .models import ShiftCoverageRequirement, Staff, StaffShift, Unit, UnitCensus

D = datetime.date(2026, 10, 5)  # a Monday


class EffectiveRequirementTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.unit = Unit.objects.create(organization=self.org, name="2 West", shift_pattern="8h")

    def req(self, **kw):
        defaults = dict(
            organization=self.org, shift_type="day", days_of_week=["mon"],
            min_staff_required=2, start_date=D,
        )
        defaults.update(kw)
        return ShiftCoverageRequirement.objects.create(**defaults)

    def test_fixed_mode_unchanged(self):
        e = effective_requirement(self.req(), D)
        self.assertEqual((e.mode, e.required_staff), ("fixed", 2))
        self.assertEqual(e.note, "")

    def test_hppd_uses_census(self):
        UnitCensus.objects.create(unit=self.unit, date=D, census=40)
        e = effective_requirement(self.req(mode="hppd", unit=self.unit), D)
        self.assertEqual(e.mode, "hppd")
        self.assertEqual(e.required_staff, 6)      # 48 h / 8
        self.assertEqual(e.required_hours, 48)
        self.assertEqual(e.required_rn, 1)
        self.assertEqual(e.census_source, "entered")

    def test_hppd_12h_pattern_and_missing_evening(self):
        u12 = Unit.objects.create(organization=self.org, name="ICU", shift_pattern="12h")
        UnitCensus.objects.create(unit=u12, date=D, census=40)
        self.assertEqual(effective_requirement(self.req(mode="hppd", unit=u12), D).required_staff, 5)
        ev = effective_requirement(self.req(mode="hppd", unit=u12, shift_type="evening"), D)
        self.assertEqual(ev.required_staff, 0)
        self.assertIn("not a shift", ev.note)

    def test_census_carried_forward_then_expires(self):
        UnitCensus.objects.create(unit=self.unit, date=D - datetime.timedelta(days=3), census=40)
        r = self.req(mode="hppd", unit=self.unit)
        e = effective_requirement(r, D)
        self.assertEqual((e.mode, e.census_source, e.required_staff), ("hppd", "carried_forward", 6))
        stale = D + datetime.timedelta(days=MAX_CARRY_FORWARD_DAYS + 1)
        e2 = effective_requirement(r, stale)
        self.assertEqual((e2.mode, e2.required_staff), ("fixed", 2))
        self.assertIn("No census", e2.note)

    def test_hppd_without_unit_or_census_falls_back(self):
        e = effective_requirement(self.req(mode="hppd"), D)
        self.assertEqual((e.mode, e.required_staff), ("fixed", 2))
        self.assertIn("needs a unit", e.note)
        e = effective_requirement(self.req(mode="hppd", unit=self.unit), D)
        self.assertEqual((e.mode, e.required_staff), ("fixed", 2))

    def test_custom_shift_falls_back(self):
        UnitCensus.objects.create(unit=self.unit, date=D, census=40)
        e = effective_requirement(self.req(mode="hppd", unit=self.unit, shift_type="custom"), D)
        self.assertEqual(e.mode, "fixed")


class AssignedCountTests(TestCase):
    def test_counts_distinct_staff_and_filters_by_unit(self):
        org = Organization.objects.create(name="Test Org")
        u1 = Unit.objects.create(organization=org, name="A")
        u2 = Unit.objects.create(organization=org, name="B")
        s1 = Staff.objects.create(organization=org, first_name="A", last_name="One", profession="RN")
        s2 = Staff.objects.create(organization=org, first_name="B", last_name="Two", profession="CNA")
        StaffShift.objects.create(organization=org, staff=s1, date=D, shift_type="day", unit=u1)
        StaffShift.objects.create(organization=org, staff=s2, date=D, shift_type="day", unit=u2)
        StaffShift.objects.create(organization=org, staff=s2, date=D, shift_type="evening", unit=u2)
        cancelled = Staff.objects.create(organization=org, first_name="C", last_name="Three", profession="LPN")
        StaffShift.objects.create(organization=org, staff=cancelled, date=D, shift_type="day", unit=u1, is_cancelled=True)

        org_wide = ShiftCoverageRequirement.objects.create(
            organization=org, shift_type="day", days_of_week=["mon"], start_date=D)
        unit_a = ShiftCoverageRequirement.objects.create(
            organization=org, unit=u1, shift_type="day", days_of_week=["mon"], start_date=D)
        self.assertEqual(assigned_staff_count(org_wide, D), 2)   # unit-less: whole org, cancelled excluded
        self.assertEqual(assigned_staff_count(unit_a, D), 1)     # only unit A


T = datetime.time


class EvaluateRequirementTests(TestCase):
    """Census 40 on an 8h unit -> Day needs 48 care hours, ratio 3, 1 RN."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.unit = Unit.objects.create(organization=self.org, name="2 West", shift_pattern="8h")
        UnitCensus.objects.create(unit=self.unit, date=D, census=40)
        self.req = ShiftCoverageRequirement.objects.create(
            organization=self.org, unit=self.unit, shift_type="day", mode="hppd",
            days_of_week=["mon"], start_date=D, min_staff_required=1,
        )
        self.n = 0

    def add(self, role, start=T(7, 0), end=T(15, 0), **kw):
        self.n += 1
        st = Staff.objects.create(
            organization=self.org, first_name="S", last_name=str(self.n),
            profession=role.upper(), nursing_role=role,
        )
        StaffShift.objects.create(
            organization=self.org, staff=st, unit=self.unit, date=D,
            shift_type="day", start_time=start, end_time=end, **kw,
        )
        return st

    def test_met(self):
        for role in ("rn", "lpn", "cna", "cna", "cna", "cna"):
            self.add(role)
        r = evaluate_requirement(self.req, D)
        self.assertTrue(r.met)
        self.assertEqual((r.assigned, r.hours_scheduled, r.rn_scheduled), (6, 48, 1))
        self.assertEqual(r.shortfalls, ())

    def test_short_hours(self):
        for role in ("rn", "lpn", "cna", "cna", "cna"):     # 40 h
            self.add(role)
        r = evaluate_requirement(self.req, D)
        self.assertFalse(r.met)
        self.assertEqual(r.shortfalls, ("Short 8 care hours",))

    def test_no_rn(self):
        for role in ("lpn", "lpn", "cna", "cna", "cna", "cna"):
            self.add(role)
        r = evaluate_requirement(self.req, D)
        self.assertFalse(r.met)
        self.assertEqual(r.shortfalls, ("Need 1 RN, have 0",))

    def test_other_role_does_not_count(self):
        for role in ("rn", "lpn", "cna", "cna", "cna", "other"):
            self.add(role)
        r = evaluate_requirement(self.req, D)
        self.assertEqual(r.assigned, 5)
        self.assertFalse(r.met)

    def test_12h_person_supplies_more_hours(self):
        # 4 x 12h = 48 h with only 4 heads: hours met, ratio (3) met, RN present
        self.add("rn", T(7, 0), T(19, 0))
        for _ in range(3):
            self.add("cna", T(7, 0), T(19, 0))
        r = evaluate_requirement(self.req, D)
        self.assertTrue(r.met)
        self.assertEqual(r.hours_scheduled, 48)

    def test_missing_times_use_pattern_length(self):
        for role in ("rn", "lpn", "cna", "cna", "cna", "cna"):
            self.add(role, start=None, end=None)
        r = evaluate_requirement(self.req, D)
        self.assertEqual(r.hours_scheduled, 48)
        self.assertTrue(r.met)

    def test_cancelled_shift_ignored(self):
        for role in ("rn", "lpn", "cna", "cna", "cna"):
            self.add(role)
        self.add("cna", is_cancelled=True)
        self.assertFalse(evaluate_requirement(self.req, D).met)

    def test_fixed_mode_still_counts_heads(self):
        fixed = ShiftCoverageRequirement.objects.create(
            organization=self.org, shift_type="day", days_of_week=["mon"],
            start_date=D, min_staff_required=2,
        )
        self.add("other")
        self.assertFalse(evaluate_requirement(fixed, D).met)
        self.add("other")
        r = evaluate_requirement(fixed, D)
        self.assertTrue(r.met)
        self.assertIsNone(r.hours_scheduled)

    def test_shift_hours_overnight(self):
        class S:
            date = D
            start_time, end_time = T(19, 0), T(7, 0)
        self.assertEqual(shift_hours(S), 12)


class ComplianceReportEndpointTests(TestCase):
    """The compliance report reports HPPD requirements and keeps the old fields."""

    def test_report_rows(self):
        from rest_framework.test import APIClient
        from users.models import CustomUser

        org = Organization.objects.create(name="Test Org")
        admin = CustomUser.objects.create_user(
            username="rep_admin", password="x", role="admin", organization=org
        )
        unit = Unit.objects.create(organization=org, name="2 West", shift_pattern="8h")
        UnitCensus.objects.create(unit=unit, date=D, census=40)
        ShiftCoverageRequirement.objects.create(
            organization=org, unit=unit, shift_type="day", mode="hppd",
            days_of_week=["mon"], start_date=D)
        ShiftCoverageRequirement.objects.create(
            organization=org, shift_type="night", days_of_week=["mon"],
            start_date=D, min_staff_required=1)

        client = APIClient()
        client.force_authenticate(admin)
        resp = client.get(
            "/api/staffing/reports/coverage-compliance/", {"start": D.isoformat(), "end": D.isoformat()}
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        rows = {r["shift_type"]: r for r in resp.json()["rows"]}
        day, night = rows["day"], rows["night"]
        self.assertEqual((day["mode"], day["required"], day["required_hours"], day["unit_name"]),
                         ("hppd", 6, 48, "2 West"))
        self.assertEqual(day["status"], "Understaffed")
        self.assertIn("Need 1 RN, have 0", day["shortfalls"])
        # fixed row keeps the original shape and meaning
        self.assertEqual((night["mode"], night["required"], night["assigned"]), ("fixed", 1, 0))
        self.assertEqual(night["status"], "Understaffed")
        self.assertEqual(resp.json()["understaffed_count"], 2)
