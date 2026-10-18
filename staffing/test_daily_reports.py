"""
python manage.py test staffing.test_daily_reports
"""
import datetime

from .daily_reports_views import load_day
from .models import StaffShift, Unit, UnitCensus
from .test_master_schedule import MasterScheduleBase, client_for

D = datetime.date(2026, 10, 17)
URL = "/api/staffing/daily-reports/{}/pdf/"


class DailyReportTests(MasterScheduleBase):
    def setUp(self):
        super().setUp()
        self.unit2 = Unit.objects.create(organization=self.org, name="Unit 2", bed_capacity=36)
        UnitCensus.objects.create(unit=self.unit2, date=D, census=30)
        self.ann = self.stranger.__class__.objects.create(
            organization=self.org, first_name="Ann", last_name="Lee", profession="Nurse", nursing_role="rn")
        StaffShift.objects.create(
            organization=self.org, staff=self.ann, unit=self.unit2, date=D, shift_type="day",
            start_time=datetime.time(7, 0), end_time=datetime.time(15, 0))
        # a different organization's shift must never show up
        StaffShift.objects.create(
            organization=self.other, staff=self.stranger, date=D, shift_type="day",
            start_time=datetime.time(7, 0), end_time=datetime.time(15, 0))

    def test_load_day_has_units_census_beds_and_only_this_orgs_people(self):
        day = load_day(self.org, D)
        self.assertEqual(day.facility, "St Test")
        self.assertEqual([(u.name, u.beds, u.census) for u in day.units], [("Unit 2", 36, 30)])
        self.assertEqual([p.name for p in day.people["day"]], ["Ann Lee"])
        self.assertTrue(day.people["day"][0].is_rn)

    def test_every_report_returns_a_pdf(self):
        c = client_for(self.admin)
        for kind in ("assignment", "shift-sheet", "hours", "worksheet"):
            r = c.get(URL.format(kind), {"date": "2026-10-17", "shift": "day", "tz": "America/New_York"})
            self.assertEqual(r.status_code, 200, (kind, r.content[:200]))
            self.assertEqual(r["Content-Type"], "application/pdf")
            self.assertTrue(r.content.startswith(b"%PDF"), kind)

    def test_single_unit_assignment(self):
        r = client_for(self.admin).get(URL.format("assignment"), {"date": "2026-10-17", "unit": self.unit2.id})
        self.assertEqual(r.status_code, 200)

    def test_bad_params(self):
        c = client_for(self.admin)
        self.assertEqual(c.get(URL.format("nope")).status_code, 404)
        self.assertEqual(c.get(URL.format("hours"), {"date": "bad"}).status_code, 400)
        self.assertEqual(c.get(URL.format("hours"), {"shift": "lunch"}).status_code, 400)
        self.assertEqual(c.get(URL.format("assignment"), {"unit": "x"}).status_code, 400)
        self.assertEqual(c.get(URL.format("assignment"), {"unit": 999999}).status_code, 404)

    def test_other_orgs_unit_is_not_found(self):
        other_unit = Unit.objects.create(organization=self.other, name="Unit 9")
        r = client_for(self.admin).get(URL.format("assignment"), {"unit": other_unit.id})
        self.assertEqual(r.status_code, 404)

    def test_permissions(self):
        self.assertEqual(client_for(self.patient).get(URL.format("hours")).status_code, 403)
