"""
python manage.py test staffing.test_pickup
"""
import datetime
from unittest import mock

from django.utils import timezone

from .models import Staff, StaffShift, Unit
from .test_master_schedule import MasterScheduleBase, client_for

PICKUP = "/api/staffing/me/pick-up-shift/"
PROFILE = "/api/staffing/me/pickup/"


class PickUpShiftTests(MasterScheduleBase):
    def setUp(self):
        super().setUp()
        self.me = Staff.objects.create(
            organization=self.org, first_name="Nina", last_name="Nurse",
            profession="Nurse", nursing_role="rn", user=self.nurse)
        self.unit2 = Unit.objects.create(organization=self.org, name="Unit 2")
        self.day = timezone.localdate() + datetime.timedelta(days=3)
        self.admin.email = "boss@example.com"
        self.admin.phone_number = "+15555550100"
        self.admin.sms_consent = True
        self.admin.sms_opt_out = False
        self.admin.save()

    def _post(self, user=None, **over):
        body = {"date": self.day.isoformat(), "shift_type": "day", "unit": self.unit2.id, **over}
        return client_for(user or self.nurse).post(PICKUP, body, format="json")

    # ---- profile -----------------------------------------------------------
    def test_profile_names_the_signed_in_staff_member(self):
        r = client_for(self.nurse).get(PROFILE)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["staff_id"], self.me.id)
        self.assertEqual(r.data["full_name"], "Nina Nurse")

    def test_profile_without_a_roster_link(self):
        r = client_for(self.admin).get(PROFILE)
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data["staff_id"])

    # ---- create ------------------------------------------------------------
    @mock.patch("communicator.utils.send_sms")
    @mock.patch("communicator.utils.send_email")
    def test_pickup_creates_a_pickup_shift_and_alerts_the_admin(self, send_email, send_sms):
        self.org.staffing_messaging_enabled = True
        self.org.save()
        r = self._post(notes="Happy to help")
        self.assertEqual(r.status_code, 201, r.content)
        shift = StaffShift.objects.get(pk=r.data["id"])
        self.assertEqual(shift.staff_id, self.me.id)
        self.assertEqual(shift.source, "pickup")
        self.assertEqual(shift.unit_id, self.unit2.id)
        self.assertEqual((shift.start_time.hour, shift.end_time.hour), (7, 15))  # day defaults
        send_email.assert_called_once()
        self.assertIn("Nina Nurse", send_email.call_args[0][1])  # subject names the staff member
        send_sms.assert_called_once()
        self.assertIn("Nina Nurse", send_sms.call_args[0][1])
        self.assertEqual(r.data["alert"], {"emails": 1, "sms": 1})

    @mock.patch("communicator.utils.send_sms")
    @mock.patch("communicator.utils.send_email")
    def test_no_text_when_messaging_is_off_but_email_still_goes(self, send_email, send_sms):
        self.org.staffing_messaging_enabled = False
        self.org.save()
        self.assertEqual(self._post().status_code, 201)
        send_email.assert_called_once()
        send_sms.assert_not_called()

    @mock.patch("communicator.utils.send_email", side_effect=RuntimeError("smtp down"))
    def test_a_failing_email_does_not_undo_the_shift(self, _send):
        r = self._post()
        self.assertEqual(r.status_code, 201)
        self.assertTrue(StaffShift.objects.filter(staff=self.me, source="pickup").exists())

    @mock.patch("communicator.utils.send_email")
    def test_staff_in_the_body_is_ignored(self, _send):
        other = Staff.objects.create(organization=self.org, first_name="Other", last_name="Person", profession="GNA")
        r = self._post(staff=other.id)
        self.assertEqual(r.status_code, 201)
        self.assertEqual(StaffShift.objects.get(pk=r.data["id"]).staff_id, self.me.id)
        self.assertFalse(StaffShift.objects.filter(staff=other).exists())

    # ---- validation --------------------------------------------------------
    @mock.patch("communicator.utils.send_email")
    def test_validation(self, _send):
        yesterday = (timezone.localdate() - datetime.timedelta(days=1)).isoformat()
        self.assertEqual(self._post(date=yesterday).status_code, 400)
        self.assertEqual(self._post(date="nope").status_code, 400)
        self.assertEqual(self._post(shift_type="lunch").status_code, 400)
        self.assertEqual(self._post(start_time="08:00", end_time="08:00").status_code, 400)
        other_unit = Unit.objects.create(organization=self.other, name="Unit 9")
        self.assertEqual(self._post(unit=other_unit.id).status_code, 400)
        self.assertFalse(StaffShift.objects.filter(staff=self.me).exists())

    @mock.patch("communicator.utils.send_email")
    def test_overlapping_shift_is_refused(self, _send):
        self.assertEqual(self._post().status_code, 201)
        r = self._post(start_time="11:00", end_time="19:00")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(StaffShift.objects.filter(staff=self.me).count(), 1)
        # an adjacent shift is fine
        self.assertEqual(self._post(shift_type="evening").status_code, 201)

    @mock.patch("communicator.utils.send_email")
    def test_overnight_shift_from_the_day_before_blocks_the_early_morning(self, _send):
        StaffShift.objects.create(
            organization=self.org, staff=self.me, date=self.day - datetime.timedelta(days=1),
            shift_type="night", start_time=datetime.time(23, 0), end_time=datetime.time(7, 0))
        self.assertEqual(self._post(start_time="06:00", end_time="14:00").status_code, 400)
        self.assertEqual(self._post().status_code, 201)  # 7a-3p starts as the night shift ends

    # ---- who may use it ----------------------------------------------------
    def test_permissions(self):
        self.assertEqual(client_for(self.patient).post(PICKUP, {"date": self.day.isoformat()}, format="json").status_code, 403)
        self.assertEqual(client_for(self.patient).get(PROFILE).status_code, 403)
        # a manager login with no roster link cannot pick up
        r = client_for(self.admin).post(PICKUP, {"date": self.day.isoformat()}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("not linked", r.data["error"])
