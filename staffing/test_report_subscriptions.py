"""
Report export and subscriptions.

    python manage.py test staffing.test_report_subscriptions
"""
import datetime
from zoneinfo import ZoneInfo

from django.core import mail
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from . import report_subscriptions as subs
from .models import ReportSubscription, Staff, StaffShift

BASE = "/api/staffing"
NY = ZoneInfo("America/New_York")


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class ScheduleMathTests(TestCase):
    def sub(self, **kw):
        return ReportSubscription(timezone="America/New_York", **kw)

    def test_periods(self):
        today = datetime.date(2026, 10, 28)  # a Wednesday
        self.assertEqual(subs.period_for("previous_week", today), (datetime.date(2026, 10, 19), datetime.date(2026, 10, 25)))
        self.assertEqual(subs.period_for("previous_month", today), (datetime.date(2026, 9, 1), datetime.date(2026, 9, 30)))
        self.assertEqual(subs.period_for("yesterday", today), (datetime.date(2026, 10, 27),) * 2)
        self.assertEqual(subs.period_for("this_month", today), (datetime.date(2026, 10, 1), datetime.date(2026, 10, 31)))

    def test_daily_rolls_to_tomorrow_once_the_hour_has_passed(self):
        s = self.sub(frequency="daily", send_hour=7)
        before = datetime.datetime(2026, 10, 28, 6, 0, tzinfo=NY)
        after = datetime.datetime(2026, 10, 28, 7, 0, tzinfo=NY)
        self.assertEqual(subs.compute_next_run(s, before).astimezone(NY), datetime.datetime(2026, 10, 28, 7, 0, tzinfo=NY))
        self.assertEqual(subs.compute_next_run(s, after).astimezone(NY), datetime.datetime(2026, 10, 29, 7, 0, tzinfo=NY))

    def test_weekly_picks_the_chosen_weekday(self):
        s = self.sub(frequency="weekly", weekday=0, send_hour=7)  # Mondays
        now = datetime.datetime(2026, 10, 28, 12, 0, tzinfo=NY)  # Wednesday
        self.assertEqual(subs.compute_next_run(s, now).astimezone(NY), datetime.datetime(2026, 11, 2, 7, 0, tzinfo=NY))

    def test_monthly_day_31_uses_the_last_day_of_short_months(self):
        s = self.sub(frequency="monthly", month_day=31, send_hour=6)
        now = datetime.datetime(2026, 11, 5, 12, 0, tzinfo=NY)
        self.assertEqual(subs.compute_next_run(s, now).astimezone(NY), datetime.datetime(2026, 11, 30, 6, 0, tzinfo=NY))

    def test_monthly_last_day_option(self):
        s = self.sub(frequency="monthly", month_day=0, send_hour=6)
        now = datetime.datetime(2026, 2, 3, 12, 0, tzinfo=NY)
        self.assertEqual(subs.compute_next_run(s, now).astimezone(NY), datetime.datetime(2026, 2, 28, 6, 0, tzinfo=NY))

    def test_daylight_saving_keeps_the_local_hour(self):
        s = self.sub(frequency="daily", send_hour=7)
        now = datetime.datetime(2026, 11, 1, 12, 0, tzinfo=NY)  # clocks went back that morning
        self.assertEqual(subs.compute_next_run(s, now).astimezone(NY).hour, 7)


class SubscriptionApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(
            username="a", password="x", role="admin", organization=self.org, email="a@example.com")
        self.nurse = CustomUser.objects.create_user(
            username="n", password="x", role="nurse", organization=self.org)
        staff = Staff.objects.create(organization=self.org, first_name="Ann", last_name="Lee", profession="Nurse")
        StaffShift.objects.create(
            organization=self.org, staff=staff, date=datetime.date(2026, 10, 20), shift_type="day",
            start_time=datetime.time(7), end_time=datetime.time(15))

    def payload(self, **kw):
        base = {
            "report": "labor_hours", "frequency": "weekly", "weekday": 0, "send_hour": 7,
            "timezone": "America/New_York", "covers": "previous_week", "formats": ["pdf", "csv"],
            "recipients": ["Boss@Example.com", "boss@example.com", "pay@example.com"],
        }
        base.update(kw)
        return base

    def test_create_cleans_recipients_and_sets_next_run(self):
        r = client_for(self.admin).post(f"{BASE}/report-subscriptions/", self.payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["recipients"], ["boss@example.com", "pay@example.com"])
        self.assertIsNotNone(ReportSubscription.objects.get().next_run_at)

    def test_validation(self):
        c = client_for(self.admin)
        self.assertEqual(c.post(f"{BASE}/report-subscriptions/", self.payload(recipients=["nope"]), format="json").status_code, 400)
        self.assertEqual(c.post(f"{BASE}/report-subscriptions/", self.payload(recipients=[]), format="json").status_code, 400)
        self.assertEqual(c.post(f"{BASE}/report-subscriptions/", self.payload(report="master_schedule", formats=["csv"]), format="json").status_code, 400)
        self.assertEqual(c.post(f"{BASE}/report-subscriptions/", self.payload(report="daily_forms", formats=["pdf"], covers="previous_week"), format="json").status_code, 400)

    def test_only_admins_manage_subscriptions(self):
        self.assertEqual(client_for(self.nurse).get(f"{BASE}/report-subscriptions/").status_code, 403)

    def test_pause_clears_next_run(self):
        c = client_for(self.admin)
        pk = c.post(f"{BASE}/report-subscriptions/", self.payload(), format="json").json()["id"]
        c.patch(f"{BASE}/report-subscriptions/{pk}/", {"is_active": False}, format="json")
        self.assertIsNone(ReportSubscription.objects.get(pk=pk).next_run_at)

    def test_send_now_everyone_attaches_both_files(self):
        c = client_for(self.admin)
        pk = c.post(f"{BASE}/report-subscriptions/", self.payload(), format="json").json()["id"]
        r = c.post(f"{BASE}/report-subscriptions/{pk}/send-now/", {"to": "everyone"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(sorted(a[0].rsplit(".", 1)[1] for a in mail.outbox[0].attachments), ["csv", "pdf"])
        self.assertEqual(ReportSubscription.objects.get(pk=pk).last_status, "sent")

    def test_due_subscriptions_send_once(self):
        c = client_for(self.admin)
        pk = c.post(f"{BASE}/report-subscriptions/", self.payload(), format="json").json()["id"]
        ReportSubscription.objects.filter(pk=pk).update(next_run_at=datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc))
        self.assertEqual(subs.send_due_subscriptions()["sent"], 1)
        self.assertEqual(subs.send_due_subscriptions()["due"], 0)

    def test_export_csv_and_pdf(self):
        c = client_for(self.admin)
        q = "start=2026-10-19&end=2026-10-25"
        csv_r = c.get(f"{BASE}/reports/export/labor_hours/?file=csv&{q}")
        self.assertEqual(csv_r.status_code, 200)
        self.assertIn(b"Ann Lee", csv_r.content)
        pdf_r = c.get(f"{BASE}/reports/export/labor_hours/?file=pdf&{q}")
        self.assertTrue(pdf_r.content.startswith(b"%PDF"))
        self.assertEqual(c.get(f"{BASE}/reports/export/master_schedule/?file=csv&{q}").status_code, 400)


class StartDateTests(TestCase):
    def sub(self, **kw):
        return ReportSubscription(timezone="America/New_York", send_hour=7, **kw)

    def test_nothing_is_due_before_the_start_date(self):
        s = self.sub(frequency="daily", start_date=datetime.date(2026, 11, 10))
        now = datetime.datetime(2026, 10, 28, 12, 0, tzinfo=NY)
        self.assertEqual(subs.compute_next_run(s, now).astimezone(NY), datetime.datetime(2026, 11, 10, 7, 0, tzinfo=NY))

    def test_weekly_repeats_on_the_start_dates_weekday(self):
        s = self.sub(frequency="weekly", start_date=datetime.date(2026, 11, 4))  # a Wednesday
        now = datetime.datetime(2026, 11, 4, 8, 0, tzinfo=NY)
        self.assertEqual(subs.compute_next_run(s, now).astimezone(NY), datetime.datetime(2026, 11, 11, 7, 0, tzinfo=NY))

    def test_monthly_repeats_on_the_start_dates_day(self):
        s = self.sub(frequency="monthly", start_date=datetime.date(2026, 11, 15))
        now = datetime.datetime(2026, 11, 20, 8, 0, tzinfo=NY)
        self.assertEqual(subs.compute_next_run(s, now).astimezone(NY), datetime.datetime(2026, 12, 15, 7, 0, tzinfo=NY))

    def test_once_is_due_a_single_time(self):
        s = self.sub(frequency="once", start_date=datetime.date(2026, 11, 10))
        self.assertEqual(
            subs.compute_next_run(s, datetime.datetime(2026, 11, 1, 8, 0, tzinfo=NY)).astimezone(NY),
            datetime.datetime(2026, 11, 10, 7, 0, tzinfo=NY),
        )
        self.assertIsNone(subs.compute_next_run(s, datetime.datetime(2026, 11, 10, 8, 0, tzinfo=NY)))


class OnceSubscriptionApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(
            username="a", password="x", role="admin", organization=self.org, email="a@example.com")

    def payload(self, **kw):
        base = {
            "report": "labor_hours", "frequency": "once", "send_hour": 7, "timezone": "America/New_York",
            "covers": "yesterday", "formats": ["pdf"], "recipients": ["x@example.com"],
            "start_date": (datetime.date.today() + datetime.timedelta(days=30)).isoformat(),
        }
        base.update(kw)
        return base

    def test_once_needs_a_future_date(self):
        c = client_for(self.admin)
        self.assertEqual(c.post(f"{BASE}/report-subscriptions/", self.payload(start_date="2020-01-01"), format="json").status_code, 400)
        self.assertEqual(c.post(f"{BASE}/report-subscriptions/", self.payload(start_date=None), format="json").status_code, 400)
        self.assertEqual(c.post(f"{BASE}/report-subscriptions/", self.payload(), format="json").status_code, 201)

    def test_once_switches_itself_off_after_sending(self):
        c = client_for(self.admin)
        pk = c.post(f"{BASE}/report-subscriptions/", self.payload(), format="json").json()["id"]
        ReportSubscription.objects.filter(pk=pk).update(next_run_at=datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc))
        subs.send_due_subscriptions()
        s = ReportSubscription.objects.get(pk=pk)
        self.assertFalse(s.is_active)
        self.assertIsNone(s.next_run_at)

    def test_weekday_and_day_come_from_the_start_date(self):
        c = client_for(self.admin)
        r = c.post(f"{BASE}/report-subscriptions/", self.payload(frequency="weekly", start_date="2030-03-06"), format="json")
        self.assertEqual(r.json()["weekday"], 2)  # Wednesday
        self.assertEqual(r.json()["month_day"], 6)
