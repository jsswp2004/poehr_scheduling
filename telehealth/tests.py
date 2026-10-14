"""Telehealth tests. Chime, texting and WebSocket calls are mocked.

Staff requests log in with a real JWT, so the tenant context is set the way it is in production
(TenantAwareJWTAuthentication) and cross-organization isolation is exercised for real.
"""
import uuid
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from appointments.models import Appointment
from poehr_scheduling_backend.tenancy import clear_current_organization, set_current_organization
from users.models import Organization

from . import services
from .models import TelehealthAuditEvent, TelehealthSession

MEETING = {"MeetingId": "meeting-1", "MediaRegion": "us-east-1", "MediaPlacement": {}}
ATTENDEE = {"AttendeeId": "attendee-1", "ExternalUserId": "x", "JoinToken": "jt"}

User = get_user_model()


def make_org(name):
    return Organization.objects.create(name=name)


def make_user(username, role, org, **extra):
    return User.objects.create_user(
        username=username, password="x", role=role, organization=org, sms_consent=True, **extra
    )


def make_appointment(org, provider, patient=None, *, video=True, when=None, status="scheduled"):
    patient = patient or make_user(
        f"pt-{uuid.uuid4().hex[:6]}", "patient", org,
        first_name="Zed", last_name="Quartz", phone_number="+15555550142",
    )
    return Appointment.all_objects.create(
        organization=org,
        patient=patient,
        provider=provider,
        title="Follow-up",
        appointment_datetime=when or timezone.now(),
        is_video=video,
        status=status,
    )


def client_for(user=None):
    """An API client logged in with a real JWT (or anonymous)."""
    client = APIClient()
    if user is not None:
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


class TenantTestCase(TestCase):
    def tearDown(self):
        clear_current_organization()


@mock.patch("telehealth.services.notify_provider")
@mock.patch("telehealth.services._send_text")
@mock.patch("telehealth.chime.delete_meeting", return_value=True)
@mock.patch("telehealth.chime.delete_attendee", return_value=True)
@mock.patch("telehealth.chime.create_attendee", return_value=ATTENDEE)
@mock.patch("telehealth.chime.create_meeting", return_value=MEETING)
class FlowTests(TenantTestCase):
    def setUp(self):
        self.org = make_org("Clinic A")
        self.doc = make_user("doc", "doctor", self.org)
        self.other_doc = make_user("other", "doctor", self.org)
        self.appt = make_appointment(self.org, self.doc)
        self.staff = client_for(self.doc)
        self.patient = APIClient()

    def _create_and_send(self, send_sms):
        r = self.staff.post("/api/telehealth/sessions/", {"appointment_id": self.appt.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        sid = r.json()["id"]
        r = self.staff.post(f"/api/telehealth/sessions/{sid}/join-link/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["sent"])
        body = send_sms.call_args.args[1]
        self.assertIn("/join#", body)
        return sid, body.split("#", 1)[1]

    def test_full_visit_flow(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        sid, token = self._create_and_send(send_sms)
        self.assertEqual(TelehealthSession.objects.get(pk=sid).organization_id, self.org.pk)

        r = self.patient.post("/api/telehealth/join/redeem/", {"token": token}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        rejoin = r.json()["rejoin_token"]
        self.assertEqual(self.patient.post("/api/telehealth/join/redeem/", {"token": token}, format="json").status_code, 410)

        body = {"rejoin_token": rejoin}
        self.assertEqual(self.patient.post("/api/telehealth/join/media/", body, format="json").status_code, 403)
        self.assertEqual(self.patient.post("/api/telehealth/join/consent/", body, format="json").status_code, 200)
        self.assertEqual(self.patient.post("/api/telehealth/join/media/", body, format="json").status_code, 403)

        self.assertEqual(self.staff.post(f"/api/telehealth/sessions/{sid}/admit/", {}, format="json").status_code, 200)
        r = self.patient.post("/api/telehealth/join/media/", body, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["Attendee"]["AttendeeId"], "attendee-1")

        self.assertEqual(self.staff.post(f"/api/telehealth/sessions/{sid}/provider-token/", {}, format="json").status_code, 200)
        self.assertEqual(self.staff.post(f"/api/telehealth/sessions/{sid}/presence/", {"event": "joined"}, format="json").status_code, 200)

        self.assertEqual(self.staff.post(f"/api/telehealth/sessions/{sid}/end/", {}, format="json").status_code, 200)
        self.assertEqual(self.patient.post("/api/telehealth/join/media/", body, format="json").status_code, 410)
        delete_meeting.assert_called_once_with("meeting-1")

        types = set(TelehealthAuditEvent.objects.filter(session_id=sid).values_list("event_type", flat=True))
        for expected in ("session_created", "link_issued", "link_sent", "patient_arrived", "patient_consented",
                         "patient_admitted", "media_issued", "joined", "session_ended", "note_drafted"):
            self.assertIn(expected, types)

    def test_bad_and_missing_tokens_are_generic_410(self, *mocks):
        for token in ("", "nope"):
            self.assertEqual(self.patient.post("/api/telehealth/join/redeem/", {"token": token}, format="json").status_code, 410)
        self.assertEqual(self.patient.post("/api/telehealth/join/media/", {"rejoin_token": "garbage"}, format="json").status_code, 410)

    def test_only_the_visits_own_provider_can_admit(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        sid, token = self._create_and_send(send_sms)
        self.patient.post("/api/telehealth/join/redeem/", {"token": token}, format="json")
        other = client_for(self.other_doc)
        self.assertEqual(other.post(f"/api/telehealth/sessions/{sid}/admit/", {}, format="json").status_code, 403)
        self.assertEqual(other.post(f"/api/telehealth/sessions/{sid}/provider-token/", {}, format="json").status_code, 403)

    def test_patients_and_anonymous_cannot_use_staff_endpoints(self, *mocks):
        patient_user = make_user("pat", "patient", self.org)
        for c in (client_for(patient_user), APIClient()):
            r = c.post("/api/telehealth/sessions/", {"appointment_id": self.appt.pk}, format="json")
            self.assertIn(r.status_code, (401, 403))
            self.assertIn(c.get("/api/telehealth/schedule/").status_code, (401, 403))

    def test_audit_events_are_append_only(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        sid, _ = self._create_and_send(send_sms)
        event = TelehealthAuditEvent.objects.filter(session_id=sid).first()
        with self.assertRaises(RuntimeError):
            event.save()
        with self.assertRaises(RuntimeError):
            event.delete()

    def test_appointment_must_be_a_video_visit(self, *mocks):
        in_person = make_appointment(self.org, self.doc, video=False)
        r = self.staff.post("/api/telehealth/sessions/", {"appointment_id": in_person.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_blocked_texts_fall_back_to_copying_the_link(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        patient = self.appt.patient
        patient.sms_opt_out = True
        patient.save()
        sid = self.staff.post("/api/telehealth/sessions/", {"appointment_id": self.appt.pk}, format="json").json()["id"]
        r = self.staff.post(f"/api/telehealth/sessions/{sid}/join-link/", {}, format="json")
        self.assertEqual((r.status_code, r.json()), (200, {"sent": False, "reason": "opted_out"}))
        self.assertTrue(TelehealthAuditEvent.objects.filter(session_id=sid, event_type="link_suppressed").exists())
        r = self.staff.post(f"/api/telehealth/sessions/{sid}/join-link/", {"deliver": False}, format="json")
        self.assertIn("/join#", r.json()["url"])

    def test_the_reason_a_text_was_not_sent_is_reported(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        sid = self.staff.post("/api/telehealth/sessions/", {"appointment_id": self.appt.pk}, format="json").json()["id"]
        url = f"/api/telehealth/sessions/{sid}/join-link/"
        patient = self.appt.patient
        patient.sms_consent = False
        patient.save()
        self.assertEqual(self.staff.post(url, {}, format="json").json()["reason"], "no_consent")
        patient.sms_consent = True
        patient.save()
        send_sms.side_effect = Exception("Twilio is not configured")
        self.assertEqual(self.staff.post(url, {}, format="json").json()["reason"], "failed")
        send_sms.side_effect = None
        self.assertEqual(self.staff.post(url, {}, format="json").json(), {"sent": True, "reason": ""})
        self.appt.patient.phone_number = ""
        self.appt.patient.save()
        send_sms.reset_mock()
        self.assertEqual(self.staff.post(url, {}, format="json").json()["reason"], "no_phone")
        send_sms.assert_not_called()

    def test_a_second_account_on_the_same_number_does_not_block_a_consenting_patient(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        # An older account shares the number and never consented. A lookup by phone number would
        # find it first. The visit's own patient is the one whose consent counts.
        number = self.appt.patient.phone_number
        User.objects.create_user(username="older-twin", password="x", role="patient", organization=self.org,
                                 sms_consent=False, phone_number=number)
        sid = self.staff.post("/api/telehealth/sessions/", {"appointment_id": self.appt.pk}, format="json").json()["id"]
        r = self.staff.post(f"/api/telehealth/sessions/{sid}/join-link/", {}, format="json")
        self.assertEqual(r.json(), {"sent": True, "reason": ""})

    def test_consent_and_opt_out_are_checked_on_the_visits_patient(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        sid = self.staff.post("/api/telehealth/sessions/", {"appointment_id": self.appt.pk}, format="json").json()["id"]
        url = f"/api/telehealth/sessions/{sid}/join-link/"
        patient = self.appt.patient
        patient.sms_consent = False
        patient.save()
        self.assertEqual(self.staff.post(url, {}, format="json").json()["reason"], "no_consent")
        patient.sms_consent, patient.sms_opt_out = True, True
        patient.save()
        self.assertEqual(self.staff.post(url, {}, format="json").json()["reason"], "opted_out")
        send_sms.assert_not_called()

    def test_twilio_refusing_an_opted_out_number_is_reported_as_opted_out(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        class TwilioStop(Exception):
            code = 21610

        send_sms.side_effect = TwilioStop("Attempt to send to unsubscribed recipient")
        sid = self.staff.post("/api/telehealth/sessions/", {"appointment_id": self.appt.pk}, format="json").json()["id"]
        r = self.staff.post(f"/api/telehealth/sessions/{sid}/join-link/", {}, format="json")
        self.assertEqual(r.json(), {"sent": False, "reason": "opted_out"})

    def test_telehealth_does_not_depend_on_communicator(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        import pathlib
        source = pathlib.Path(services.__file__).read_text()
        self.assertNotIn("communicator.", source)
        self.assertNotIn("import communicator", source)

    def test_text_goes_to_the_patients_own_number(self, create_meeting, create_attendee, delete_attendee, delete_meeting, send_sms, notify):
        self._create_and_send(send_sms)
        args, kwargs = send_sms.call_args
        self.assertEqual(args[0], "+15555550142")
        self.assertNotIn("Zed", args[1])  # the text carries no name


@mock.patch("telehealth.chime.create_meeting", return_value=MEETING)
class TenancyAndRightsTests(TenantTestCase):
    def setUp(self):
        self.org_a, self.org_b = make_org("Clinic A"), make_org("Clinic B")
        self.doc_a = make_user("doc-a", "doctor", self.org_a)
        self.desk_a = make_user("desk-a", "receptionist", self.org_a)
        self.admin_b = make_user("admin-b", "admin", self.org_b)
        self.doc_b = make_user("doc-b", "doctor", self.org_b)
        self.nurse_a = make_user("nurse-a", "nurse", self.org_a)
        self.appt_a = make_appointment(self.org_a, self.doc_a)
        self.appt_b = make_appointment(self.org_b, self.doc_b)

    def test_schedule_never_crosses_organizations(self, create_meeting):
        for user in (self.admin_b, self.doc_b):
            ids = [i["appointment_id"] for i in client_for(user).get("/api/telehealth/schedule/").json()["items"]]
            self.assertEqual(ids, [self.appt_b.pk])
        ids = [i["appointment_id"] for i in client_for(self.desk_a).get("/api/telehealth/schedule/").json()["items"]]
        self.assertEqual(ids, [self.appt_a.pk])

    def test_another_organizations_session_looks_like_it_doesnt_exist(self, create_meeting):
        sid = client_for(self.doc_a).post("/api/telehealth/sessions/", {"appointment_id": self.appt_a.pk}, format="json").json()["id"]
        intruder = client_for(self.admin_b)  # an admin, but of the wrong organization
        for method, path in (
            ("get", f"/api/telehealth/sessions/{sid}/"),
            ("post", f"/api/telehealth/sessions/{sid}/join-link/"),
            ("post", f"/api/telehealth/sessions/{sid}/end/"),
            ("get", f"/api/telehealth/sessions/{sid}/visit-record/"),
        ):
            self.assertEqual(getattr(intruder, method)(path).status_code, 404, path)
        r = intruder.post("/api/telehealth/sessions/", {"appointment_id": self.appt_a.pk}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_roles_get_the_right_defaults(self, create_meeting):
        self.assertEqual(client_for(self.nurse_a).get("/api/telehealth/schedule/").status_code, 200)
        self.assertEqual(client_for(self.desk_a).get("/api/telehealth/schedule/").status_code, 200)
        self.assertEqual(client_for(make_user("pt", "patient", self.org_a)).get("/api/telehealth/schedule/").status_code, 403)

    def test_front_desk_sets_up_but_cannot_admit(self, create_meeting):
        desk = client_for(self.desk_a)
        r = desk.post("/api/telehealth/sessions/", {"appointment_id": self.appt_a.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(desk.post(f"/api/telehealth/sessions/{r.json()['id']}/admit/", {}, format="json").status_code, 403)

    def test_providers_see_only_their_own_visits(self, create_meeting):
        second = make_user("doc-a2", "doctor", self.org_a)
        make_appointment(self.org_a, second)
        mine = client_for(self.doc_a).get("/api/telehealth/schedule/").json()
        self.assertEqual([i["appointment_id"] for i in mine["items"]], [self.appt_a.pk])
        self.assertEqual(mine["items"][0]["patient_display"], "Zed Quartz")
        self.assertIn("server_time", mine)
        self.assertEqual(len(client_for(self.desk_a).get("/api/telehealth/schedule/").json()["items"]), 2)

    def test_cancelled_and_non_video_visits_are_not_listed(self, create_meeting):
        make_appointment(self.org_a, self.doc_a, status="cancelled")
        make_appointment(self.org_a, self.doc_a, video=False)
        ids = [i["appointment_id"] for i in client_for(self.doc_a).get("/api/telehealth/schedule/").json()["items"]]
        self.assertEqual(ids, [self.appt_a.pk])

    def test_schedule_date_handling(self, create_meeting):
        c = client_for(self.doc_a)
        self.assertEqual(c.get("/api/telehealth/schedule/?date=nope").status_code, 400)
        self.assertEqual(c.get("/api/telehealth/schedule/?date=2001-01-01").json()["items"], [])
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        self.assertEqual(c.get(f"/api/telehealth/schedule/?date={tomorrow}").json()["items"], [])

    def test_session_state_appears_after_creation(self, create_meeting):
        c = client_for(self.doc_a)
        c.post("/api/telehealth/sessions/", {"appointment_id": self.appt_a.pk}, format="json")
        item = c.get("/api/telehealth/schedule/").json()["items"][0]
        self.assertEqual(item["session"]["status"], "scheduled")
        self.assertEqual({p["role"] for p in item["session"]["participants"]}, {"provider", "patient"})

    def test_ping_is_public(self, create_meeting):
        r = APIClient().get("/api/telehealth/ping/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("t", r.json())


@mock.patch("telehealth.services.notify_provider")
@mock.patch("telehealth.services._send_text")
@mock.patch("telehealth.chime.delete_meeting", return_value=True)
@mock.patch("telehealth.chime.delete_attendee", return_value=True)
@mock.patch("telehealth.chime.create_attendee", return_value=ATTENDEE)
@mock.patch("telehealth.chime.create_meeting", return_value=MEETING)
class VisitRecordTests(TenantTestCase):
    def setUp(self):
        self.org = make_org("Clinic A")
        self.doc = make_user("doc", "doctor", self.org)
        self.desk = make_user("desk", "receptionist", self.org)
        self.appt = make_appointment(self.org, self.doc)
        self.staff, self.front, self.patient = client_for(self.doc), client_for(self.desk), APIClient()

    def _held_visit(self, send_sms, admit=True):
        sid = self.staff.post("/api/telehealth/sessions/", {"appointment_id": self.appt.pk}, format="json").json()["id"]
        self.staff.post(f"/api/telehealth/sessions/{sid}/join-link/", {}, format="json")
        token = send_sms.call_args.args[1].split("#", 1)[1]
        rejoin = self.patient.post("/api/telehealth/join/redeem/", {"token": token}, format="json").json()["rejoin_token"]
        self.patient.post("/api/telehealth/join/consent/", {"rejoin_token": rejoin}, format="json")
        if admit:
            self.staff.post(f"/api/telehealth/sessions/{sid}/admit/", {}, format="json")
        return sid

    def _url(self, sid):
        return f"/api/telehealth/sessions/{sid}/visit-record/"

    def _end(self, sid):
        self.staff.post(f"/api/telehealth/sessions/{sid}/end/", {}, format="json")

    def test_ending_a_visit_drafts_a_note_without_billing_claims(self, *m):
        sid = self._held_visit(m[4])
        self._end(sid)
        body = self.staff.get(self._url(sid)).json()
        self.assertIn("DRAFT", body["note_text"])
        self.assertIn("agreed to the telehealth visit", body["note_text"])
        self.assertIn("NOT CONFIRMED", body["note_text"])
        self.assertEqual(body["place_of_service"], "")
        self.assertFalse(body["ready_for_billing"])
        self.assertTrue(TelehealthAuditEvent.objects.filter(session_id=sid, event_type="note_drafted").exists())

    def test_provider_confirms_location_and_codes_follow(self, *m):
        sid = self._held_visit(m[4])
        self._end(sid)
        home = self.staff.post(self._url(sid), {"patient_location": "home", "patient_state": "ny"}, format="json").json()
        self.assertEqual((home["place_of_service"], home["modifier"], home["patient_state"]), ("10", "95", "NY"))
        self.assertNotIn("NOT CONFIRMED", home["note_text"])
        self.assertEqual(self.staff.post(self._url(sid), {"patient_location": "other"}, format="json").json()["place_of_service"], "02")
        audio = self.staff.post(self._url(sid), {"modality": "audio_only"}, format="json").json()
        self.assertEqual((audio["modifier"], audio["place_of_service"]), ("93", "02"))

    def test_confirming_during_the_visit_survives_ending(self, *m):
        sid = self._held_visit(m[4])
        self.staff.post(self._url(sid), {"patient_location": "home"}, format="json")
        self._end(sid)
        body = self.staff.get(self._url(sid)).json()
        self.assertEqual(body["place_of_service"], "10")
        self.assertIn("confirmed by provider", body["note_text"])

    def test_visit_that_never_started_is_not_billable(self, *m):
        sid = self._held_visit(m[4], admit=False)
        self.staff.post(self._url(sid), {"patient_location": "home"}, format="json")
        self._end(sid)
        body = self.staff.get(self._url(sid)).json()
        self.assertFalse(body["ready_for_billing"])
        self.assertIn("not admitted", body["note_text"])

    def test_validation_and_permissions(self, *m):
        sid = self._held_visit(m[4])
        for bad in ({"patient_location": "mars"}, {"patient_state": "New York"}, {"modality": "pigeon"}):
            self.assertEqual(self.staff.post(self._url(sid), bad, format="json").status_code, 400, bad)
        self._end(sid)
        self.assertEqual(self.front.post(self._url(sid), {"patient_location": "home"}, format="json").status_code, 403)
        self.assertEqual(self.front.get(self._url(sid)).status_code, 200)
        self.assertIn(self.patient.get(self._url(sid)).status_code, (401, 403))

    def test_note_failure_never_blocks_ending(self, *m):
        sid = self._held_visit(m[4])
        with mock.patch("telehealth.services.create_draft_note", side_effect=RuntimeError("chart down")):
            r = self.staff.post(f"/api/telehealth/sessions/{sid}/end/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        body = self.staff.get(self._url(sid)).json()
        self.assertIn("DRAFT", body["note_text"])
        self.assertFalse(body["note_pushed"])

    def test_chart_draft_is_off_by_default_and_creates_an_unsigned_note_when_on(self, *m):
        from appointments.models import ClinicalNote

        sid = self._held_visit(m[4])
        self._end(sid)
        self.assertEqual(ClinicalNote.objects.count(), 0)

        sid2 = self._held_visit_again(m[4])
        with self.settings(TELEHEALTH_CREATE_CHART_DRAFT=True):
            self.staff.post(f"/api/telehealth/sessions/{sid2}/end/", {}, format="json")
        note = ClinicalNote.objects.get()
        self.assertEqual((note.status, note.author_id, note.signed_at), ("draft", self.doc.pk, None))
        self.assertIn("TELEHEALTH VISIT - DRAFT", note.subjective)
        self.assertTrue(self.staff.get(self._url(sid2)).json()["note_pushed"])

    def _held_visit_again(self, send_sms):
        self.appt = make_appointment(self.org, self.doc)
        return self._held_visit(send_sms)

    def test_schedule_shows_billing_summary_for_ended_visits(self, *m):
        sid = self._held_visit(m[4])
        self.staff.post(self._url(sid), {"patient_location": "home"}, format="json")
        self._end(sid)
        item = self.staff.get("/api/telehealth/schedule/").json()["items"][0]
        self.assertEqual(item["session"]["billing"], {"confirmed": True, "place_of_service": "10", "modifier": "95"})

    def test_note_and_audit_carry_no_patient_identifiers(self, *m):
        sid = self._held_visit(m[4])
        self.staff.post(self._url(sid), {"patient_location": "home"}, format="json")
        self._end(sid)
        body = self.staff.get(self._url(sid)).json()
        self.assertNotIn("Zed", body["note_text"])
        self.assertNotIn("5550142", body["note_text"])
        for event in TelehealthAuditEvent.objects.filter(session_id=sid, event_type="billing_context_set"):
            self.assertEqual(set(event.metadata), {"place_of_service", "modifier", "modality"})


class VideoVisitFromAppointmentTypeTests(TenantTestCase):
    """The Video visit checkbox on the appointment form saves through the normal appointment API."""

    def setUp(self):
        self.org = make_org("Clinic A")
        self.doc = make_user("doc", "doctor", self.org)
        self.patient = make_user("pat", "patient", self.org, phone_number="+15555550142")
        # Front desk / admins schedule on behalf of patients; the provider is the doctor.
        self.client = client_for(make_user("desk", "admin", self.org))

    def _body(self, **extra):
        monday = timezone.now() + timedelta(days=(7 - timezone.now().weekday()) % 7 or 7)
        return {
            "patient": self.patient.pk,
            "title": "Follow-up",
            "appointment_datetime": monday.replace(hour=15, minute=0, second=0, microsecond=0).isoformat(),
            "provider": self.doc.pk,
            "organization": self.org.pk,
            **extra,
        }

    def test_telehealth_appointment_type_is_a_video_visit(self):
        """The existing Appointment Type 'Telehealth Visit' is all staff need to set."""
        r = self.client.post("/api/appointments/", self._body(title="Telehealth Visit"), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        appt = Appointment.all_objects.get(pk=r.json()["id"])
        self.assertTrue(services.appointment_is_video(appt))
        set_current_organization(self.org)
        self.assertIn(appt.pk, [a.pk for a in services.video_appointments(appt.appointment_datetime.date())])

    def test_other_appointment_types_are_not_video(self):
        r = self.client.post("/api/appointments/", self._body(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        appt = Appointment.all_objects.get(pk=r.json()["id"])
        self.assertFalse(services.appointment_is_video(appt))
        set_current_organization(self.org)
        self.assertNotIn(appt.pk, [a.pk for a in services.video_appointments(appt.appointment_datetime.date())])

    def test_repeating_telehealth_visits_stay_video(self):
        r = self.client.post(
            "/api/appointments/",
            self._body(
                title="Telehealth Visit",
                recurrence="weekly",
                recurrence_end_date=(timezone.now() + timedelta(days=60)).date().isoformat(),
            ),
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        series = Appointment.all_objects.filter(patient=self.patient)
        self.assertGreater(series.count(), 1)
        self.assertTrue(all(services.appointment_is_video(a) for a in series))
