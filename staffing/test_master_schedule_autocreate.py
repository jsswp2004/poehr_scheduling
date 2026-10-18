"""
python manage.py test staffing.test_master_schedule_autocreate
"""
import datetime

from rest_framework.test import APIClient

from .master_schedule_autogen import MASTER_NOTE
from .models import MasterScheduleCell, MasterScheduleRow, MasterScheduleSection, Staff, StaffShift, Unit
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


class CreateScheduleUnitTests(MasterScheduleBase):
    """Shifts land on the care unit named by the person's Master Schedule sub-heading."""

    def _row_under(self, section_name, first):
        self._load()
        staff = Staff.objects.create(
            organization=self.org, first_name=first, last_name="T", profession="GNA")
        section = MasterScheduleSection.objects.filter(
            organization=self.org, name=section_name).order_by("sort_order").first()
        row = MasterScheduleRow.objects.create(organization=self.org, section=section, staff=staff)
        MasterScheduleCell.objects.create(row=row, date=D(2026, 10, 5), code="7")
        return staff

    def _run(self, **body):
        return client_for(self.admin).post(URL, {"month": "2026-10", **body}, format="json")

    def test_shift_goes_to_the_unit_named_by_the_section(self):
        unit2 = Unit.objects.create(organization=self.org, name="Unit 2")
        unit3 = Unit.objects.create(organization=self.org, name="3")  # 'Unit' prefix is optional
        a = self._row_under("Unit 2", "Ann")
        b = self._row_under("Unit 3", "Bea")
        c = self._row_under("7-3 GNA", "Cy")  # not a unit section
        r = self._run().json()
        self.assertEqual(r["created"], 3)
        self.assertEqual(r["unmatched_units"], [])
        self.assertEqual(StaffShift.objects.get(staff=a).unit, unit2)
        self.assertEqual(StaffShift.objects.get(staff=b).unit, unit3)
        self.assertIsNone(StaffShift.objects.get(staff=c).unit)

    def test_unit_with_spaces_and_case_and_other_orgs_units_ignored(self):
        mine = Unit.objects.create(organization=self.org, name="unit 1a / 1b")
        Unit.objects.create(organization=self.other, name="Unit 2")
        staff = self._row_under("Unit 1A/1B", "Dee")
        other_staff = self._row_under("Unit 2", "Eve")
        r = self._run().json()
        self.assertEqual(StaffShift.objects.get(staff=staff).unit, mine)
        self.assertIsNone(StaffShift.objects.get(staff=other_staff).unit)  # only the other org has Unit 2
        self.assertEqual(r["unmatched_units"], ["Unit 2"])

    def test_earlier_unit_less_shifts_get_their_unit_on_a_plain_rerun(self):
        staff = self._row_under("Unit 4", "Fay")
        first = self._run().json()
        self.assertEqual(first["unmatched_units"], ["Unit 4"])
        self.assertIsNone(StaffShift.objects.get(staff=staff).unit)
        unit4 = Unit.objects.create(organization=self.org, name="Unit 4")
        r = self._run().json()
        self.assertEqual((r["created"], r["updated"]), (0, 1))
        self.assertEqual(StaffShift.objects.get(staff=staff).unit, unit4)
        self.assertEqual(StaffShift.objects.filter(staff=staff).count(), 1)
        self.assertEqual(r["units_on_file"], ["Unit 4"])

    def test_a_unit_chosen_by_hand_is_kept_unless_overwrite(self):
        unit4 = Unit.objects.create(organization=self.org, name="Unit 4")
        other = Unit.objects.create(organization=self.org, name="Unit 9")
        staff = self._row_under("Unit 4", "Gus")
        self._run()
        shift = StaffShift.objects.get(staff=staff)
        self.assertEqual(shift.unit, unit4)
        shift.unit = other
        shift.save()
        self.assertEqual(self._run().json()["updated"], 0)
        self.assertEqual(StaffShift.objects.get(staff=staff).unit, other)
        self.assertEqual(self._run(overwrite=True).json()["updated"], 1)
        self.assertEqual(StaffShift.objects.get(staff=staff).unit, unit4)


class RowUnitTests(MasterScheduleBase):
    """The Unit column on a Master Schedule row."""

    _row_under = CreateScheduleUnitTests._row_under
    _run = CreateScheduleUnitTests._run

    def test_a_rows_own_unit_beats_the_section_name(self):
        unit2 = Unit.objects.create(organization=self.org, name="Unit 2")
        unit3 = Unit.objects.create(organization=self.org, name="Unit 3")
        a = self._row_under("Unit 2", "Ann")
        MasterScheduleRow.objects.filter(staff=a).update(unit=unit3)  # sits under Unit 2, assigned to Unit 3
        b = self._row_under("7-3 GNA", "Bea")  # not a unit section
        MasterScheduleRow.objects.filter(staff=b).update(unit=unit2)
        self._run()
        self.assertEqual(StaffShift.objects.get(staff=a).unit, unit3)
        self.assertEqual(StaffShift.objects.get(staff=b).unit, unit2)

    def test_row_api_sets_clears_and_validates_the_unit(self):
        unit2 = Unit.objects.create(organization=self.org, name="Unit 2")
        foreign = Unit.objects.create(organization=self.other, name="Unit 2")
        staff = self._row_under("Unit 2", "Cy")
        row = MasterScheduleRow.objects.get(staff=staff)
        c = client_for(self.admin)
        url = f"{BASE}/rows/{row.id}/"
        r = c.patch(url, {"unit": unit2.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()["unit_id"], r.json()["section_unit_id"]), (unit2.id, unit2.id))
        self.assertEqual(c.patch(url, {"unit": foreign.id}, format="json").status_code, 400)
        r = c.patch(url, {"unit": None}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()["unit_id"])
        row.refresh_from_db()
        self.assertIsNone(row.unit_id)

    def test_grid_lists_units_and_each_rows_unit(self):
        unit2 = Unit.objects.create(organization=self.org, name="Unit 2")
        staff = self._row_under("Unit 2", "Dee")
        MasterScheduleRow.objects.filter(staff=staff).update(unit=unit2)
        data = client_for(self.admin).get(
            f"{BASE}/?start=2026-10-01&end=2026-10-31").json()
        self.assertEqual([u["name"] for u in data["units"]], ["Unit 2"])
        rows = [r for s in data["sections"] for r in s["rows"] if r["staff_id"] == staff.id]
        self.assertEqual((rows[0]["unit_id"], rows[0]["section_unit_id"]), (unit2.id, unit2.id))
