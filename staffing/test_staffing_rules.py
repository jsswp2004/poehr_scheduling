"""
State rule table, resolution, engine components (licensed / CNA hours) and the
rules API (permissions + audit log).

    python manage.py test staffing.test_staffing_rules
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from . import hppd, state_rules
from .coverage_core import MET, NOT_MET, Need, Person, classify
from .models import (
    OrgStaffingRule, Staff, StaffingRule, StaffingRuleAudit, StaffShift, Unit, UnitCensus,
)

D = datetime.date(2026, 10, 5)
RULES = "/api/staffing/rules/"
STATUS_URL = "/api/staffing/coverage-status/"


def mk_user(org, role, name):
    return CustomUser.objects.create_user(username=name, password="x", role=role, organization=org)


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class SeedAndResolutionTests(TestCase):
    def test_seeded_states(self):
        self.assertEqual(
            set(StaffingRule.objects.filter(organization__isnull=True).values_list("state", flat=True)),
            {"MD", "NY", "CT"},
        )
        ny = StaffingRule.objects.get(state="NY")
        self.assertEqual((float(ny.hppd_min), float(ny.min_licensed_hppd), float(ny.min_cna_hppd)), (3.5, 1.1, 2.2))
        self.assertIsNone(ny.max_residents_per_staff)
        self.assertEqual(ny.min_rn_per_shift, 0)
        self.assertTrue(StaffingRule.objects.get(state="CT").needs_verification)
        self.assertFalse(StaffingRule.objects.get(state="MD").needs_verification)

    def test_org_follows_its_state(self):
        for code, hppd_min in (("MD", 3.0), ("NY", 3.5), ("CT", 3.0)):
            org = Organization.objects.create(name=f"O{code}", state=code)
            r = state_rules.resolve_rule_for_org(org)
            self.assertEqual(r.rule.hppd_min, hppd_min)
            self.assertEqual(r.rule.state, code)

    def test_ct_carries_verify_warning(self):
        org = Organization.objects.create(name="C", state="CT")
        r = state_rules.resolve_rule_for_org(org)
        self.assertIn("awaiting verification", r.warning)

    def test_unknown_state_has_no_rule(self):
        org = Organization.objects.create(name="T", state="TX")
        r = state_rules.resolve_rule_for_org(org)
        self.assertIsNone(r.rule)
        self.assertIn("No verified staffing rule", r.warning)

    def test_no_state_keeps_legacy_maryland(self):
        org = Organization.objects.create(name="N", state="")
        r = state_rules.resolve_rule_for_org(org)
        self.assertEqual(r.rule.state, "MD")
        self.assertIn("state is not set", r.warning)

    def test_added_state_works_without_code_change(self):
        StaffingRule.objects.create(state="TX", name="Texas", hppd_min=3.0, min_rn_per_shift=1)
        org = Organization.objects.create(name="T", state="TX")
        self.assertEqual(state_rules.resolve_rule_for_org(org).rule.name, "Texas")

    def test_org_choice_beats_state_and_inactive_choice_falls_back(self):
        org = Organization.objects.create(name="M", state="MD")
        custom = StaffingRule.objects.create(organization=org, name="Strict", hppd_min=4.0)
        OrgStaffingRule.objects.create(organization=org, rule=custom)
        r = state_rules.resolve_rule_for_org(org)
        self.assertEqual((r.rule.name, r.rule.hppd_min, r.rule.is_custom), ("Strict", 4.0, True))
        custom.status = "inactive"
        custom.save()
        self.assertEqual(state_rules.resolve_rule_for_org(org).rule.state, "MD")

    def test_another_orgs_custom_rule_is_ignored(self):
        a = Organization.objects.create(name="A", state="MD")
        b = Organization.objects.create(name="B", state="MD")
        theirs = StaffingRule.objects.create(organization=b, name="Theirs", hppd_min=9.0)
        OrgStaffingRule.objects.create(organization=a, rule=theirs)
        self.assertEqual(state_rules.resolve_rule_for_org(a).rule.state, "MD")


class EngineComponentTests(TestCase):
    def test_required_component_hours_follow_share(self):
        reqs = hppd.required_staff_by_shift(
            100, "12h", hppd=3.5, max_residents_per_staff=None, min_rn=0,
            min_licensed_hppd=1.1, min_cna_hppd=2.2,
        )
        day = next(r for r in reqs if r.shift_type == "day")
        self.assertAlmostEqual(day.required_licensed_hours, 100 * 1.1 * 0.5)
        self.assertAlmostEqual(day.required_cna_hours, 100 * 2.2 * 0.5)
        self.assertEqual(day.required_rn, 0)

    def test_no_components_means_unchanged_behaviour(self):
        reqs = hppd.required_staff_by_shift(30, "12h")
        self.assertTrue(all(r.required_licensed_hours == 0 and r.required_cna_hours == 0 for r in reqs))

    def test_licensed_shortfall_makes_shift_not_compliant(self):
        req = hppd.ShiftRequirement("Day", "day", 12, 60.0, 5, 0, 5, 0, 20.0, 0.0)
        # 5 CNAs x 12h = 60 hours total, but zero licensed hours.
        c = hppd.evaluate_shift(req, [("cna", 12)] * 5)
        self.assertTrue(c.hours_ok)
        self.assertFalse(c.licensed_ok)
        self.assertFalse(c.compliant)
        self.assertEqual(c.licensed_short, 20.0)
        ok = hppd.evaluate_shift(req, [("lpn", 12), ("lpn", 12)] + [("cna", 12)] * 3)
        self.assertTrue(ok.compliant)

    def test_classify_reports_licensed_shortfall(self):
        need = Need("hppd", 5, 60.0, 0, 0, 12.0, 20.0, 0.0)
        people = [Person(i, f"P{i}", "cna", 12.0) for i in range(5)]
        c = classify(need, people, buffer=0)
        self.assertEqual(c.status, NOT_MET)
        self.assertTrue(any("licensed-nurse" in s for s in c.reasons))
        good = [Person(1, "A", "rn", 12.0), Person(2, "B", "lpn", 12.0)] + [
            Person(10 + i, f"C{i}", "cna", 12.0) for i in range(3)
        ]
        self.assertEqual(classify(need, good, buffer=0).status, MET)

    def test_cna_component_shortfall(self):
        req = hppd.ShiftRequirement("Day", "day", 12, 60.0, 5, 0, 5, 0, 0.0, 30.0)
        c = hppd.evaluate_shift(req, [("rn", 12)] * 5)
        self.assertFalse(c.cna_ok)
        self.assertEqual(c.cna_short, 30.0)


class CalendarUsesOrgRuleTests(TestCase):
    def _status(self, org, admin):
        r = client_for(admin).get(STATUS_URL, {"start": D.isoformat(), "end": D.isoformat()})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def setUp(self):
        self.org = Organization.objects.create(name="NYorg", state="NY")
        self.admin = mk_user(self.org, "admin", "nyadmin")
        self.unit = Unit.objects.create(organization=self.org, name="Maple", shift_pattern="12h")
        UnitCensus.objects.create(unit=self.unit, date=D, census=20)

    def test_new_york_applies_ny_numbers_and_flags_missing_licensed(self):
        # NY, census 20: 70 care hrs/day. All CNAs, no licensed nurses -> not met.
        for i in range(12):
            st = Staff.objects.create(
                organization=self.org, first_name=f"C{i}", last_name="X",
                profession="CNA", nursing_role="cna",
            )
            StaffShift.objects.create(
                organization=self.org, staff=st, unit=self.unit, date=D, shift_type="day",
                start_time=datetime.time(7, 0), end_time=datetime.time(19, 0),
            )
        data = self._status(self.org, self.admin)
        self.assertEqual(data["rule"]["state"], "NY")
        self.assertEqual(data["rule"]["min_licensed_hppd"], 1.1)
        item = next(i for i in data["days"][D.isoformat()]["items"] if i["shift_type"] == "day")
        self.assertEqual(item["status"], NOT_MET)
        self.assertAlmostEqual(item["required_licensed_hours"], 20 * 1.1 * 0.5)
        self.assertTrue(any("licensed-nurse" in r for r in item["reasons"]))

    def test_org_custom_rule_changes_requirement(self):
        low = StaffingRule.objects.create(organization=self.org, name="Light", hppd_min=0.5)
        OrgStaffingRule.objects.create(organization=self.org, rule=low)
        data = self._status(self.org, self.admin)
        self.assertEqual(data["rule"]["name"], "Light")
        self.assertTrue(data["rule"]["is_custom"])
        item = next(i for i in data["days"][D.isoformat()]["items"] if i["shift_type"] == "day")
        self.assertAlmostEqual(item["required_hours"], 20 * 0.5 * 0.5)


class RulesApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="MD org", state="MD")
        self.other = Organization.objects.create(name="Other", state="MD")
        self.sysadmin = mk_user(self.org, "system_admin", "sys")
        self.admin = mk_user(self.org, "admin", "adm")
        self.other_admin = mk_user(self.other, "admin", "adm2")
        self.nurse = mk_user(self.org, "staff", "stf")
        self.ny = StaffingRule.objects.get(state="NY")

    def payload(self, **kw):
        base = {"name": "Custom A", "hppd_min": "3.2", "min_rn_per_shift": 1}
        base.update(kw)
        return base

    def test_list_shows_shared_and_own_custom_not_others(self):
        StaffingRule.objects.create(organization=self.other, name="Hidden", hppd_min=3)
        StaffingRule.objects.create(organization=self.org, name="Mine", hppd_min=3)
        r = client_for(self.admin).get(RULES)
        self.assertEqual(r.status_code, 200)
        names = {x["name"] for x in r.json()["rules"]}
        self.assertIn("Mine", names)
        self.assertIn("Maryland", names)           # the org's own state
        self.assertNotIn("New York", names)        # other states are not shown to org admins
        self.assertNotIn("Connecticut", names)
        self.assertNotIn("Hidden", names)
        md = next(x for x in r.json()["rules"] if x["state"] == "MD")
        self.assertFalse(md["editable"])
        self.assertEqual(md["scope"], "shared")

    def test_system_admin_sees_every_state(self):
        names = {x["name"] for x in client_for(self.sysadmin).get(RULES).json()["rules"]}
        self.assertTrue({"Maryland", "New York", "Connecticut"} <= names)

    def test_staff_see_only_own_state(self):
        names = {x["name"] for x in client_for(self.nurse).get(RULES).json()["rules"]}
        self.assertEqual(names, {"Maryland"})

    def test_org_admin_cannot_edit_shared_rule(self):
        md = StaffingRule.objects.get(state="MD", organization__isnull=True)
        r = client_for(self.admin).patch(f"{RULES}{md.pk}/", {"hppd_min": "9"}, format="json")
        self.assertEqual(r.status_code, 403)
        md.refresh_from_db()
        self.assertEqual(float(md.hppd_min), 3.0)

    def test_org_admin_cannot_reach_another_states_rule(self):
        for method, suffix in (("get", ""), ("patch", ""), ("get", "audit/")):
            r = getattr(client_for(self.admin), method)(f"{RULES}{self.ny.pk}/{suffix}")
            self.assertEqual(r.status_code, 404, (method, suffix))
        r = client_for(self.admin).post(f"{RULES}{self.ny.pk}/duplicate/", {}, format="json")
        self.assertEqual(r.status_code, 404)
        r = client_for(self.admin).put(f"{RULES}selection/", {"rule_id": self.ny.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_system_admin_edits_shared_rule_and_audit_is_written(self):
        r = client_for(self.sysadmin).patch(
            f"{RULES}{self.ny.pk}/", {"hppd_min": "3.6", "source": "NY DOH update"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.ny.refresh_from_db()
        self.assertEqual(float(self.ny.hppd_min), 3.6)
        a = StaffingRuleAudit.objects.get(rule=self.ny, action="updated")
        self.assertEqual(a.changes["hppd_min"], [3.5, 3.6])
        self.assertEqual(a.changed_by, self.sysadmin)
        hist = client_for(self.sysadmin).get(f"{RULES}{self.ny.pk}/audit/")
        self.assertEqual(hist.status_code, 200)
        self.assertEqual(hist.json()[0]["changed_by"], "sys")

    def test_staff_cannot_write(self):
        c = client_for(self.nurse)
        self.assertEqual(c.post(RULES, self.payload(), format="json").status_code, 403)

    def test_org_admin_creates_custom_rule_for_own_org_only(self):
        r = client_for(self.admin).post(RULES, self.payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        rule = StaffingRule.objects.get(pk=r.json()["id"])
        self.assertEqual(rule.organization, self.org)
        self.assertEqual(r.json()["scope"], "custom")
        # shared flag is refused for org admins
        r2 = client_for(self.admin).post(RULES, self.payload(shared=True, state="TX"), format="json")
        self.assertEqual(r2.status_code, 403)
        # the other org's admin cannot touch it
        r3 = client_for(self.other_admin).patch(f"{RULES}{rule.pk}/", {"name": "x"}, format="json")
        self.assertEqual(r3.status_code, 404)

    def test_system_admin_adds_new_state(self):
        r = client_for(self.sysadmin).post(
            RULES, self.payload(shared=True, state="Texas", name="Texas"), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["state"], "TX")
        self.assertIsNone(r.json()["organization_id"])
        tx = Organization.objects.create(name="TX org", state="TX")
        self.assertEqual(state_rules.resolve_rule_for_org(tx).rule.name, "Texas")

    def test_validation(self):
        c = client_for(self.admin)
        self.assertEqual(c.post(RULES, self.payload(hppd_min="abc"), format="json").status_code, 400)
        self.assertEqual(c.post(RULES, self.payload(hppd_min="0"), format="json").status_code, 400)
        self.assertEqual(c.post(RULES, self.payload(name=""), format="json").status_code, 400)
        self.assertEqual(c.post(RULES, self.payload(min_licensed_hppd="-1"), format="json").status_code, 400)

    def test_duplicate_select_and_deselect(self):
        c = client_for(self.admin)
        md = StaffingRule.objects.get(state="MD", organization__isnull=True)
        d = c.post(f"{RULES}{md.pk}/duplicate/", {}, format="json")
        self.assertEqual(d.status_code, 201, d.content)
        copy_id = d.json()["id"]
        self.assertEqual(d.json()["name"], "Maryland (custom)")
        self.assertEqual(d.json()["hppd_min"], 3.0)
        self.assertTrue(StaffingRuleAudit.objects.filter(rule_id=copy_id, action="duplicated").exists())

        s = c.put(f"{RULES}selection/", {"rule_id": copy_id}, format="json")
        self.assertEqual(s.status_code, 200)
        loc = c.get("/api/staffing/location/").json()
        self.assertEqual(loc["rule"]["id"], copy_id)
        self.assertEqual(loc["selected_rule_id"], copy_id)

        back = c.put(f"{RULES}selection/", {"rule_id": None}, format="json")
        self.assertEqual(back.status_code, 200)
        self.assertEqual(c.get("/api/staffing/location/").json()["rule"]["state"], "MD")

    def test_cannot_select_other_orgs_rule(self):
        theirs = StaffingRule.objects.create(organization=self.other, name="T", hppd_min=3)
        r = client_for(self.admin).put(f"{RULES}selection/", {"rule_id": theirs.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_deactivate_keeps_row_and_logs(self):
        rule = StaffingRule.objects.create(organization=self.org, name="Gone", hppd_min=3)
        r = client_for(self.admin).delete(f"{RULES}{rule.pk}/")
        self.assertEqual(r.status_code, 200)
        rule.refresh_from_db()
        self.assertEqual(rule.status, "inactive")
        self.assertTrue(StaffingRuleAudit.objects.filter(rule=rule, action="deactivated").exists())

    def test_clearing_verify_flag_stamps_date_and_logs_verified(self):
        ct = StaffingRule.objects.get(state="CT")
        r = client_for(self.sysadmin).patch(f"{RULES}{ct.pk}/", {"needs_verification": False}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        ct.refresh_from_db()
        self.assertFalse(ct.needs_verification)
        self.assertEqual(ct.last_verified_date, datetime.date.today())
        self.assertTrue(StaffingRuleAudit.objects.filter(rule=ct, action="verified").exists())
        org = Organization.objects.create(name="CT", state="CT")
        self.assertEqual(state_rules.resolve_rule_for_org(org).warning, "")


class OrgSwitchTests(TestCase):
    """A system admin can act on any organization; nobody else can."""

    def setUp(self):
        self.md = Organization.objects.create(name="MD org", state="MD")
        self.ny = Organization.objects.create(name="NY org", state="NY")
        self.sysadmin = mk_user(self.md, "system_admin", "sys")
        self.md_admin = mk_user(self.md, "admin", "mdadm")
        self.ny_admin = mk_user(self.ny, "admin", "nyadm")
        Unit.objects.create(organization=self.md, name="MD unit")
        Unit.objects.create(organization=self.ny, name="NY unit")

    def unit_names(self, user, query=""):
        r = client_for(user).get(f"/api/staffing/units/{query}")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        rows = body["results"] if isinstance(body, dict) and "results" in body else body
        return {u["name"] for u in rows}

    def test_without_a_pick_system_admin_keeps_seeing_everything(self):
        self.assertEqual(self.unit_names(self.sysadmin), {"MD unit", "NY unit"})

    def test_pick_scopes_lists_to_that_org(self):
        self.assertEqual(self.unit_names(self.sysadmin, f"?organization={self.ny.pk}"), {"NY unit"})
        self.assertEqual(self.unit_names(self.sysadmin, f"?organization={self.md.pk}"), {"MD unit"})

    def test_org_admin_cannot_switch(self):
        self.assertEqual(self.unit_names(self.md_admin, f"?organization={self.ny.pk}"), {"MD unit"})

    def test_create_lands_in_the_picked_org(self):
        r = client_for(self.sysadmin).post(
            f"/api/staffing/units/?organization={self.ny.pk}", {"name": "Added"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(Unit.objects.filter(organization=self.ny, name="Added").exists())
        self.assertFalse(Unit.objects.filter(organization=self.md, name="Added").exists())

    def test_create_without_a_pick_uses_own_org(self):
        r = client_for(self.sysadmin).post("/api/staffing/units/", {"name": "Home"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(Unit.objects.filter(organization=self.md, name="Home").exists())

    def test_create_for_unknown_org_is_a_400(self):
        r = client_for(self.sysadmin).post(
            "/api/staffing/units/?organization=999999", {"name": "Nope"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_location_and_rule_follow_the_pick(self):
        c = client_for(self.sysadmin)
        self.assertEqual(c.get("/api/staffing/location/").json()["rule"]["state"], "MD")
        loc = c.get(f"/api/staffing/location/?organization={self.ny.pk}").json()
        self.assertEqual(loc["rule"]["state"], "NY")

    def test_rules_list_and_selection_act_for_the_picked_org(self):
        c = client_for(self.sysadmin)
        mine = StaffingRule.objects.create(organization=self.ny, name="NY custom", hppd_min=3)
        listing = c.get(f"{RULES}?organization={self.ny.pk}").json()
        self.assertIn("NY custom", {r["name"] for r in listing["rules"]})
        # a system admin may point an org at any shared rule
        ct = StaffingRule.objects.get(state="CT")
        r = c.put(f"{RULES}selection/?organization={self.ny.pk}", {"rule_id": ct.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(state_rules.resolve_rule_for_org(self.ny).rule.state, "CT")
        self.assertEqual(state_rules.resolve_rule_for_org(self.md).rule.state, "MD")
        # system admin can edit that org's custom rule
        r = c.patch(f"{RULES}{mine.pk}/?organization={self.ny.pk}", {"name": "Renamed"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_org_admin_cannot_use_system_admin_param_on_rules(self):
        r = client_for(self.md_admin).get(f"{RULES}?organization={self.ny.pk}").json()
        self.assertNotIn("NY custom", {x["name"] for x in r["rules"]})
        self.assertEqual({x["state"] for x in r["rules"] if x["state"]}, {"MD"})
