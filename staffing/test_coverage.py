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
