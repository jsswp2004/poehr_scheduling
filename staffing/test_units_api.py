"""
API tests for Units, census entry and the new nursing_role / unit / mode fields.

    python manage.py test staffing.test_units_api
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from .models import ShiftCoverageRequirement, Staff, StaffShift, Unit, UnitCensus

D = datetime.date(2026, 10, 5)
BASE = "/api/staffing"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.other = Organization.objects.create(name="Org B")
        self.admin = CustomUser.objects.create_user(
            username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(
            username="n", password="x", role="nurse", organization=self.org)
        self.patient = CustomUser.objects.create_user(
            username="p", password="x", role="patient", organization=self.org)
        self.unit = Unit.objects.create(organization=self.org, name="2 West")
        self.foreign = Unit.objects.create(organization=self.other, name="3 East")


class UnitApiTests(Base):
    def test_admin_creates_unit_in_own_org(self):
        r = client_for(self.admin).post(
            f"{BASE}/units/", {"name": "ICU", "shift_pattern": "12h"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Unit.objects.get(pk=r.json()["id"]).organization, self.org)
        self.assertEqual(r.json()["shift_pattern_display"], Unit(shift_pattern="12h").get_shift_pattern_display())

    def test_duplicate_name_rejected_case_insensitive(self):
        r = client_for(self.admin).post(f"{BASE}/units/", {"name": "2 west"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("name", r.json())

    def test_same_name_allowed_in_other_org(self):
        r = client_for(self.admin).post(f"{BASE}/units/", {"name": "3 East"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_nurse_can_read_not_write(self):
        c = client_for(self.nurse)
        self.assertEqual(c.get(f"{BASE}/units/").status_code, 200)
        self.assertEqual(c.post(f"{BASE}/units/", {"name": "X"}, format="json").status_code, 403)
        self.assertEqual(
            c.patch(f"{BASE}/units/{self.unit.id}/", {"shift_pattern": "12h"}, format="json").status_code, 403)

    def test_patient_blocked(self):
        self.assertEqual(client_for(self.patient).get(f"{BASE}/units/").status_code, 403)

    def test_list_scoped_to_org_and_shows_latest_census(self):
        UnitCensus.objects.create(unit=self.unit, date=D, census=30)
        UnitCensus.objects.create(unit=self.unit, date=D + datetime.timedelta(days=1), census=32)
        rows = client_for(self.admin).get(f"{BASE}/units/").json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        self.assertEqual([r["name"] for r in rows], ["2 West"])
        self.assertEqual(rows[0]["latest_census"]["census"], 32)

    def test_toggle_pattern(self):
        r = client_for(self.admin).patch(
            f"{BASE}/units/{self.unit.id}/", {"shift_pattern": "12h"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.shift_pattern, "12h")

    def test_cannot_delete_unit_with_history(self):
        UnitCensus.objects.create(unit=self.unit, date=D, census=30)
        r = client_for(self.admin).delete(f"{BASE}/units/{self.unit.id}/")
        self.assertEqual(r.status_code, 400)
        self.assertTrue(Unit.objects.filter(pk=self.unit.pk).exists())

    def test_can_delete_empty_unit(self):
        empty = Unit.objects.create(organization=self.org, name="Empty")
        self.assertEqual(client_for(self.admin).delete(f"{BASE}/units/{empty.id}/").status_code, 204)


class CensusApiTests(Base):
    def post(self, user, **data):
        payload = {"unit": self.unit.id, "date": D.isoformat(), "census": 40}
        payload.update(data)
        return client_for(user).post(f"{BASE}/census/", payload, format="json")

    def test_nurse_can_enter_census_and_is_recorded(self):
        r = self.post(self.nurse)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(UnitCensus.objects.get().entered_by, self.nurse)

    def test_second_entry_same_day_updates(self):
        self.post(self.nurse)
        r = self.post(self.admin, census=42)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(UnitCensus.objects.count(), 1)
        entry = UnitCensus.objects.get()
        self.assertEqual((entry.census, entry.entered_by), (42, self.admin))

    def test_cannot_enter_for_other_org_unit(self):
        r = self.post(self.admin, unit=self.foreign.id)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(UnitCensus.objects.count(), 0)

    def test_negative_census_rejected(self):
        self.assertEqual(self.post(self.admin, census=-1).status_code, 400)

    def test_patient_blocked(self):
        self.assertEqual(self.post(self.patient).status_code, 403)

    def test_filters_and_org_scope(self):
        UnitCensus.objects.create(unit=self.unit, date=D, census=30)
        UnitCensus.objects.create(unit=self.unit, date=D + datetime.timedelta(days=5), census=31)
        UnitCensus.objects.create(unit=self.foreign, date=D, census=99)
        r = client_for(self.nurse).get(
            f"{BASE}/census/", {"unit": self.unit.id, "start": D.isoformat(), "end": D.isoformat()}).json()
        rows = r["results"] if isinstance(r, dict) else r
        self.assertEqual([x["census"] for x in rows], [30])
        allrows = client_for(self.nurse).get(f"{BASE}/census/").json()
        allrows = allrows["results"] if isinstance(allrows, dict) else allrows
        self.assertNotIn(99, [x["census"] for x in allrows])


class ShiftUnitFilterTests(Base):
    def test_calendar_unit_filter(self):
        staff = Staff.objects.create(organization=self.org, first_name="A", last_name="B", profession="Nurse")
        other_unit = Unit.objects.create(organization=self.org, name="ICU")
        for unit in (self.unit, other_unit, None):
            StaffShift.objects.create(organization=self.org, staff=staff, unit=unit,
                                      date=D, shift_type="day")
        c = client_for(self.nurse)

        def units_in(params):
            r = c.get(f"{BASE}/shifts/", params).json()
            rows = r["results"] if isinstance(r, dict) else r
            return sorted((x["unit_name"] or "-") for x in rows)

        self.assertEqual(units_in({}), ["-", "2 West", "ICU"])
        self.assertEqual(units_in({"unit": "all"}), ["-", "2 West", "ICU"])
        self.assertEqual(units_in({"unit": self.unit.id}), ["2 West"])


class NewFieldsTests(Base):
    def test_nursing_role_on_staff(self):
        c = client_for(self.admin)
        r = c.post(f"{BASE}/staff/", {"first_name": "A", "last_name": "B",
                                      "profession": "Nurse", "nursing_role": "rn"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["nursing_role"], "rn")
        self.assertEqual(r.json()["nursing_role_display"], "RN")
        r2 = c.patch(f"{BASE}/staff/{r.json()['id']}/", {"nursing_role": "lpn"}, format="json")
        self.assertEqual(r2.json()["nursing_role"], "lpn")

    def test_nursing_role_invalid(self):
        r = client_for(self.admin).post(f"{BASE}/staff/", {"first_name": "A", "last_name": "B",
                                                           "nursing_role": "wizard"}, format="json")
        self.assertEqual(r.status_code, 400)

    def requirement(self, **kw):
        payload = dict(shift_type="day", days_of_week=["mon"], min_staff_required=1,
                       start_date=D.isoformat())
        payload.update(kw)
        return client_for(self.admin).post(f"{BASE}/coverage-requirements/", payload, format="json")

    def test_fixed_requirement_still_works_without_unit(self):
        r = self.requirement()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["mode"], r.json()["unit"]), ("fixed", None))

    def test_hppd_requires_unit(self):
        r = self.requirement(mode="hppd")
        self.assertEqual(r.status_code, 400)
        self.assertIn("unit", r.json())

    def test_hppd_requirement_with_unit(self):
        r = self.requirement(mode="hppd", unit=self.unit.id)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["unit_name"], "2 West")

    def test_requirement_rejects_other_org_unit(self):
        r = self.requirement(mode="hppd", unit=self.foreign.id)
        self.assertEqual(r.status_code, 400)
        self.assertFalse(ShiftCoverageRequirement.objects.exists())

    def test_switching_existing_requirement_to_hppd_needs_unit(self):
        req = ShiftCoverageRequirement.objects.create(
            organization=self.org, shift_type="day", days_of_week=["mon"], start_date=D)
        c = client_for(self.admin)
        self.assertEqual(
            c.patch(f"{BASE}/coverage-requirements/{req.id}/", {"mode": "hppd"}, format="json").status_code, 400)
        self.assertEqual(
            c.patch(f"{BASE}/coverage-requirements/{req.id}/",
                    {"mode": "hppd", "unit": self.unit.id}, format="json").status_code, 200)
