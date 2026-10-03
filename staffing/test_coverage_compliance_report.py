"""
The Coverage Compliance report must include the AUTOMATIC state-rule
requirements (the ones that color the calendar), not only hand-made
ShiftCoverageRequirement rows.

    python manage.py test staffing.test_coverage_compliance_report
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from . import hppd, state_rules
from .models import ShiftCoverageRequirement, Staff, StaffShift, Unit, UnitCensus

D = datetime.date(2026, 10, 5)  # a Monday
URL = "/api/staffing/reports/coverage-compliance/"


def mk_shift(org, unit, i, role, shift_type="day", d=D):
    st = Staff.objects.create(
        organization=org, first_name=f"F{i}", last_name=f"L{i}",
        profession="Nurse", nursing_role=role,
    )
    return StaffShift.objects.create(
        organization=org, staff=st, unit=unit, date=d, shift_type=shift_type,
        start_time=datetime.time(7, 0), end_time=datetime.time(19, 0),
    )


class ComplianceReportStateRuleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", state="MD")
        self.admin = CustomUser.objects.create_user(
            username="a", password="x", role="admin", organization=self.org)
        self.unit = Unit.objects.create(organization=self.org, name="Maple", shift_pattern="12h")
        UnitCensus.objects.create(unit=self.unit, date=D, census=30)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def get(self, **extra):
        r = self.client.get(URL, {"start": D.isoformat(), "end": D.isoformat(), **extra})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_not_empty_without_any_requirement_rows(self):
        self.assertEqual(ShiftCoverageRequirement.objects.count(), 0)
        data = self.get()
        self.assertEqual(data["checked_count"], 2)             # 12h pattern: day + night
        self.assertEqual({r["shift_type"] for r in data["rows"]}, {"day", "night"})
        for r in data["rows"]:
            self.assertEqual(r["source"], "state_rule")
            self.assertEqual(r["status"], "Understaffed")      # nobody scheduled
            self.assertEqual(r["census"], 30)
            self.assertEqual(r["unit_name"], "Maple")
        self.assertEqual(data["understaffed_count"], 2)

    def test_met_when_fully_staffed(self):
        rule = state_rules.resolve_rule("MD").rule
        need = {
            r.shift_type: r for r in hppd.required_staff_by_shift(
                30, "12h", hppd=rule.hppd_min,
                max_residents_per_staff=rule.max_residents_per_staff, min_rn=rule.min_rn_per_shift)
        }["day"]
        # two RNs (one spare) plus enough aides to clear the hours/ratio with a spare
        mk_shift(self.org, self.unit, 0, "rn")
        mk_shift(self.org, self.unit, 99, "rn")
        for i in range(1, need.required_staff + 3):
            mk_shift(self.org, self.unit, i, "cna")
        day = [r for r in self.get()["rows"] if r["shift_type"] == "day"][0]
        self.assertEqual(day["status"], "Met")
        self.assertEqual(day["required"], need.required_staff)
        self.assertGreaterEqual(day["assigned"], need.required_staff)

    def test_no_duplicate_when_explicit_hppd_requirement_exists(self):
        ShiftCoverageRequirement.objects.create(
            organization=self.org, unit=self.unit, shift_type="day", mode="hppd",
            days_of_week=["mon"], min_staff_required=1, start_date=D)
        rows = self.get()["rows"]
        day_rows = [r for r in rows if r["shift_type"] == "day"]
        self.assertEqual(len(day_rows), 1)
        self.assertIsNotNone(day_rows[0]["requirement_id"])    # the explicit one wins
        self.assertEqual(len([r for r in rows if r["shift_type"] == "night"]), 1)

    def test_unit_without_census_becomes_a_warning_not_a_row(self):
        Unit.objects.create(organization=self.org, name="Oak", shift_pattern="8h")
        data = self.get()
        self.assertEqual(data["checked_count"], 2)             # still only Maple's two shifts
        self.assertTrue(any("Oak" in w and "census" in w.lower() for w in data["warnings"]))

    def test_org_without_state_warns_and_has_no_rule_rows(self):
        self.org.state = ""
        self.org.save()
        data = self.get()
        # No state set: the calendar engine warns (and uses its default rule); the
        # report must surface that same warning instead of silently showing nothing.
        self.assertTrue(data["warnings"], data)

    def test_other_orgs_are_not_included(self):
        other = Organization.objects.create(name="Other", state="MD")
        ou = Unit.objects.create(organization=other, name="Elm")
        UnitCensus.objects.create(unit=ou, date=D, census=20)
        names = {r["unit_name"] for r in self.get()["rows"]}
        self.assertEqual(names, {"Maple"})

    def test_at_risk_counts_pending_time_off(self):
        from .models import StaffTimeOffRequest
        rule = state_rules.resolve_rule("MD").rule
        need = {
            r.shift_type: r for r in hppd.required_staff_by_shift(
                30, "12h", hppd=rule.hppd_min,
                max_residents_per_staff=rule.max_residents_per_staff, min_rn=rule.min_rn_per_shift)
        }["day"]
        shifts = [mk_shift(self.org, self.unit, 0, "rn")]
        for i in range(1, need.required_staff):
            shifts.append(mk_shift(self.org, self.unit, i, "cna"))
        # exactly at the minimum -> "At risk" (no spare buffer)
        data = self.get()
        day = [r for r in data["rows"] if r["shift_type"] == "day"][0]
        self.assertIn(day["status"], ("At risk", "Met"))
        self.assertEqual(data["at_risk_count"] + data["understaffed_count"] + sum(
            1 for r in data["rows"] if r["status"] == "Met"), data["checked_count"])
