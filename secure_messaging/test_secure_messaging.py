import io
import json
import os

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from asgiref.testing import ApplicationCommunicator
from django.contrib.auth.models import AnonymousUser
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TransactionTestCase
from django.utils import timezone
from PIL import Image

from appointments.models import Bed, Facility, Room, Unit
from appointments.test_locations import Base, make_user
from secure_messaging.consumers import SecureMessagingConsumer
from secure_messaging.models import AuditEvent, MessageAttachment, SecureMessage, Thread, ThreadMember
from users.models import CustomUser, Organization, Patient, Registration, UserRightOverride

API = "/api/secure-messages/"
THREADS = API + "threads/"
PEOPLE = API + "people/"
UNREAD = API + "unread-count/"
ADMIT = "/api/users/admissions/admit/"


def msgs(thread):
    return THREADS + f"{thread}/messages/"


def photo(width, height, fmt="JPEG", noise=True, exif=False, mode="RGB"):
    """A picture as upload bytes; noise makes it hard to compress, so it starts well over 1 MB."""
    if noise:
        img = Image.frombytes("RGB", (width, height), os.urandom(width * height * 3))
    else:
        img = Image.new("RGB", (width, height), (200, 30, 30))
    if mode != "RGB":
        img = img.convert(mode)
    out = io.BytesIO()
    kwargs = {}
    if exif:
        data = Image.Exif()
        data[0x0112] = 6  # rotate 90
        data[0x010F] = "TestCam"
        kwargs["exif"] = data
    img.save(out, format=fmt, **kwargs)
    return out.getvalue()


def upload(raw, name="p.jpg", content_type="image/jpeg"):
    return SimpleUploadedFile(name, raw, content_type=content_type)


class MsgBase(Base):
    def setUp(self):
        super().setUp()
        self.receptionist = make_user("recep", "receptionist", self.org)
        self.nurse2 = make_user("nurse2", "nurse", self.org, first_name="Nora", last_name="Hale")
        self.outsider = make_user("out", "doctor", self.other_org)
        self.outsider_admin = make_user("outadm", "admin", self.other_org)
        self.roster = make_user("roster", "staff", self.org)

    def direct(self, a, b):
        r = self.as_(a).post(THREADS, {"kind": "direct", "user": b.pk}, format="json")
        self.assertIn(r.status_code, (200, 201), r.content)
        return r.json()["id"]

    def send(self, user, thread, body="hello", **extra):
        return self.as_(user).post(msgs(thread), {"body": body, **extra}, format="json")

    def group(self, creator, members, title="Rounds"):
        r = self.as_(creator).post(THREADS, {"kind": "group", "title": title, "members": [m.pk for m in members]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["id"]

    def admit(self, patient, attending=None, nurse=None):
        profile = Patient.objects.get(user=patient)  # a visit belongs to the patient profile, not the login
        body = {"patient": profile.pk, "unit": self.west.pk, "room": self.room.pk, "bed": self.bed_a.pk}
        r = self.as_(self.nurse).post(ADMIT, body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        Registration.objects.filter(pk=r.json()["id"]).update(attending_provider=attending, assigned_nurse=nurse)


class AccessTests(MsgBase):
    def test_must_be_signed_in(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(THREADS).status_code, 401)

    def test_patients_and_roster_staff_cannot_use_it(self):
        for user in (self.patient_user, self.roster):
            self.assertEqual(self.as_(user).get(THREADS).status_code, 403, user.role)
            self.assertEqual(self.as_(user).get(UNREAD).status_code, 403)

    def test_every_clinical_and_front_office_role_can(self):
        for user in (self.doctor, self.nurse, self.registrar, self.receptionist, self.admin):
            self.assertEqual(self.as_(user).get(THREADS).status_code, 200, user.role)

    def test_an_admin_can_revoke_the_right_from_one_person(self):
        UserRightOverride.objects.create(user=self.nurse, right_code="secure_messaging.use", is_granted=False)
        self.assertEqual(self.as_(self.nurse).get(THREADS).status_code, 403)
        self.assertEqual(self.as_(self.nurse2).get(THREADS).status_code, 200)

    def test_a_user_without_an_organization_gets_a_clear_refusal(self):
        r = self.as_(self.sysadmin).get(THREADS)
        self.assertEqual(r.status_code, 403)
        self.assertIn("organization", r.json()["detail"])


class PeopleTests(MsgBase):
    def test_lists_colleagues_of_my_organization_only(self):
        names = {p["id"] for p in self.as_(self.doctor).get(PEOPLE).json()["people"]}
        self.assertIn(self.nurse.pk, names)
        self.assertNotIn(self.doctor.pk, names)  # not me
        self.assertNotIn(self.outsider.pk, names)  # other organization
        self.assertNotIn(self.patient_user.pk, names)  # patients are not colleagues
        self.assertNotIn(self.roster.pk, names)  # roster logins cannot message

    def test_search(self):
        found = self.as_(self.doctor).get(PEOPLE, {"q": "hale"}).json()["people"]
        self.assertEqual([p["id"] for p in found], [self.nurse2.pk])

    def test_a_person_limited_to_a_facility_sees_colleagues_at_it_or_unassigned(self):
        other = Facility.objects.create(organization=self.org, name="St. Mary Hospital", kind="hospital")
        self.nurse.facilities.set([self.hospital])
        self.nurse2.facilities.set([other])  # elsewhere
        self.doctor.facilities.set([self.hospital])  # shares
        data = self.as_(self.nurse).get(PEOPLE).json()
        ids = {p["id"] for p in data["people"]}
        self.assertIn(self.doctor.pk, ids)
        self.assertIn(self.registrar.pk, ids)  # not tied to any facility
        self.assertNotIn(self.nurse2.pk, ids)
        self.assertTrue(data["limited_to_my_facilities"])
        everyone = {p["id"] for p in self.as_(self.nurse).get(PEOPLE, {"all": 1}).json()["people"]}
        self.assertIn(self.nurse2.pk, everyone)


class DirectThreadTests(MsgBase):
    def test_start_and_reuse(self):
        r = self.as_(self.doctor).post(THREADS, {"kind": "direct", "user": self.nurse.pk}, format="json")
        self.assertEqual(r.status_code, 201)
        again = self.as_(self.nurse).post(THREADS, {"kind": "direct", "user": self.doctor.pk}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["id"], r.json()["id"])
        self.assertEqual(Thread.objects.filter(kind="direct").count(), 1)

    def test_each_side_sees_the_other_persons_name(self):
        t = self.direct(self.doctor, self.nurse2)
        self.assertEqual(self.as_(self.doctor).get(THREADS + f"{t}/").json()["title"], "Nora Hale")
        self.assertEqual(self.as_(self.nurse2).get(THREADS + f"{t}/").json()["title"], "Jeffrey Lee")

    def test_cannot_start_with_the_wrong_people(self):
        for target in (self.outsider, self.patient_user, self.roster, self.doctor):
            r = self.as_(self.doctor).post(THREADS, {"kind": "direct", "user": target.pk}, format="json")
            self.assertEqual(r.status_code, 400, target.role)
        self.nurse2.is_active = False
        self.nurse2.save()
        self.assertEqual(self.as_(self.doctor).post(THREADS, {"kind": "direct", "user": self.nurse2.pk}, format="json").status_code, 400)
        self.assertEqual(self.as_(self.doctor).post(THREADS, {"kind": "direct", "user": "x"}, format="json").status_code, 400)

    def test_a_stranger_cannot_read_or_send(self):
        t = self.direct(self.doctor, self.nurse)
        self.assertEqual(self.as_(self.nurse2).get(msgs(t)).status_code, 404)  # same organization, not a member
        self.assertEqual(self.send(self.nurse2, t).status_code, 404)
        self.assertEqual(self.send(self.outsider, t).status_code, 404)
        self.assertEqual(self.as_(self.nurse2).get(THREADS + f"{t}/").status_code, 404)

    def test_bad_kind(self):
        self.assertEqual(self.as_(self.doctor).post(THREADS, {"kind": "broadcast"}, format="json").status_code, 400)


class GroupAndChannelTests(MsgBase):
    def test_group_needs_a_name_and_people(self):
        post = lambda body: self.as_(self.doctor).post(THREADS, {"kind": "group", **body}, format="json").status_code
        self.assertEqual(post({"members": [self.nurse.pk]}), 400)
        self.assertEqual(post({"title": "  ", "members": [self.nurse.pk]}), 400)
        self.assertEqual(post({"title": "Rounds", "members": []}), 400)
        self.assertEqual(post({"title": "x" * 121, "members": [self.nurse.pk]}), 400)
        self.assertEqual(post({"title": "Rounds", "members": [self.outsider.pk]}), 400)
        self.assertEqual(post({"title": "Rounds", "members": [self.nurse.pk]}), 201)

    def test_group_members_all_see_it(self):
        t = self.group(self.doctor, [self.nurse, self.registrar])
        for u in (self.doctor, self.nurse, self.registrar):
            self.assertEqual(self.as_(u).get(THREADS + f"{t}/").json()["title"], "Rounds")
        self.assertEqual(self.as_(self.nurse2).get(THREADS + f"{t}/").status_code, 404)

    def test_only_admins_create_channels(self):
        body = {"kind": "channel", "title": "3 West", "members": [self.nurse.pk], "facility": self.hospital.pk}
        self.assertEqual(self.as_(self.doctor).post(THREADS, body, format="json").status_code, 403)
        r = self.as_(self.admin).post(THREADS, body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["facility"], self.hospital.pk)
        other = Facility.objects.create(organization=self.other_org, name="Elsewhere", kind="hospital")
        bad = self.as_(self.admin).post(THREADS, {**body, "facility": other.pk}, format="json")
        self.assertEqual(bad.status_code, 400)


class PatientThreadTests(MsgBase):
    def open(self, user, patient=None):
        return self.as_(user).post(THREADS, {"kind": "patient", "patient": (patient or self.patient_user).pk}, format="json")

    def test_the_care_team_is_filled_in_from_the_visit(self):
        self.admit(self.patient_user, attending=self.doctor, nurse=self.nurse2)
        r = self.open(self.registrar)
        self.assertEqual(r.status_code, 201, r.content)
        members = {m["id"] for m in r.json()["members"]}
        self.assertEqual(members, {self.registrar.pk, self.doctor.pk, self.nurse2.pk})
        self.assertEqual(r.json()["title"], "Bcs, Test · care team")
        self.assertEqual(r.json()["patient"]["id"], self.patient_user.pk)

    def test_one_thread_per_patient_and_a_clinician_who_opens_it_joins(self):
        first = self.open(self.doctor).json()["id"]
        r = self.open(self.nurse)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["id"], first)
        self.assertIn(self.nurse.pk, {m["id"] for m in r.json()["members"]})
        self.assertEqual(Thread.objects.filter(kind="patient").count(), 1)
        system = SecureMessage.objects.filter(thread_id=first, kind="system")
        self.assertEqual(system.count(), 1)
        self.assertIn("joined the care team", system.first().body)
        self.assertTrue(AuditEvent.objects.filter(action="joined_patient_thread", user=self.nurse).exists())
        self.open(self.nurse)  # opening again changes nothing
        self.assertEqual(SecureMessage.objects.filter(thread_id=first, kind="system").count(), 1)

    def test_receptionists_cannot_and_other_organizations_patients_are_hidden(self):
        self.assertEqual(self.open(self.receptionist).status_code, 403)
        foreign = make_user("fpat", "patient", self.other_org)
        self.assertEqual(self.open(self.doctor, foreign).status_code, 404)
        self.assertEqual(self.as_(self.doctor).post(THREADS, {"kind": "patient", "patient": 99999}, format="json").status_code, 404)
        self.assertEqual(self.as_(self.doctor).post(THREADS, {"kind": "patient"}, format="json").status_code, 400)

    def test_messages_are_stamped_with_the_care_setting_they_were_sent_in(self):
        t = self.open(self.doctor).json()["id"]
        before = self.send(self.doctor, t, "clinic note").json()
        self.assertEqual(before["care_setting"], "ambulatory")
        self.admit(self.patient_user, attending=self.doctor)
        after = self.send(self.doctor, t, "now inpatient").json()
        self.assertEqual(after["care_setting"], "acute")
        self.assertIsNotNone(after["visit"])

    def test_the_patient_thread_is_found_by_patient(self):
        t = self.open(self.doctor).json()["id"]
        r = self.as_(self.doctor).get(THREADS, {"patient": self.patient_user.pk}).json()["threads"]
        self.assertEqual([x["id"] for x in r], [t])
        self.assertEqual(self.as_(self.doctor).get(THREADS, {"patient": "x"}).status_code, 400)

    def test_only_clinical_roles_can_be_added_to_a_care_team(self):
        t = self.open(self.doctor).json()["id"]
        r = self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": self.receptionist.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        ok = self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": self.nurse2.pk}, format="json")
        self.assertEqual(ok.status_code, 200)


class SendAndReadTests(MsgBase):
    def test_send_and_list(self):
        t = self.direct(self.doctor, self.nurse)
        r = self.send(self.doctor, t, "  Bed 4 needs a repeat K  ")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["body"], "Bed 4 needs a repeat K")
        self.assertTrue(body["mine"])
        self.assertEqual(body["sender"]["name"], "Jeffrey Lee")
        got = self.as_(self.nurse).get(msgs(t)).json()
        self.assertEqual([m["body"] for m in got["messages"]], ["Bed 4 needs a repeat K"])
        self.assertFalse(got["messages"][0]["mine"])
        self.assertFalse(got["has_more_older"])

    def test_validation(self):
        t = self.direct(self.doctor, self.nurse)
        self.assertEqual(self.send(self.doctor, t, "   ").status_code, 400)
        self.assertEqual(self.send(self.doctor, t, "x" * 4001).status_code, 400)
        self.assertEqual(self.send(self.doctor, t, "x" * 4000).status_code, 201)
        self.assertEqual(self.send(self.doctor, t, "hi", priority="panic").status_code, 400)
        other = self.direct(self.doctor, self.registrar)
        foreign = self.send(self.doctor, other, "elsewhere").json()["id"]
        self.assertEqual(self.send(self.doctor, t, "re", reply_to=foreign).status_code, 400)

    def test_reply_shows_what_it_answers(self):
        t = self.direct(self.doctor, self.nurse)
        first = self.send(self.doctor, t, "Please recheck the potassium").json()["id"]
        reply = self.send(self.nurse, t, "Done, 4.1", reply_to=first).json()
        self.assertEqual(reply["reply_to"], {"id": first, "sender": "Jeffrey Lee", "preview": "Please recheck the potassium"})

    def test_urgent_flag(self):
        t = self.direct(self.doctor, self.nurse)
        self.assertEqual(self.send(self.doctor, t, "Rapid response bed 9", priority="urgent").json()["priority"], "urgent")

    def test_paging(self):
        t = self.direct(self.doctor, self.nurse)
        ids = [self.send(self.doctor, t, f"m{i}").json()["id"] for i in range(7)]
        page = self.as_(self.nurse).get(msgs(t), {"limit": 3}).json()
        self.assertEqual([m["id"] for m in page["messages"]], ids[4:])
        self.assertTrue(page["has_more_older"])
        older = self.as_(self.nurse).get(msgs(t), {"limit": 3, "before": ids[4]}).json()
        self.assertEqual([m["id"] for m in older["messages"]], ids[1:4])
        self.assertTrue(older["has_more_older"])
        oldest = self.as_(self.nurse).get(msgs(t), {"limit": 3, "before": ids[1]}).json()
        self.assertEqual([m["id"] for m in oldest["messages"]], ids[:1])
        self.assertFalse(oldest["has_more_older"])
        newer = self.as_(self.nurse).get(msgs(t), {"after": ids[4]}).json()
        self.assertEqual([m["id"] for m in newer["messages"]], ids[5:])
        self.assertEqual(self.as_(self.nurse).get(msgs(t), {"after": "x"}).status_code, 400)

    def test_thread_list_shows_newest_first_with_preview(self):
        a = self.direct(self.doctor, self.nurse)
        b = self.direct(self.doctor, self.registrar)
        self.send(self.doctor, a, "older")
        self.send(self.doctor, b, "newer")
        threads = self.as_(self.doctor).get(THREADS).json()["threads"]
        self.assertEqual([t["id"] for t in threads], [b, a])
        self.assertEqual(threads[0]["last_message"]["preview"], "newer")
        self.assertEqual(threads[0]["last_message"]["sender"], "Jeffrey Lee")


class UnreadTests(MsgBase):
    def test_unread_and_read(self):
        t = self.direct(self.doctor, self.nurse)
        a = self.send(self.doctor, t, "one").json()["id"]
        b = self.send(self.doctor, t, "two", priority="urgent").json()["id"]
        mine = self.as_(self.doctor).get(UNREAD).json()
        self.assertEqual((mine["unread"], mine["threads"]), (0, 0))  # your own messages are never unread
        theirs = self.as_(self.nurse).get(UNREAD).json()
        self.assertEqual((theirs["unread"], theirs["urgent"], theirs["threads"], theirs["latest"]), (2, 1, 1, b))
        row = self.as_(self.nurse).get(THREADS).json()["threads"][0]
        self.assertEqual((row["unread"], row["urgent_unread"]), (2, 1))
        r = self.as_(self.nurse).post(THREADS + f"{t}/read/", {"upto": a}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.as_(self.nurse).get(UNREAD).json()["unread"], 1)
        self.as_(self.nurse).post(THREADS + f"{t}/read/", {}, format="json")
        self.assertEqual(self.as_(self.nurse).get(UNREAD).json()["unread"], 0)

    def test_read_never_moves_backwards(self):
        t = self.direct(self.doctor, self.nurse)
        a = self.send(self.doctor, t, "one").json()["id"]
        b = self.send(self.doctor, t, "two").json()["id"]
        self.as_(self.nurse).post(THREADS + f"{t}/read/", {"upto": b}, format="json")
        self.as_(self.nurse).post(THREADS + f"{t}/read/", {"upto": a}, format="json")
        self.assertEqual(ThreadMember.objects.get(thread_id=t, user=self.nurse).last_read_message_id, b)
        self.assertEqual(self.as_(self.nurse).post(THREADS + f"{t}/read/", {"upto": "x"}, format="json").status_code, 400)

    def test_system_and_retracted_messages_do_not_count(self):
        t = self.group(self.doctor, [self.nurse])
        self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": self.registrar.pk}, format="json")  # a system message
        m = self.send(self.doctor, t, "oops").json()["id"]
        self.as_(self.doctor).post(API + f"messages/{m}/retract/", {}, format="json")
        self.assertEqual(self.as_(self.nurse).get(UNREAD).json()["unread"], 0)

    def test_the_sender_has_read_up_to_their_own_message(self):
        t = self.direct(self.doctor, self.nurse)
        m = self.send(self.doctor, t, "hi").json()["id"]
        self.assertEqual(ThreadMember.objects.get(thread_id=t, user=self.doctor).last_read_message_id, m)

    def test_each_person_has_their_own_read_position_in_a_group(self):
        t = self.group(self.doctor, [self.nurse, self.registrar])
        self.send(self.doctor, t, "all hands")
        self.as_(self.nurse).post(THREADS + f"{t}/read/", {}, format="json")
        self.assertEqual(self.as_(self.nurse).get(UNREAD).json()["unread"], 0)
        self.assertEqual(self.as_(self.registrar).get(UNREAD).json()["unread"], 1)
        marks = {m["id"]: m["last_read"] for m in self.as_(self.doctor).get(THREADS + f"{t}/").json()["members"]}
        self.assertGreater(marks[self.nurse.pk], marks[self.registrar.pk])


class RetractTests(MsgBase):
    def test_retract_hides_text_and_pictures_but_keeps_them(self):
        t = self.direct(self.doctor, self.nurse)
        r = self.as_(self.doctor).post(msgs(t), {"body": "wrong patient", "images": [upload(photo(200, 200, noise=False))]}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        mid, att = r.json()["id"], r.json()["attachments"][0]["id"]
        out = self.as_(self.doctor).post(API + f"messages/{mid}/retract/", {"reason": "wrong chart"}, format="json")
        self.assertEqual(out.status_code, 200)
        self.assertTrue(out.json()["retracted"])
        self.assertIsNone(out.json()["body"])
        self.assertEqual(out.json()["attachments"], [])
        seen = self.as_(self.nurse).get(msgs(t)).json()["messages"][0]
        self.assertIsNone(seen["body"])
        self.assertEqual(self.as_(self.nurse).get(API + f"attachments/{att}/").status_code, 404)
        self.assertEqual(SecureMessage.objects.get(pk=mid).body, "wrong patient")  # still on file
        self.assertTrue(MessageAttachment.objects.filter(pk=att).exists())

    def test_only_the_sender_can_retract(self):
        t = self.direct(self.doctor, self.nurse)
        mid = self.send(self.doctor, t, "mine").json()["id"]
        self.assertEqual(self.as_(self.nurse).post(API + f"messages/{mid}/retract/", {}, format="json").status_code, 403)
        self.assertEqual(self.as_(self.nurse2).post(API + f"messages/{mid}/retract/", {}, format="json").status_code, 404)

    def test_system_messages_cannot_be_retracted_and_retract_is_idempotent(self):
        t = self.group(self.doctor, [self.nurse])
        self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": self.registrar.pk}, format="json")
        system = SecureMessage.objects.filter(thread_id=t, kind="system").first()
        self.assertEqual(self.as_(self.doctor).post(API + f"messages/{system.pk}/retract/", {}, format="json").status_code, 403)
        mid = self.send(self.doctor, t, "x").json()["id"]
        self.as_(self.doctor).post(API + f"messages/{mid}/retract/", {}, format="json")
        self.as_(self.doctor).post(API + f"messages/{mid}/retract/", {}, format="json")
        self.assertEqual(AuditEvent.objects.filter(action="retract", message_id=mid).count(), 1)


class MemberTests(MsgBase):
    def test_add_and_the_person_sees_history(self):
        t = self.group(self.doctor, [self.nurse])
        self.send(self.doctor, t, "before you joined")
        r = self.as_(self.nurse).post(THREADS + f"{t}/members/", {"user": self.registrar.pk}, format="json")
        self.assertEqual(r.status_code, 200)
        got = self.as_(self.registrar).get(msgs(t)).json()["messages"]
        self.assertIn("before you joined", [m["body"] for m in got])
        self.assertTrue(any(m["kind"] == "system" and "added" in m["body"] for m in got))

    def test_direct_conversations_take_no_one_else(self):
        t = self.direct(self.doctor, self.nurse)
        r = self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": self.registrar.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_only_valid_colleagues_can_be_added(self):
        t = self.group(self.doctor, [self.nurse])
        for target in (self.outsider, self.patient_user, self.roster):
            self.assertEqual(self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": target.pk}, format="json").status_code, 400)
        UserRightOverride.objects.create(user=self.registrar, right_code="secure_messaging.use", is_granted=False)
        self.assertEqual(self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": self.registrar.pk}, format="json").status_code, 400)

    def test_leave_stops_access(self):
        t = self.group(self.doctor, [self.nurse])
        self.assertEqual(self.as_(self.nurse).delete(THREADS + f"{t}/members/{self.nurse.pk}/").status_code, 200)
        self.assertEqual(self.as_(self.nurse).get(msgs(t)).status_code, 404)
        self.assertEqual(self.send(self.nurse, t).status_code, 404)
        self.send(self.doctor, t, "after you left")
        self.assertEqual(self.as_(self.nurse).get(UNREAD).json()["unread"], 0)

    def test_rejoining_restores_access(self):
        t = self.group(self.doctor, [self.nurse])
        self.as_(self.nurse).delete(THREADS + f"{t}/members/{self.nurse.pk}/")
        self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": self.nurse.pk}, format="json")
        self.assertEqual(self.as_(self.nurse).get(msgs(t)).status_code, 200)

    def test_only_owners_and_admins_remove_others(self):
        t = self.group(self.doctor, [self.nurse, self.registrar])
        self.assertEqual(self.as_(self.nurse).delete(THREADS + f"{t}/members/{self.registrar.pk}/").status_code, 403)
        self.assertEqual(self.as_(self.doctor).delete(THREADS + f"{t}/members/{self.registrar.pk}/").status_code, 200)
        self.assertEqual(self.as_(self.doctor).delete(THREADS + f"{t}/members/{self.registrar.pk}/").status_code, 404)

    def test_cannot_leave_a_direct_conversation(self):
        t = self.direct(self.doctor, self.nurse)
        self.assertEqual(self.as_(self.nurse).delete(THREADS + f"{t}/members/{self.nurse.pk}/").status_code, 400)

    def test_group_size_limit(self):
        t = self.group(self.doctor, [self.nurse])
        extras = [make_user(f"extra{i}", "nurse", self.org) for i in range(50)]
        added = 0
        for u in extras:
            r = self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": u.pk}, format="json")
            added += r.status_code == 200
        self.assertEqual(added, 48)  # 2 already + 48 = 50
        self.assertEqual(self.as_(self.doctor).post(THREADS + f"{t}/members/", {"user": self.registrar.pk}, format="json").status_code, 400)


class PictureTests(MsgBase):
    def setUp(self):
        super().setUp()
        self.t = self.direct(self.doctor, self.nurse)

    def send_pictures(self, *uploads, body="see attached", user=None):
        return self.as_(user or self.doctor).post(msgs(self.t), {"body": body, "images": list(uploads)}, format="multipart")

    def test_a_large_photo_is_shrunk_to_a_megabyte_or_less(self):
        raw = photo(3000, 2000)
        self.assertGreater(len(raw), 3_000_000)
        r = self.send_pictures(upload(raw))
        self.assertEqual(r.status_code, 201, r.content)
        a = r.json()["attachments"][0]
        stored = MessageAttachment.objects.get(pk=a["id"])
        self.assertLessEqual(len(bytes(stored.data)), 1_000_000)
        self.assertEqual(a["size"], len(bytes(stored.data)))
        img = Image.open(io.BytesIO(bytes(stored.data)))
        self.assertEqual(img.format, "JPEG")
        self.assertLessEqual(max(img.size), 2000)
        self.assertEqual((img.width, img.height), (a["width"], a["height"]))
        self.assertLess(len(bytes(stored.thumb)), len(bytes(stored.data)))

    def test_small_photos_are_kept_at_full_size(self):
        r = self.send_pictures(upload(photo(300, 200, noise=False)))
        a = r.json()["attachments"][0]
        self.assertEqual((a["width"], a["height"]), (300, 200))

    def test_location_and_camera_data_is_removed_and_orientation_applied(self):
        r = self.send_pictures(upload(photo(400, 200, noise=False, exif=True)))
        stored = MessageAttachment.objects.get(pk=r.json()["attachments"][0]["id"])
        img = Image.open(io.BytesIO(bytes(stored.data)))
        self.assertEqual(len(img.getexif()), 0)
        self.assertEqual(img.size, (200, 400))  # turned upright

    def test_png_with_transparency_and_webp_and_gif_are_accepted(self):
        png = photo(120, 90, fmt="PNG", noise=False, mode="RGBA")
        webp = photo(120, 90, fmt="WEBP", noise=False)
        gif = photo(120, 90, fmt="GIF", noise=False)
        r = self.send_pictures(upload(png, "a.png", "image/png"), upload(webp, "b.webp", "image/webp"), upload(gif, "c.gif", "image/gif"))
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()["attachments"]), 3)
        for a in r.json()["attachments"]:
            self.assertEqual(Image.open(io.BytesIO(bytes(MessageAttachment.objects.get(pk=a["id"]).data))).format, "JPEG")

    def test_a_picture_alone_is_a_message(self):
        r = self.send_pictures(upload(photo(100, 100, noise=False)), body="")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["body"], "")
        row = self.as_(self.nurse).get(THREADS).json()["threads"][0]
        self.assertEqual(row["last_message"]["preview"], "Photo")
        self.assertTrue(row["last_message"]["has_images"])

    def test_things_that_are_not_pictures_are_refused(self):
        for raw, name in ((b"not an image at all", "x.jpg"), (b"%PDF-1.4 fake", "x.pdf"), (b"", "empty.jpg")):
            r = self.send_pictures(upload(raw, name))
            self.assertEqual(r.status_code, 400, name)
        self.assertEqual(SecureMessage.objects.filter(thread_id=self.t).count(), 0)  # nothing half-saved

    def test_a_truncated_file_is_refused(self):
        raw = photo(400, 300)
        self.assertEqual(self.send_pictures(upload(raw[: len(raw) // 2])).status_code, 400)

    def test_an_oversized_upload_is_refused(self):
        r = self.send_pictures(upload(b"0" * (15 * 1024 * 1024 + 1)))
        self.assertEqual(r.status_code, 400)
        self.assertIn("too large", r.json()["detail"])

    def test_at_most_four_pictures(self):
        one = photo(60, 60, noise=False)
        self.assertEqual(self.send_pictures(*[upload(one) for _ in range(5)]).status_code, 400)
        self.assertEqual(self.send_pictures(*[upload(one) for _ in range(4)]).status_code, 201)

    def test_members_can_fetch_and_others_cannot(self):
        r = self.send_pictures(upload(photo(800, 600)))
        att = r.json()["attachments"][0]["id"]
        full = self.as_(self.nurse).get(API + f"attachments/{att}/")
        self.assertEqual(full.status_code, 200)
        self.assertEqual(full["Content-Type"], "image/jpeg")
        self.assertIn("no-store", full["Cache-Control"])
        self.assertIn("private", full["Cache-Control"])
        self.assertEqual(full["X-Content-Type-Options"], "nosniff")
        thumb = self.as_(self.nurse).get(API + f"attachments/{att}/", {"size": "thumb"})
        self.assertLess(len(thumb.content), len(full.content))
        self.assertEqual(self.as_(self.nurse2).get(API + f"attachments/{att}/").status_code, 404)  # same organization, not in it
        self.assertEqual(self.as_(self.outsider).get(API + f"attachments/{att}/").status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(API + f"attachments/{att}/").status_code, 401)

    def test_viewing_a_picture_is_logged_once_in_a_while(self):
        att = self.send_pictures(upload(photo(100, 100, noise=False))).json()["attachments"][0]["id"]
        for _ in range(3):
            self.as_(self.nurse).get(API + f"attachments/{att}/")
        self.as_(self.nurse).get(API + f"attachments/{att}/", {"size": "thumb"})  # thumbnails in a list are not logged
        self.assertEqual(AuditEvent.objects.filter(action="view_image", user=self.nurse).count(), 1)


class AuditTests(MsgBase):
    def test_sends_are_logged_without_the_text(self):
        t = self.direct(self.doctor, self.nurse)
        mid = self.send(self.doctor, t, "Patient Bcs has chest pain", priority="urgent").json()["id"]
        row = AuditEvent.objects.get(action="send", message_id=mid)
        self.assertEqual(row.user, self.doctor)
        self.assertEqual(row.organization, self.org)
        self.assertNotIn("chest", row.detail)
        self.assertIn("urgent", row.detail)

    def test_opening_a_patient_thread_is_logged_but_not_every_poll(self):
        t = self.as_(self.doctor).post(THREADS, {"kind": "patient", "patient": self.patient_user.pk}, format="json").json()["id"]
        first = self.send(self.doctor, t, "hi").json()["id"]
        for _ in range(3):
            self.as_(self.nurse2).get(msgs(t))  # not a member: nothing logged
        self.as_(self.doctor).get(msgs(t))
        self.as_(self.doctor).get(msgs(t))
        self.as_(self.doctor).get(msgs(t), {"after": first})  # polling for new messages is not an "opening"
        opened = AuditEvent.objects.filter(action="open_patient_thread", user=self.doctor)
        self.assertEqual(opened.count(), 1)
        self.assertEqual(opened.first().patient, self.patient_user)

    def test_direct_conversations_are_not_logged_as_patient_openings(self):
        t = self.direct(self.doctor, self.nurse)
        self.as_(self.doctor).get(msgs(t))
        self.assertFalse(AuditEvent.objects.filter(action="open_patient_thread").exists())

    def test_only_those_with_the_audit_right_can_read_the_log(self):
        for user in (self.doctor, self.nurse, self.registrar, self.receptionist):
            self.assertEqual(self.as_(user).get(API + "audit/").status_code, 403, user.role)
        self.assertEqual(self.as_(self.admin).get(API + "audit/").status_code, 200)

    def test_filters_and_organization_boundary(self):
        t = self.direct(self.doctor, self.nurse)
        self.send(self.doctor, t, "a")
        other = self.direct(self.outsider, make_user("out2", "nurse", self.other_org))
        self.send(self.outsider, other, "b")
        events = self.as_(self.admin).get(API + "audit/", {"action": "send"}).json()["events"]
        self.assertEqual([e["user_id"] for e in events], [self.doctor.pk])  # nothing from the other organization
        mine = self.as_(self.admin).get(API + "audit/", {"user": self.doctor.pk}).json()["events"]
        self.assertTrue(all(e["user_id"] == self.doctor.pk for e in mine))
        self.assertEqual(self.as_(self.admin).get(API + "audit/", {"user": "x"}).status_code, 400)
        self.assertEqual(self.as_(self.admin).get(API + "audit/", {"since": "garbage"}).status_code, 400)
        recent = (timezone.now() + timezone.timedelta(days=1)).isoformat()
        self.assertEqual(self.as_(self.admin).get(API + "audit/", {"since": recent}).json()["events"], [])

    def test_log_is_newest_first_in_pages_and_can_end_at_a_time(self):
        t = self.direct(self.doctor, self.nurse)
        for i in range(105):
            AuditEvent.objects.create(organization=self.org, user=self.doctor, action="send", thread_id=t, message_id=i)
        page1 = self.as_(self.admin).get(API + "audit/").json()
        self.assertEqual(len(page1["events"]), 100)
        self.assertTrue(page1["has_more"])
        ids = [e["id"] for e in page1["events"]]
        self.assertEqual(ids, sorted(ids, reverse=True))
        page2 = self.as_(self.admin).get(API + "audit/", {"before": ids[-1]}).json()
        self.assertFalse(page2["has_more"])
        self.assertTrue(page2["events"])
        self.assertTrue(all(e["id"] < ids[-1] for e in page2["events"]))
        self.assertEqual(self.as_(self.admin).get(API + "audit/", {"before": "x"}).status_code, 400)
        self.assertEqual(self.as_(self.admin).get(API + "audit/", {"until": "garbage"}).status_code, 400)
        old = (timezone.now() - timezone.timedelta(days=1)).isoformat()
        self.assertEqual(self.as_(self.admin).get(API + "audit/", {"until": old}).json()["events"], [])

    def test_transcript_includes_retracted_text_and_is_itself_logged(self):
        t = self.direct(self.doctor, self.nurse)
        mid = self.send(self.doctor, t, "wrong chart note").json()["id"]
        self.as_(self.doctor).post(API + f"messages/{mid}/retract/", {"reason": "mistake"}, format="json")
        r = self.as_(self.admin).get(API + f"audit/threads/{t}/")
        self.assertEqual(r.status_code, 200)
        m = r.json()["messages"][0]
        self.assertEqual(m["body"], "wrong chart note")
        self.assertTrue(m["retracted"])
        self.assertEqual(m["retract_reason"], "mistake")
        self.assertEqual({x["id"] for x in r.json()["thread"]["members"]}, {self.doctor.pk, self.nurse.pk})
        self.assertTrue(AuditEvent.objects.filter(action="audit_read_transcript", user=self.admin, thread_id=t).exists())

    def test_transcripts_stop_at_the_organization_and_the_right(self):
        t = self.direct(self.doctor, self.nurse)
        self.assertEqual(self.as_(self.outsider_admin).get(API + f"audit/threads/{t}/").status_code, 404)
        self.assertEqual(self.as_(self.doctor).get(API + f"audit/threads/{t}/").status_code, 403)


class LiveNudgeTests(MsgBase):
    def test_recipients_are_nudged_with_ids_only(self):
        t = self.group(self.doctor, [self.nurse, self.registrar])
        layer = get_channel_layer()
        async_to_sync(layer.group_add)(f"secure_user_{self.nurse.pk}", "chan-nurse")
        async_to_sync(layer.group_add)(f"secure_user_{self.doctor.pk}", "chan-doctor")
        with self.captureOnCommitCallbacks(execute=True):
            mid = self.send(self.doctor, t, "Patient Bcs, MRN 123, is crashing", priority="urgent").json()["id"]
        event = async_to_sync(layer.receive)("chan-nurse")
        self.assertEqual(event, {"type": "secure.nudge", "thread": t, "message": mid, "urgent": True})
        self.assertNotIn("Bcs", str(event))
        # the sender is not nudged about their own message
        async_to_sync(layer.flush)()

    def test_a_broken_channel_layer_never_blocks_sending(self):
        from unittest import mock

        t = self.direct(self.doctor, self.nurse)
        with mock.patch("channels.layers.get_channel_layer", side_effect=RuntimeError("redis is down")):
            with self.captureOnCommitCallbacks(execute=True):
                r = self.send(self.doctor, t, "still saved")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(SecureMessage.objects.filter(thread_id=t).count(), 1)


class SocketTests(TransactionTestCase):
    """The socket refuses strangers and only passes on nudges."""

    def setUp(self):
        org = Organization.objects.create(name="Sock Org")
        self.doctor = CustomUser.objects.create_user(username="sd", password="pw-12345-xyz", role="doctor", organization=org)
        self.patient = CustomUser.objects.create_user(username="sp", password="pw-12345-xyz", role="patient", organization=org)

    def test_socket_rules(self):
        async def open_socket(user):
            comm = ApplicationCommunicator(
                SecureMessagingConsumer.as_asgi(), {"type": "websocket", "path": "/ws/secure-messages/", "user": user, "headers": [], "subprotocols": []}
            )
            await comm.send_input({"type": "websocket.connect"})
            return comm, await comm.receive_output(2)

        async def read_text(comm):
            out = await comm.receive_output(2)
            self.assertEqual(out["type"], "websocket.send")
            return json.loads(out["text"])

        async def run():
            _, out = await open_socket(AnonymousUser())
            self.assertEqual((out["type"], out.get("code")), ("websocket.close", 4401))

            _, out = await open_socket(self.patient)
            self.assertEqual((out["type"], out.get("code")), ("websocket.close", 4403))

            comm, out = await open_socket(self.doctor)
            self.assertEqual(out["type"], "websocket.accept")
            await comm.send_input({"type": "websocket.receive", "text": json.dumps({"type": "ping"})})
            self.assertEqual(await read_text(comm), {"type": "pong"})
            await comm.send_input({"type": "websocket.receive", "text": "not json"})  # ignored, not fatal
            await get_channel_layer().group_send(f"secure_user_{self.doctor.pk}", {"type": "secure.nudge", "thread": 4, "message": 9, "urgent": False})
            self.assertEqual(await read_text(comm), {"type": "secure_message", "thread": 4, "message": 9, "urgent": False})
            await comm.send_input({"type": "websocket.disconnect", "code": 1000})
            await comm.wait()

        async_to_sync(run)()
