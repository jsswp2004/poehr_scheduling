"""
Per-unit staffing standards: resolution, coverage status, and the units API.

    python manage.py test staffing.test_unit_standards
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from . import state_rules
from .coverage_status import compute_coverage_status
from .models import StaffingRule, Unit, UnitCensus, UnitStaffingRule

D = datetime.date(2026, 10, 5)


def client_for(org, role="admin", name="adm"):
    user = CustomUser.objects.create_user(username=name, password="x", role=role, organization=org)
    c = APIClient()
    c.force_authenticate(user)
    return c


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", state="MD")
        self.a = Unit.objects.create(organization=self.org, name="2 West", shift_pattern="8h")
        self.b = Unit.objects.create(organization=self.org, name="Oak Wing", shift_pattern="8h")
        self.c = Unit.objects.create(organization=self.org, name="Garden Level", shift_pattern="8h")
        for u in (self.a, self.b, self.c):
            UnitCensus.objects.create(unit=u, date=D, census=30)
        self.md = StaffingRule.objects.get(state="MD")
        self.ny = StaffingRule.objects.get(state="NY")
        self.custom = StaffingRule.objects.create(
            organization=self.org, name="Rehab", hppd_min=4.2, min_rn_per_shift=2
        )
        self.api = client_for(self.org)

    def units_url(self, rule):
        return f"/api/staffing/rules/{rule.pk}/units/"

    def items(self):
        return compute_coverage_status(self.org, D, D)["days"][D.isoformat()]["items"]


class ResolutionTests(Base):
    def test_no_assignments_applies_to_every_unit(self):
        ur = state_rules.resolve_rules_for_org(self.org)
        self.assertFalse(ur.per_unit)
        self.assertEqual(ur.for_unit(self.a.id).name, ur.for_unit(self.c.id).name)

    def test_assignments_check_only_assigned_units(self):
        UnitStaffingRule.objects.create(organization=self.org, unit=self.a, rule=self.custom)
        ur = state_rules.resolve_rules_for_org(self.org)
        self.assertTrue(ur.per_unit)
        self.assertEqual(ur.for_unit(self.a.id).name, "Rehab")
        self.assertIsNone(ur.for_unit(self.b.id))

    def test_inactive_rule_drops_its_units(self):
        UnitStaffingRule.objects.create(organization=self.org, unit=self.a, rule=self.custom)
        self.custom.status = "inactive"
        self.custom.save()
        self.assertIsNone(state_rules.resolve_rules_for_org(self.org).for_unit(self.a.id))


class CoverageTests(Base):
    def test_unassigned_unit_is_not_checked(self):
        UnitStaffingRule.objects.create(organization=self.org, unit=self.a, rule=self.custom)
        items = self.items()
        by_unit = {}
        for i in items:
            by_unit.setdefault(i["unit_id"], []).append(i)
        self.assertTrue(all(i["status"] != "no_standard" for i in by_unit[self.a.id]))
        self.assertEqual([i["status"] for i in by_unit[self.b.id]], ["no_standard"])
        self.assertEqual([i["status"] for i in by_unit[self.c.id]], ["no_standard"])

    def test_day_with_only_unassigned_units_has_no_status(self):
        UnitStaffingRule.objects.create(organization=self.org, unit=self.a, rule=self.custom)
        UnitStaffingRule.objects.all().delete()
        # one assignment to a unit with no census, others unassigned
        UnitCensus.objects.filter(unit=self.a).delete()
        UnitStaffingRule.objects.create(organization=self.org, unit=self.a, rule=self.custom)
        day = compute_coverage_status(self.org, D, D)["days"][D.isoformat()]
        self.assertEqual(day["status"], "unknown")

    def test_standards_summary_in_payload(self):
        UnitStaffingRule.objects.create(organization=self.org, unit=self.a, rule=self.custom)
        out = compute_coverage_status(self.org, D, D)
        self.assertEqual(out["standards"]["mode"], "unit")
        self.assertEqual(out["standards"]["units"][str(self.a.id)]["name"], "Rehab")
        self.assertIsNone(out["standards"]["units"][str(self.b.id)])

    def test_default_behaviour_unchanged(self):
        out = compute_coverage_status(self.org, D, D)
        self.assertEqual(out["standards"]["mode"], "all")
        self.assertFalse(any(i["status"] == "no_standard" for i in self.items()))


class UnitsApiTests(Base):
    def put(self, rule, **body):
        return self.api.put(self.units_url(rule), body, format="json")

    def test_selected_units_keep_the_rest_on_the_current_standard(self):
        r = self.put(self.custom, unit_ids=[self.a.id])
        self.assertEqual(r.status_code, 200)
        owners = {u.unit_id: u.rule_id for u in UnitStaffingRule.objects.filter(organization=self.org)}
        self.assertEqual(owners[self.a.id], self.custom.pk)
        self.assertEqual(owners[self.b.id], self.md.pk)
        self.assertEqual(owners[self.c.id], self.md.pk)

    def test_conflict_is_blocked_with_a_message(self):
        self.put(self.custom, unit_ids=[self.a.id])
        r = self.put(self.md, unit_ids=[self.a.id])
        self.assertEqual(r.status_code, 400)
        self.assertIn("2 West", r.data["error"])
        self.assertIn("Rehab", r.data["error"])

    def test_all_units_clears_assignments(self):
        self.put(self.custom, unit_ids=[self.a.id])
        r = self.put(self.custom, all_units=True)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(UnitStaffingRule.objects.count(), 0)
        self.assertEqual(state_rules.resolve_rule_for_org(self.org).rule.name, "Rehab")

    def test_needs_at_least_one_unit_when_starting(self):
        self.assertEqual(self.put(self.custom, unit_ids=[]).status_code, 400)

    def test_unit_from_another_org_is_rejected(self):
        other = Organization.objects.create(name="Other", state="MD")
        foreign = Unit.objects.create(organization=other, name="X")
        self.assertEqual(self.put(self.custom, unit_ids=[foreign.id]).status_code, 400)

    def test_non_admin_cannot_assign(self):
        staff_api = client_for(self.org, role="staff", name="plain")
        r = staff_api.put(self.units_url(self.custom), {"unit_ids": [self.a.id]}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_list_reports_mode_units_and_uncovered(self):
        self.put(self.custom, unit_ids=[self.a.id])
        UnitStaffingRule.objects.filter(unit=self.b).delete()
        data = self.api.get("/api/staffing/rules/").data
        self.assertEqual(data["unit_mode"], "selected")
        self.assertEqual({u["name"] for u in data["units"]}, {"2 West", "Oak Wing", "Garden Level"})
        self.assertEqual(data["uncovered_unit_ids"], [self.b.id])
        rehab = next(r for r in data["rules"] if r["id"] == self.custom.pk)
        self.assertEqual(rehab["unit_ids"], [self.a.id])

    def test_selection_endpoint_resets_to_all_units(self):
        self.put(self.custom, unit_ids=[self.a.id])
        r = self.api.put("/api/staffing/rules/selection/", {"rule_id": None}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(UnitStaffingRule.objects.count(), 0)
