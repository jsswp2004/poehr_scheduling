"""
python manage.py test staffing.test_master_schedule_autocreate
"""
import datetime

from rest_framework.test import APIClient

from .master_schedule_autogen import MASTER_NOTE
from .models import MasterScheduleCell, MasterScheduleRow, Staff, StaffShift
from .test_master_schedule import BASE, MasterScheduleBase, client_for

URL = f"{BASE}/create-schedule/"
T = datetime.time
D = datetime.date


class CreateScheduleTests(MasterScheduleBase):
    def _person(self, first="Cyndi", section="FT 7AM - 7PM"):
        staff = Staff.objects.create(
            organization=self.org, first_name=first, last_name="T", profession="Nurse")
        self._load()  # lays out the default sections
        row = MasterScheduleRow.objects.create(
            organization=self.org, section=self._section(section), staff=staff)
        return staff, row

    def _cell(self, row, day, code):
        return MasterScheduleCell.objects.create(row=row, date=D(2026, 10, day), code=code)

    def _run(self, **body):
        return client_for(self.admin).post(URL, {"month": "2026-10", **body}, format="json")

    def test_a_7a_entry_becomes_a_7_to_7_day_shift_on_that_date(self):
        staff, row = self._person()
        self._cell(row, 5, "7A")  # Monday Oct 5
        r = self._run()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["created"], 1)
        shift = StaffShift.objects.get(staff=staff)
        self.assertEqual(shift.date, D(2026, 10, 5))
        self.assertEqual((shift.shift_type, shift.start_time, shift.end_time), ("day", T(7, 0), T(19, 0)))
        self.assertEqual(shift.organization, self.org)
        self.assertEqual(shift.notes, MASTER_NOTE)

    def test_every_code_and_the_double(self):
        staff, row = self._person()
        for day, code in [(1, "7"), (2, "7P"), (3, "7p"), (4, "3"), (5, "11"), (6, "3 11"), (7, "R"), (8, "x")]:
            self._cell(row, day, code)
        self._run()
        got = {(s.date.day, s.shift_type, s.start_time, s.end_time) for s in StaffShift.objects.filter(staff=staff)}
        self.assertEqual(got, {
            (1, "day", T(7, 0), T(15, 0)),
            (2, "night", T(19, 0), T(7, 0)),
            (3, "night", T(19, 0), T(7, 0)),
            (4, "evening", T(15, 0), T(23, 0)),
            (5, "night", T(23, 0), T(7, 0)),
            (6, "evening", T(15, 0), T(23, 0)),
            (6, "night", T(23, 0), T(7, 0)),
        })

    def test_only_the_chosen_month_and_running_twice_adds_nothing(self):
        staff, row = self._person()
        self._cell(row, 5, "7A")
        MasterScheduleCell.objects.create(row=row, date=D(2026, 11, 2), code="7A")  # shown in Oct's grid
        MasterScheduleCell.objects.create(row=row, date=D(2026, 9, 30), code="7A")
        self.assertEqual(self._run().json()["created"], 1)
        again = self._run().json()
        self.assertEqual(again["created"], 0)
        self.assertEqual(again["already_scheduled"], 1)
        self.assertEqual(StaffShift.objects.filter(staff=staff).count(), 1)

    def test_existing_shift_is_not_duplicated_or_changed(self):
        staff, row = self._person()
        self._cell(row, 5, "7A")
        StaffShift.objects.create(
            organization=self.org, staff=staff, date=D(2026, 10, 5), shift_type="day",
            start_time=T(8, 0), end_time=T(16, 0), source="manual", notes="by hand")
        r = self._run(overwrite=True).json()
        self.assertEqual((r["created"], r["already_scheduled"], r["updated"]), (0, 1, 0))
        shift = StaffShift.objects.get(staff=staff)
        self.assertEqual((shift.start_time, shift.notes), (T(8, 0), "by hand"))

    def test_overwrite_follows_the_master_schedule_but_only_for_its_own_shifts(self):
        staff, row = self._person()
        a = self._cell(row, 5, "7A")
        self._cell(row, 6, "3")
        self._run()
        hand = StaffShift.objects.create(
            organization=self.org, staff=staff, date=D(2026, 10, 9), shift_type="day",
            start_time=T(7, 0), end_time=T(15, 0), source="manual", notes="by hand")
        a.delete()  # Oct 5 cleared on the master
        MasterScheduleCell.objects.filter(row=row, date=D(2026, 10, 6)).update(code="11")
        # without overwrite nothing is removed
        self.assertEqual(self._run().json()["removed"], 0)
        r = self._run(overwrite=True).json()
        self.assertEqual(r["removed"], 2)  # the Oct 5 day shift and the old Oct 6 evening shift
        self.assertEqual(r["created"], 0)  # the Oct 6 night shift came from the first (non-overwrite) rerun
        left = {(s.date.day, s.shift_type) for s in StaffShift.objects.filter(staff=staff)}
        self.assertEqual(left, {(6, "night"), (9, "day")})
        self.assertTrue(StaffShift.objects.filter(pk=hand.pk).exists())

    def test_blank_rows_are_skipped_and_counted(self):
        self._person()
        self._load()
        blank = MasterScheduleRow.objects.create(
            organization=self.org, section=self._section("FT 7AM - 7PM"))
        self._cell(blank, 5, "7A")
        r = self._run().json()
        self.assertEqual((r["created"], r["blank_rows_skipped"]), (0, 1))

    def test_validation_permissions_and_other_orgs(self):
        staff, row = self._person()
        self._cell(row, 5, "7A")
        self.assertEqual(self._run(month="nope").status_code, 400)
        self.assertEqual(client_for(self.nurse).post(URL, {"month": "2026-10"}, format="json").status_code, 403)
        self.assertIn(APIClient().post(URL, {"month": "2026-10"}, format="json").status_code, (401, 403))
        self.assertEqual(StaffShift.objects.count(), 0)
        # another organization's master schedule is never read
        theirs = MasterScheduleRow.objects.create(
            organization=self.other, section=self._other_section(), staff=self.stranger)
        MasterScheduleCell.objects.create(row=theirs, date=D(2026, 10, 5), code="7A")
        self._run()
        self.assertEqual(StaffShift.objects.filter(staff=self.stranger).count(), 0)
        self.assertEqual(StaffShift.objects.filter(staff=staff).count(), 1)

    def _other_section(self):
        from .master_schedule_views import ensure_default_sections
        from .models import MasterScheduleSection
        ensure_default_sections(self.other)
        return MasterScheduleSection.objects.filter(organization=self.other).first()
