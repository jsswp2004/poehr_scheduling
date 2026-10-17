"""
python manage.py test staffing.test_master_schedule_autocreate
"""
import datetime

from rest_framework.test import APIClient

from .master_schedule_autogen import shifts_for_sections
from .models import MasterScheduleCell, MasterScheduleRow, MasterScheduleSection, Staff
from .test_master_schedule import BASE, MasterScheduleBase, client_for

URL = f"{BASE}/auto-create/"


class ShiftRuleTests(MasterScheduleBase):
    def test_sections_resolve_to_shifts(self):
        secs = [
            (1, "ADON", 0), (2, "FT 7AM - 7PM", 0), (3, "PT DAYS", 0), (4, "AGENCY", 0),
            (5, "FT 7PM - 7AM", 0), (6, "PRN", 0), (7, "AGENCY", 0),
            (8, "7-3 GNA", 0), (9, "Unit 2", 1), (10, "PT GNA", 0), (11, "PRN", 1),
        ]
        got = shifts_for_sections(secs)
        self.assertEqual(got[2], ("7A", 12))
        self.assertEqual(got[4], ("7A", 12))      # day agency follows the day section
        self.assertEqual(got[7], ("7P", 12))      # night agency follows the night section
        self.assertEqual(got[9], ("7", 8))
        for skipped in (1, 3, 6, 10, 11):
            self.assertNotIn(skipped, got)


class AutoCreateTests(MasterScheduleBase):
    def _person(self, section, first, status="FT"):
        staff = Staff.objects.create(
            organization=self.org, first_name=first, last_name="T", profession="Nurse")
        self._load()  # lays out the default sections
        return MasterScheduleRow.objects.create(
            organization=self.org, section=self._section(section), staff=staff, status=status)

    def _run(self, **body):
        return client_for(self.admin).post(URL, {"month": "2026-10", **body}, format="json")

    def test_schedules_nurses_only_in_the_month(self):
        nurse = self._person("FT 7AM - 7PM", "Ann")
        clerk = self._person("UNIT CLERKS", "Cy")
        prn = self._person("PRN", "Pat", status="PRN")
        r = self._run()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["people"], 1)
        mine = MasterScheduleCell.objects.filter(row=nurse)
        self.assertTrue(mine.exists())
        self.assertEqual({c.code for c in mine}, {"7A"})
        self.assertTrue(all(c.date.month == 10 for c in mine))
        # 12-hour nurse: 3 shifts in each full work week
        week = [c for c in mine if datetime.date(2026, 10, 8) <= c.date <= datetime.date(2026, 10, 14)]
        self.assertEqual(len(week), 3)
        self.assertFalse(MasterScheduleCell.objects.filter(row__in=[clerk, prn]).exists())

    def test_eight_hour_staff_get_five_shifts(self):
        gna = self._person("11-7 CGAs", "Gia")
        self._run()
        week = MasterScheduleCell.objects.filter(
            row=gna, date__gte=datetime.date(2026, 10, 8), date__lte=datetime.date(2026, 10, 14))
        self.assertEqual(week.count(), 5)
        self.assertEqual({c.code for c in week}, {"11"})

    def test_respects_requested_off_and_existing_entries(self):
        nurse = self._person("FT 7AM - 7PM", "Ann")
        for day in range(1, 8):
            MasterScheduleCell.objects.create(row=nurse, date=datetime.date(2026, 10, day), code="R")
        self._run()
        self.assertEqual(
            set(MasterScheduleCell.objects.filter(
                row=nurse, date__lte=datetime.date(2026, 10, 7)).values_list("code", flat=True)),
            {"R"},
        )

    def test_default_keeps_entries_and_overwrite_replaces_them(self):
        nurse = self._person("FT 7AM - 7PM", "Ann")
        MasterScheduleCell.objects.create(row=nurse, date=datetime.date(2026, 10, 9), code="7P")
        self._run()
        self.assertEqual(MasterScheduleCell.objects.get(row=nurse, date=datetime.date(2026, 10, 9)).code, "7P")
        r = self._run(overwrite=True)
        self.assertGreater(r.json()["cleared"], 0)
        self.assertFalse(MasterScheduleCell.objects.filter(row=nurse, code="7P").exists())

    def test_running_twice_adds_nothing_new(self):
        self._person("FT 7AM - 7PM", "Ann")
        self._run()
        again = self._run()
        self.assertEqual(again.json()["created"], 0)

    def test_blank_rows_skipped_and_validation_and_permissions(self):
        self._load()
        MasterScheduleRow.objects.create(
            organization=self.org, section=self._section("FT 7AM - 7PM"), status="FT")
        r = self._run()
        self.assertEqual(r.status_code, 400)  # nobody eligible
        self._person("FT 7AM - 7PM", "Ann")
        self.assertEqual(self._run().json()["blank_rows_skipped"], 1)
        self.assertEqual(self._run(month="nope").status_code, 400)
        nurse_client = client_for(self.nurse)
        self.assertEqual(nurse_client.post(URL, {"month": "2026-10"}, format="json").status_code, 403)
        self.assertIn(APIClient().post(URL, {"month": "2026-10"}, format="json").status_code, (401, 403))
