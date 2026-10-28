"""
Custom reports (Reports module).

    python manage.py test staffing.test_custom_reports
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from . import custom_reports as engine
from .models import CustomReport, Staff, StaffShift, Unit

BASE = "/api/staffing/custom-reports"
MON = datetime.date(2026, 10, 26)
SUN = datetime.date(2026, 11, 1)


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def shift(org, staff, unit, day, start=7, end=19, kind="night"):
    return StaffShift.objects.create(
        organization=org, staff=staff, unit=unit, date=day, shift_type=kind,
        start_time=datetime.time(start), end_time=datetime.time(end),
    )


class EngineTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.other = Organization.objects.create(name="Org B")
        self.icu = Unit.objects.create(organization=self.org, name="ICU")
        self.ed = Unit.objects.create(organization=self.org, name="ED")
        self.ann = Staff.objects.create(organization=self.org, first_name="Ann", last_name="Lee", profession="Nurse", nursing_role="rn")
        self.bo = Staff.objects.create(organization=self.org, first_name="Bo", last_name="Kim", profession="Nurse", nursing_role="rn")
        # Ann works four 12-hour shifts in the ICU: 48 hours, 12 over the 36-hour cap.
        for d in range(4):
            shift(self.org, self.ann, self.icu, MON + datetime.timedelta(days=d), start=7, end=19)
        shift(self.org, self.bo, self.ed, MON, start=7, end=19)
        # Another organization's shift must never show up.
        stranger = Staff.objects.create(organization=self.other, first_name="X", last_name="Y", profession="Nurse")
        shift(self.other, stranger, None, MON)

    def run_cfg(self, source, config, **kw):
        return engine.run_report(source, self.org, config, MON, SUN, **kw)

    def test_group_by_unit_sums_hours_and_counts_people(self):
        res = self.run_cfg("shifts", {"group_by": "unit", "columns": ["unit", "shifts", "hours", "people"], "sort": {"field": "hours", "dir": "desc"}})
        rows = {r["unit"]: r for r in res["rows"]}
        self.assertEqual(set(rows), {"ICU", "ED"})
        self.assertEqual(rows["ICU"]["shifts"], 4)
        self.assertEqual(rows["ICU"]["people"], 1)
        self.assertEqual(res["rows"][0]["unit"], "ICU")  # most hours first
        self.assertEqual(res["totals"]["shifts"], 5)
        self.assertEqual(res["totals"]["people"], 2)

    def test_other_organizations_are_never_included(self):
        res = self.run_cfg("shifts", {"columns": ["staff", "shifts"]})
        self.assertEqual(len(res["rows"]), 5)
        self.assertNotIn("Y, X", {r["staff"] for r in res["rows"]})

    def test_overtime_is_hours_above_36_in_a_week(self):
        res = self.run_cfg(
            "hours_overtime",
            {"group_by": "unit", "columns": ["unit", "hours", "overtime_hours", "overtime_pct"],
             "highlight": {"field": "overtime_pct", "op": "gt", "value": 3}},
        )
        icu = next(r for r in res["rows"] if r["unit"] == "ICU")
        self.assertEqual(icu["hours"], 48)
        self.assertEqual(icu["overtime_hours"], 12)
        self.assertEqual(icu["overtime_pct"], 25.0)
        self.assertTrue(icu["_flag"])
        ed = next(r for r in res["rows"] if r["unit"] == "ED")
        self.assertEqual(ed["overtime_hours"], 0)
        self.assertFalse(ed["_flag"])

    def test_filters_and_viewer_narrowing(self):
        cfg = {"group_by": "unit", "columns": ["unit", "shifts"], "filters": [{"field": "role", "op": "is", "value": "RN"}]}
        self.assertEqual(len(self.run_cfg("shifts", cfg)["rows"]), 2)
        res = self.run_cfg("shifts", cfg, narrow=[{"field": "unit", "op": "any_of", "value": ["ED"]}])
        self.assertEqual([r["unit"] for r in res["rows"]], ["ED"])
        none = self.run_cfg("shifts", {**cfg, "filters": [{"field": "role", "op": "is", "value": "LPN"}]})
        self.assertEqual(none["rows"], [])

    def test_tiles(self):
        cfg = {"group_by": "unit", "columns": ["unit", "hours", "overtime_hours", "overtime_pct"],
               "highlight": {"field": "overtime_pct", "op": "gt", "value": 3},
               "tiles": [{"field": "overtime_hours", "agg": "sum", "label": "Overtime"}, {"field": "_flagged"}, {"field": "overtime_pct"}]}
        tiles = self.run_cfg("hours_overtime", cfg)["tiles"]
        self.assertEqual([t["value"] for t in tiles], [12, 1, 20.0])

    def test_unscheduled_staff(self):
        Staff.objects.create(organization=self.org, first_name="Cy", last_name="Zed", profession="CNA")
        res = self.run_cfg("unscheduled", {"columns": ["staff", "profession"]})
        self.assertEqual([r["staff"] for r in res["rows"]], ["Zed, Cy"])

    def test_clean_config_drops_bad_columns_and_rejects_bad_group(self):
        cfg = engine.clean_config("shifts", {"group_by": "unit", "columns": ["staff", "hours", "nope"]})
        self.assertEqual(cfg["columns"], ["unit", "hours"])  # grouped reports show the group field plus measures
        with self.assertRaises(engine.ReportConfigError):
            engine.clean_config("shifts", {"group_by": "hours"})
        with self.assertRaises(engine.ReportConfigError):
            engine.clean_config("shifts", {"filters": [{"field": "unit", "op": "regex", "value": "x"}]})
        with self.assertRaises(engine.ReportConfigError):
            engine.clean_config("nope", {})

    def test_range_is_checked(self):
        with self.assertRaises(engine.ReportConfigError):
            engine.run_report("shifts", self.org, {}, SUN, MON)
        with self.assertRaises(engine.ReportConfigError):
            engine.run_report("shifts", self.org, {}, MON, MON + datetime.timedelta(days=500))


class CustomReportApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.other = Organization.objects.create(name="Org B")
        self.admin = CustomUser.objects.create_user(username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(username="n", password="x", role="nurse", organization=self.org)
        self.nurse2 = CustomUser.objects.create_user(username="n2", password="x", role="nurse", organization=self.org)
        self.patient = CustomUser.objects.create_user(username="p", password="x", role="patient", organization=self.org)
        self.outsider = CustomUser.objects.create_user(username="o", password="x", role="admin", organization=self.other)

    def make(self, user, **kw):
        body = {"name": "Weekly hours", "source": "shifts", "config": {"group_by": "unit", "columns": ["unit", "hours"]},
                "audience": "me"}
        body.update(kw)
        return client_for(user).post(f"{BASE}/", body, format="json")

    def test_create_cleans_config_and_sets_owner(self):
        r = self.make(self.nurse)
        self.assertEqual(r.status_code, 201, r.content)
        rep = CustomReport.objects.get()
        self.assertEqual(rep.created_by, self.nurse)
        self.assertEqual(rep.organization, self.org)
        self.assertEqual(rep.config["columns"], ["unit", "hours"])

    def test_bad_source_or_name_is_rejected(self):
        self.assertEqual(self.make(self.nurse, source="nope").status_code, 400)
        self.assertEqual(self.make(self.nurse, name=" ").status_code, 400)
        self.assertEqual(self.make(self.nurse, audience="roles", audience_roles=[]).status_code, 400)

    def test_patients_cannot_use_reports(self):
        self.assertEqual(client_for(self.patient).get(f"{BASE}/").status_code, 403)
        self.assertEqual(self.make(self.patient).status_code, 403)

    def test_visibility_follows_the_audience(self):
        self.make(self.nurse, name="Private")
        self.make(self.nurse, name="Roles", audience="roles", audience_roles=["admin"])
        self.make(self.nurse, name="Everyone", audience="org")
        names = lambda u: sorted(r["name"] for r in client_for(u).get(f"{BASE}/").json())  # noqa: E731
        self.assertEqual(names(self.nurse), ["Everyone", "Private", "Roles"])
        self.assertEqual(names(self.nurse2), ["Everyone"])
        self.assertEqual(names(self.admin), ["Everyone", "Private", "Roles"])
        self.assertEqual(names(self.outsider), [])

    def test_only_owner_or_admin_can_edit_and_delete(self):
        pk = self.make(self.nurse, audience="org").json()["id"]
        self.assertEqual(client_for(self.nurse2).patch(f"{BASE}/{pk}/", {"name": "Hijacked"}, format="json").status_code, 403)
        self.assertEqual(client_for(self.nurse2).delete(f"{BASE}/{pk}/").status_code, 403)
        self.assertEqual(client_for(self.admin).patch(f"{BASE}/{pk}/", {"name": "Renamed"}, format="json").status_code, 200)
        self.assertEqual(client_for(self.outsider).delete(f"{BASE}/{pk}/").status_code, 404)
        self.assertEqual(client_for(self.nurse).delete(f"{BASE}/{pk}/").status_code, 204)

    def test_run_returns_rows_and_stamps_last_run(self):
        unit = Unit.objects.create(organization=self.org, name="ICU")
        ann = Staff.objects.create(organization=self.org, first_name="Ann", last_name="Lee", profession="Nurse")
        shift(self.org, ann, unit, MON)
        pk = self.make(self.nurse).json()["id"]
        r = client_for(self.nurse).post(f"{BASE}/{pk}/run/", {"start": MON.isoformat(), "end": SUN.isoformat()}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["rows"][0]["unit"], "ICU")
        self.assertIsNotNone(CustomReport.objects.get(pk=pk).last_run_at)
        bad = client_for(self.nurse).post(f"{BASE}/{pk}/run/", {"start": "nope", "end": SUN.isoformat()}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(client_for(self.nurse2).post(f"{BASE}/{pk}/run/", {"start": MON.isoformat(), "end": SUN.isoformat()}, format="json").status_code, 404)

    def test_preview_and_sources(self):
        r = client_for(self.nurse).post(
            f"{BASE}/preview/",
            {"source": "roster", "config": {"columns": ["staff", "status"]}},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["rows"], [])
        src = client_for(self.nurse).get(f"{BASE}/sources/").json()
        self.assertIn("hours_overtime", {s["key"] for s in src})
        self.assertTrue(all("load" not in s for s in src))
