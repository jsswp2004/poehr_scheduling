"""
API tests for the Master Schedule tab.

    python manage.py test staffing.test_master_schedule
"""
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from .models import MASTER_SCHEDULE_CODES, MasterScheduleCell, MasterScheduleSection, Staff

BASE = "/api/staffing/master-schedule"
RANGE = {"start": "2026-10-01", "end": "2026-10-31"}


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class MasterScheduleBase(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="St Test")
        self.other = Organization.objects.create(name="Other")
        self.admin = CustomUser.objects.create_user(
            username="a", password="x", role="admin", organization=self.org)
        self.nurse = CustomUser.objects.create_user(
            username="n", password="x", role="nurse", organization=self.org)
        self.patient = CustomUser.objects.create_user(
            username="p", password="x", role="patient", organization=self.org)
        self.debbie = Staff.objects.create(
            organization=self.org, first_name="Debbie", last_name="Karr", profession="Supervisor")
        self.stranger = Staff.objects.create(
            organization=self.other, first_name="Not", last_name="Mine", profession="RN")

    def _load(self, user=None):
        return (client_for(user or self.admin)).get(f"{BASE}/", RANGE)

    def _section(self, name="SUPERVISORS"):
        return MasterScheduleSection.objects.get(organization=self.org, name=name)


class MasterScheduleTests(MasterScheduleBase):
    def test_first_load_lays_out_template_sections_and_defaults(self):
        r = self._load()
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        names = [s["name"] for s in body["sections"]]
        self.assertIn("FT 7AM - 7PM", names)
        self.assertIn("3-11 GNA", names)
        self.assertEqual(body["settings"]["week_start"], 3)  # Thursday
        self.assertEqual(body["settings"]["hp_values"], ["A", "B", "D", "E", "N", "FT", "3"])
        self.assertEqual(body["settings"]["status_values"], ["FT", "PT", "PRN", "N", "16"])
        self.assertEqual(body["codes"], ["7", "7A", "7P", "7p", "3 11", "3", "11", "R", "x"])
        self.assertEqual([s["name"] for s in body["staff"]], ["Debbie Karr"])
        # second load does not duplicate sections
        count = MasterScheduleSection.objects.filter(organization=self.org).count()
        self._load()
        self.assertEqual(MasterScheduleSection.objects.filter(organization=self.org).count(), count)

    def test_add_row_set_person_hp_status_and_cells(self):
        self._load()
        c = client_for(self.admin)
        sec = self._section()
        r = c.post(f"{BASE}/rows/", {"section": sec.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        row_id = r.json()["id"]
        r = c.patch(f"{BASE}/rows/{row_id}/",
                    {"staff": self.debbie.id, "hp": "A", "status": "PT"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["staff_name"], "Debbie Karr")
        for code in MASTER_SCHEDULE_CODES:
            r = c.put(f"{BASE}/cells/", {"row": row_id, "date": "2026-10-05", "code": code}, format="json")
            self.assertEqual(r.status_code, 200, (code, r.content))
        self.assertEqual(MasterScheduleCell.objects.filter(row_id=row_id).count(), 1)  # one cell per day
        body = self._load().json()
        self.assertEqual(body["cells"][str(row_id)]["2026-10-05"], "x")
        r = c.put(f"{BASE}/cells/", {"row": row_id, "date": "2026-10-05", "code": ""}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(MasterScheduleCell.objects.filter(row_id=row_id).exists())

    def test_bad_code_and_bad_date_rejected(self):
        self._load()
        c = client_for(self.admin)
        row = c.post(f"{BASE}/rows/", {"section": self._section().id}, format="json").json()["id"]
        self.assertEqual(c.put(f"{BASE}/cells/", {"row": row, "date": "2026-10-05", "code": "9"},
                               format="json").status_code, 400)
        self.assertEqual(c.put(f"{BASE}/cells/", {"row": row, "date": "nope", "code": "7"},
                               format="json").status_code, 400)

    def test_new_hp_and_status_values_join_the_dictionary(self):
        self._load()
        c = client_for(self.admin)
        row = c.post(f"{BASE}/rows/", {"section": self._section().id}, format="json").json()["id"]
        c.patch(f"{BASE}/rows/{row}/", {"hp": "Z", "status": "LOA"}, format="json")
        s = self._load().json()["settings"]
        self.assertIn("Z", s["hp_values"])
        self.assertIn("LOA", s["status_values"])

    def test_person_can_only_be_on_one_row_and_must_be_in_this_org(self):
        self._load()
        c = client_for(self.admin)
        sec = self._section()
        a = c.post(f"{BASE}/rows/", {"section": sec.id, "staff": self.debbie.id}, format="json")
        self.assertEqual(a.status_code, 201, a.content)
        b = c.post(f"{BASE}/rows/", {"section": sec.id, "staff": self.debbie.id}, format="json")
        self.assertEqual(b.status_code, 400)
        d = c.post(f"{BASE}/rows/", {"section": sec.id, "staff": self.stranger.id}, format="json")
        self.assertEqual(d.status_code, 400)

    def test_add_section_week_start_and_delete_row(self):
        self._load()
        c = client_for(self.admin)
        r = c.post(f"{BASE}/sections/", {"name": "WEEKEND OPTION"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        row = c.post(f"{BASE}/rows/", {"section": r.json()["id"]}, format="json").json()["id"]
        self.assertEqual(c.delete(f"{BASE}/rows/{row}/").status_code, 204)
        r = c.patch(f"{BASE}/settings/", {"week_start": 0}, format="json")
        self.assertEqual(r.json()["week_start"], 0)
        self.assertEqual(c.patch(f"{BASE}/settings/", {"week_start": 9}, format="json").status_code, 400)

    def test_permissions(self):
        self._load()
        self.assertEqual(self._load(self.nurse).status_code, 200)       # managers can read
        nurse = client_for(self.nurse)
        self.assertEqual(nurse.post(f"{BASE}/sections/", {"name": "X"}, format="json").status_code, 403)
        self.assertEqual(self._load(self.patient).status_code, 403)
        anon = APIClient().get(f"{BASE}/", RANGE)
        self.assertIn(anon.status_code, (401, 403))

    def test_other_org_rows_are_invisible_and_untouchable(self):
        self._load()
        other_admin = CustomUser.objects.create_user(
            username="oa", password="x", role="admin", organization=self.other)
        client_for(other_admin).get(f"{BASE}/", RANGE)
        foreign_sec = MasterScheduleSection.objects.filter(organization=self.other).first()
        row = client_for(other_admin).post(f"{BASE}/rows/", {"section": foreign_sec.id}, format="json").json()["id"]
        mine = client_for(self.admin)
        self.assertEqual(mine.patch(f"{BASE}/rows/{row}/", {"hp": "A"}, format="json").status_code, 404)
        self.assertEqual(mine.post(f"{BASE}/rows/", {"section": foreign_sec.id}, format="json").status_code, 404)
        self.assertEqual(mine.put(f"{BASE}/cells/", {"row": row, "date": "2026-10-05", "code": "7"},
                                  format="json").status_code, 404)

    def test_range_limit(self):
        r = client_for(self.admin).get(f"{BASE}/", {"start": "2026-01-01", "end": "2026-12-31"})
        self.assertEqual(r.status_code, 400)


class MasterScheduleSectionOrderTests(MasterScheduleBase):
    def _names(self):
        return [s["name"] for s in self._load().json()["sections"]]

    def test_new_section_can_be_placed_anywhere(self):
        self._load()
        c = client_for(self.admin)
        base = self._names()
        sup = self._section("SUPERVISORS")

        r = c.post(f"{BASE}/sections/", {"name": "AFTER SUP", "after": sup.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        names = self._names()
        self.assertEqual(names.index("AFTER SUP"), names.index("SUPERVISORS") + 1)
        self.assertEqual(r.json()["index"], names.index("AFTER SUP"))

        c.post(f"{BASE}/sections/", {"name": "AT TOP", "after": "start"}, format="json")
        self.assertEqual(self._names()[0], "AT TOP")

        c.post(f"{BASE}/sections/", {"name": "AT END"}, format="json")
        self.assertEqual(self._names()[-1], "AT END")

        # nothing else moved relative to each other
        kept = [n for n in self._names() if n not in ("AFTER SUP", "AT TOP", "AT END")]
        self.assertEqual(kept, base)

    def test_bad_after_value(self):
        self._load()
        c = client_for(self.admin)
        self.assertEqual(c.post(f"{BASE}/sections/", {"name": "X", "after": "nope"}, format="json").status_code, 400)
        self.assertEqual(c.post(f"{BASE}/sections/", {"name": "X", "after": 999999}, format="json").status_code, 404)

    def test_cannot_place_after_another_orgs_section(self):
        self._load()
        other_admin = CustomUser.objects.create_user(
            username="oa2", password="x", role="admin", organization=self.other)
        client_for(other_admin).get(f"{BASE}/", RANGE)
        foreign = MasterScheduleSection.objects.filter(organization=self.other).first()
        r = client_for(self.admin).post(f"{BASE}/sections/", {"name": "X", "after": foreign.id}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_delete_section_removes_rows_and_cells_but_not_the_roster(self):
        self._load()
        c = client_for(self.admin)
        sec = self._section("SUPERVISORS")
        row = c.post(f"{BASE}/rows/", {"section": sec.id, "staff": self.debbie.id}, format="json").json()["id"]
        c.put(f"{BASE}/cells/", {"row": row, "date": "2026-10-05", "code": "7"}, format="json")
        self.assertEqual(c.delete(f"{BASE}/sections/{sec.id}/").status_code, 204)
        self.assertNotIn("SUPERVISORS", self._names())
        self.assertFalse(MasterScheduleCell.objects.filter(row_id=row).exists())
        self.assertTrue(Staff.objects.filter(pk=self.debbie.pk).exists())
        # she can be put back on a new row
        other = self._section("UNIT MANAGERS")
        self.assertEqual(c.post(f"{BASE}/rows/", {"section": other.id, "staff": self.debbie.id}, format="json").status_code, 201)

    def test_delete_section_permissions_and_scope(self):
        self._load()
        sec = self._section("SUPERVISORS")
        self.assertEqual(client_for(self.nurse).delete(f"{BASE}/sections/{sec.id}/").status_code, 403)
        other_admin = CustomUser.objects.create_user(
            username="oa3", password="x", role="admin", organization=self.other)
        self.assertEqual(client_for(other_admin).delete(f"{BASE}/sections/{sec.id}/").status_code, 404)
        self.assertTrue(MasterScheduleSection.objects.filter(pk=sec.pk).exists())
