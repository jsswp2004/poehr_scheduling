"""
Tests for the calendar coverage-status engine, time-off effects and the
emergency flow. NOTE: written alongside the feature; run with

    python manage.py test staffing.test_coverage_status
"""
import datetime
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from .coverage import assigned_staff_count
from .coverage_status import compute_coverage_status
from .models import (
    ShiftCoverageRequirement, Staff, StaffShift, StaffTimeOffRequest, Unit, UnitCensus,
)

D = datetime.date(2026, 10, 5)  # a Monday


def mk_staff(org, i, role="cna", **kw):
    return Staff.objects.create(
        organization=org, first_name=f"F{i}", last_name=f"L{i}",
        profession="Nurse", nursing_role=role, **kw,
    )


def mk_shift(org, staff, unit=None, d=D, shift_type="day"):
    return StaffShift.objects.create(
        organization=org, staff=staff, unit=unit, date=d, shift_type=shift_type,
        start_time=datetime.time(7, 0), end_time=datetime.time(15, 0),
    )


class FixedRequirementStatusTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", state="MD")
        ShiftCoverageRequirement.objects.create(
            organization=self.org, shift_type="day", days_of_week=["mon"],
            min_staff_required=2, start_date=D,
        )

    def status(self):
        return compute_coverage_status(self.org, D, D)["days"][D.isoformat()]["status"]

    def test_levels(self):
        s = [mk_staff(self.org, i) for i in range(3)]
        mk_shift(self.org, s[0])
        self.assertEqual(self.status(), "not_met")
        mk_shift(self.org, s[1])
        self.assertEqual(self.status(), "at_risk")   # exactly at minimum
        mk_shift(self.org, s[2])
        self.assertEqual(self.status(), "met")

    def test_buffer_zero(self):
        self.org.staffing_spare_buffer = 0
        self.org.save()
        for i in range(2):
            mk_shift(self.org, mk_staff(self.org, i))
        self.assertEqual(self.status(), "met")

    def test_approved_time_off_removes_person(self):
        s = [mk_staff(self.org, i) for i in range(3)]
        for x in s:
            mk_shift(self.org, x)
        StaffTimeOffRequest.objects.create(
            organization=self.org, staff=s[0], kind="off_request", status="approved",
            start_date=D, end_date=D,
        )
        self.assertEqual(self.status(), "at_risk")  # 2 left = minimum

    def test_pending_request_is_at_risk(self):
        s = [mk_staff(self.org, i) for i in range(4)]
        for x in s:
            mk_shift(self.org, x)
        StaffTimeOffRequest.objects.create(
            organization=self.org, staff=s[0], kind="off_request", status="pending",
            start_date=D, end_date=D,
        )
        self.assertEqual(self.status(), "at_risk")

    def test_emergency_open_is_at_risk_then_met_when_resolved(self):
        s = [mk_staff(self.org, i) for i in range(5)]
        for x in s:
            mk_shift(self.org, x)
        req = StaffTimeOffRequest.objects.create(
            organization=self.org, staff=s[0], kind="emergency", status="open",
            start_date=D, end_date=D,
        )
        self.assertEqual(self.status(), "at_risk")
        req.status = "resolved"
        req.save()
        # cover arranged: 4 left vs minimum 2 -> spare capacity, green again
        self.assertEqual(self.status(), "met")

    def test_report_helper_excludes_people_who_are_out(self):
        s = [mk_staff(self.org, i) for i in range(3)]
        for x in s:
            mk_shift(self.org, x)
        req = ShiftCoverageRequirement.objects.first()
        self.assertEqual(assigned_staff_count(req, D), 3)
        StaffTimeOffRequest.objects.create(
            organization=self.org, staff=s[0], kind="emergency", status="open",
            start_date=D, end_date=D,
        )
        self.assertEqual(assigned_staff_count(req, D), 2)


class AutoStateRuleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", state="MD")
        self.unit = Unit.objects.create(organization=self.org, name="2 West", shift_pattern="8h")
        UnitCensus.objects.create(unit=self.unit, date=D, census=30)

    def day(self):
        return compute_coverage_status(self.org, D, D)["days"][D.isoformat()]

    def test_no_requirement_rows_needed(self):
        day = self.day()
        self.assertEqual(day["status"], "not_met")   # nobody scheduled
        self.assertEqual({i["shift_type"] for i in day["items"]}, {"day", "evening", "night"})
        self.assertTrue(all(i["source"] == "state_rule" for i in day["items"]))

    def test_unknown_without_census(self):
        UnitCensus.objects.all().delete()
        self.assertEqual(self.day()["status"], "unknown")

    def test_state_without_rule_uses_no_auto_items(self):
        self.org.state = "NY"
        self.org.save()
        out = compute_coverage_status(self.org, D, D)
        self.assertEqual(out["days"][D.isoformat()]["items"], [])
        self.assertIsNone(out["rule"])
        self.assertTrue(out["warnings"])


class EmergencyApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", state="MD")
        self.admin = CustomUser.objects.create_user(
            username="boss", email="boss@example.com", password="x", role="admin",
            organization=self.org,
        )
        self.staff = mk_staff(self.org, 1, role="rn")
        self.other = mk_staff(self.org, 2, role="rn")
        self.login = CustomUser.objects.create_user(
            username="s1", email="s1@example.com", password="x", role="staff",
            organization=self.org,
        )
        self.staff.user = self.login
        self.staff.save()
        self.shift = mk_shift(self.org, self.staff, d=datetime.date.today())
        self.client = APIClient()

    @mock.patch("communicator.utils.send_email")
    def test_staff_emergency_alerts_admin_and_is_idempotent(self, send_email):
        self.client.force_authenticate(self.login)
        body = {"kind": "emergency", "shift_id": self.shift.id, "reason": "Family emergency"}
        r1 = self.client.post("/api/staffing/me/time-off/", body, format="json")
        self.assertEqual(r1.status_code, 201)
        self.assertTrue(r1.data["alert_sent"])
        self.assertEqual(send_email.call_count, 1)
        self.assertEqual(send_email.call_args[0][0], "boss@example.com")
        r2 = self.client.post("/api/staffing/me/time-off/", body, format="json")
        self.assertTrue(r2.data.get("duplicate"))
        self.assertEqual(send_email.call_count, 1)  # no second alert

    def test_staff_cannot_use_admin_endpoints(self):
        self.client.force_authenticate(self.login)
        self.assertEqual(self.client.get("/api/staffing/time-off/").status_code, 403)

    def test_off_request_in_past_rejected(self):
        self.client.force_authenticate(self.login)
        yesterday = (datetime.date.today() - datetime.timedelta(days=3)).isoformat()
        r = self.client.post(
            "/api/staffing/me/time-off/",
            {"kind": "off_request", "start_date": yesterday}, format="json",
        )
        self.assertEqual(r.status_code, 400)

    @mock.patch("communicator.utils.send_email")
    def test_admin_resolves_with_cover_creates_shift(self, _send):
        self.client.force_authenticate(self.login)
        req_id = self.client.post(
            "/api/staffing/me/time-off/", {"kind": "emergency", "shift_id": self.shift.id}, format="json"
        ).data["id"]
        self.client.force_authenticate(self.admin)
        cands = self.client.get(f"/api/staffing/time-off/{req_id}/cover-candidates/").data["candidates"]
        self.assertEqual([c["id"] for c in cands], [self.other.id])
        r = self.client.post(
            f"/api/staffing/time-off/{req_id}/resolve/", {"cover_staff_id": self.other.id}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["cover_shifts_created"], 1)
        self.assertTrue(StaffShift.objects.filter(staff=self.other, date=self.shift.date).exists())

    def test_coverage_status_endpoint(self):
        self.client.force_authenticate(self.login)
        d = datetime.date.today().isoformat()
        r = self.client.get(f"/api/staffing/coverage-status/?start={d}&end={d}")
        self.assertEqual(r.status_code, 200)
        self.assertIn(d, r.data["days"])

    def test_location_patch_admin_only_and_validates_state(self):
        self.client.force_authenticate(self.login)
        self.assertEqual(self.client.patch("/api/staffing/location/", {"state": "NY"}, format="json").status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch("/api/staffing/location/", {"state": "ZZ"}, format="json").status_code, 400)
        r = self.client.patch("/api/staffing/location/", {"state": "new york", "city": "Brooklyn"}, format="json")
        self.assertEqual(r.data["state"], "NY")
