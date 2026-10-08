"""Referral Manager: workflow, permissions, clinic scoping, overdue timers, queues, directory."""

from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient

from . import referrals as rf
from .models import PatientAllergy, Referral, ReferralDestination, ReferralEvent, ReferralSettings
from .test_patient_header import Base, make_user

LIST = "/api/referrals/"
DETAIL = "/api/referrals/{}/"
ACTION = "/api/referrals/{}/action/"
QUEUES = "/api/referrals/queues/"
DESTS = "/api/referral-destinations/"
SETTINGS = "/api/referral-settings/"
META = "/api/referral-meta/"


class RefBase(Base):
    def setUp(self):
        super().setUp()
        self.cardio = ReferralDestination.objects.create(organization=self.org, name="Dr. Heart", specialty="Cardiology", kind="external", npi="1234567893")
        self.coordinator = make_user("coord", "registrar", self.org)
        self.other_doctor = make_user("doc2", "doctor", self.org, first_name="Ann", last_name="Roe")

    def as_(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def body(self, **extra):
        data = {
            "patient": self.patient.pk, "destination": self.cardio.pk, "urgency": "routine",
            "reason": "Chest pain on exertion", "diagnosis_code": "R07.9", "diagnosis_text": "Chest pain, unspecified",
            "clinical_question": "Please evaluate for CAD.",
        }
        data.update(extra)
        return data

    def make(self, user=None, **extra):
        r = self.as_(user or self.doctor).post(LIST, self.body(**extra), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def act(self, ref_id, action, user=None, **data):
        return self.as_(user or self.coordinator).post(ACTION.format(ref_id), {"action": action, **data}, format="json")

    def sent(self, **extra):
        ref = self.make(**extra)
        r = self.act(ref["id"], "sign_send", user=self.doctor)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()


class CreateTests(RefBase):
    def test_doctor_creates_a_draft_for_themselves(self):
        ref = self.make()
        self.assertEqual(ref["status"], "draft")
        self.assertEqual(ref["referring_provider"], self.doctor.pk)
        self.assertEqual(ref["destination_name"], "Dr. Heart")
        self.assertEqual(ref["specialty"], "Cardiology")  # taken from the destination
        self.assertEqual(ref["actions"][:1], ["sign_send"])
        self.assertEqual([e["type"] for e in ref["events"]], ["created"])

    def test_a_nurse_drafts_for_a_doctor_but_must_name_one(self):
        r = self.as_(self.nurse).post(LIST, self.body(), format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("referring physician", r.json()["detail"])
        ref = self.make(user=self.nurse, referring_provider=self.doctor.pk)
        self.assertEqual(ref["referring_provider"], self.doctor.pk)
        self.assertNotIn("sign_send", self.as_(self.nurse).get(DETAIL.format(ref["id"])).json()["actions"])

    def test_the_referring_provider_must_be_a_doctor_here(self):
        r = self.as_(self.nurse).post(LIST, self.body(referring_provider=self.outsider.pk), format="json")
        self.assertEqual(r.status_code, 400)
        r = self.as_(self.nurse).post(LIST, self.body(referring_provider=self.nurse.pk), format="json")
        self.assertEqual(r.status_code, 400)

    def test_destination_from_another_clinic_is_refused(self):
        theirs = ReferralDestination.objects.create(organization=self.other_org, name="Other", specialty="Cardiology")
        r = self.as_(self.doctor).post(LIST, self.body(destination=theirs.pk), format="json")
        self.assertEqual(r.status_code, 400)

    def test_patients_and_other_clinics_are_kept_out(self):
        self.assertEqual(self.as_(self.patient).post(LIST, self.body(), format="json").status_code, 403)
        self.assertEqual(self.as_(self.outsider).post(LIST, self.body(), format="json").status_code, 404)
        self.assertEqual(self.as_(self.patient).get(LIST).status_code, 403)

    def test_urgency_is_checked(self):
        self.assertEqual(self.as_(self.doctor).post(LIST, self.body(urgency="whenever"), format="json").status_code, 400)

    def test_drafts_can_be_edited_and_deleted_but_sent_ones_cannot(self):
        ref = self.make()
        r = self.as_(self.nurse).patch(DETAIL.format(ref["id"]), {"reason": "Updated reason", "urgency": "urgent"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["reason"], "Updated reason")
        self.act(ref["id"], "sign_send", user=self.doctor)
        self.assertEqual(self.as_(self.nurse).patch(DETAIL.format(ref["id"]), {"reason": "x"}, format="json").status_code, 409)
        self.assertEqual(self.as_(self.nurse).delete(DETAIL.format(ref["id"])).status_code, 409)
        draft = self.make()
        self.assertEqual(self.as_(self.nurse).delete(DETAIL.format(draft["id"])).status_code, 204)
        self.assertFalse(Referral.objects.filter(pk=draft["id"]).exists())


class SigningTests(RefBase):
    def test_only_the_referring_physician_or_an_admin_can_sign(self):
        ref = self.make()
        self.assertEqual(self.act(ref["id"], "sign_send", user=self.nurse).status_code, 403)
        self.assertEqual(self.act(ref["id"], "sign_send", user=self.coordinator).status_code, 403)
        self.assertEqual(self.act(ref["id"], "sign_send", user=self.other_doctor).status_code, 403)
        self.assertEqual(Referral.objects.get(pk=ref["id"]).status, "draft")
        r = self.act(ref["id"], "sign_send", user=self.admin)
        self.assertEqual(r.status_code, 200, r.content)

    def test_signing_sends_it_and_starts_the_clock(self):
        ref = self.sent(urgency="urgent")
        self.assertEqual(ref["status"], "sent")
        self.assertEqual(ref["signed_by_name"], "Jeffrey Lee")
        sent = Referral.objects.get(pk=ref["id"])
        self.assertEqual((sent.schedule_due - sent.sent_at).days, 3)  # urgent default
        self.assertEqual([e["type"] for e in ref["events"]], ["created", "signed_sent"])

    def test_a_referral_needs_a_destination_a_specialty_and_a_reason(self):
        ref = self.make(destination="", destination_name="", specialty="", reason="")
        r = self.act(ref["id"], "sign_send", user=self.doctor)
        self.assertEqual(r.status_code, 400)
        for needed in ("who the referral is going to", "the specialty", "the reason for the referral"):
            self.assertIn(needed, r.json()["detail"])

    def test_an_outside_practice_can_be_typed_in_without_the_directory(self):
        ref = self.make(destination="", destination_name="Dr. Walk-in", specialty="Dermatology")
        self.assertEqual(self.act(ref["id"], "sign_send", user=self.doctor).status_code, 200)

    def test_the_allergies_go_out_with_it_as_they_were(self):
        PatientAllergy.objects.create(patient=self.patient, substance="Penicillin", reaction="Rash", severity="severe")
        PatientAllergy.objects.create(patient=self.patient, substance="Latex", status="inactive")
        ref = self.sent()
        snap = ref["clinical_snapshot"]
        self.assertEqual([a["substance"] for a in snap["allergies"]], ["Penicillin"])
        PatientAllergy.objects.create(patient=self.patient, substance="Peanuts")
        again = self.as_(self.doctor).get(DETAIL.format(ref["id"])).json()["clinical_snapshot"]
        self.assertEqual([a["substance"] for a in again["allergies"]], ["Penicillin"])  # frozen

    def test_the_destination_name_is_frozen_when_sent(self):
        ref = self.sent()
        self.cardio.name = "Renamed"
        self.cardio.save()
        self.assertEqual(self.as_(self.doctor).get(DETAIL.format(ref["id"])).json()["destination_name"], "Dr. Heart")

    def test_cannot_sign_twice(self):
        ref = self.sent()
        self.assertEqual(self.act(ref["id"], "sign_send", user=self.doctor).status_code, 409)


class LifecycleTests(RefBase):
    def test_the_whole_loop(self):
        ref = self.sent()
        when = (timezone.now() + timedelta(days=5)).replace(microsecond=0)
        r = self.act(ref["id"], "schedule", scheduled_for=when.isoformat(), appointment_location="Heart Clinic, Suite 4")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], "scheduled")
        self.assertEqual(r.json()["appointment_location"], "Heart Clinic, Suite 4")
        r = self.act(ref["id"], "seen")
        self.assertEqual(r.json()["status"], "seen")
        r = self.act(ref["id"], "report", report_text="Normal stress test. Follow up in 1 year.")
        self.assertEqual(r.json()["status"], "report_received")
        self.assertEqual(r.json()["report_text"], "Normal stress test. Follow up in 1 year.")
        r = self.act(ref["id"], "close", note="Reviewed with patient")
        self.assertEqual(r.json()["status"], "closed")
        self.assertEqual(
            [e["type"] for e in r.json()["events"]],
            ["created", "signed_sent", "scheduled", "seen", "report_received", "closed"],
        )
        self.assertEqual(r.json()["actions"], ["note"])  # nothing left to do but add a note

    def test_rescheduling_is_recorded(self):
        ref = self.sent()
        t1 = (timezone.now() + timedelta(days=3)).isoformat()
        t2 = (timezone.now() + timedelta(days=9)).isoformat()
        self.act(ref["id"], "schedule", scheduled_for=t1)
        r = self.act(ref["id"], "schedule", scheduled_for=t2)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([e["type"] for e in r.json()["events"]][-2:], ["scheduled", "rescheduled"])

    def test_scheduling_needs_a_real_date(self):
        ref = self.sent()
        self.assertEqual(self.act(ref["id"], "schedule").status_code, 400)
        self.assertEqual(self.act(ref["id"], "schedule", scheduled_for="next tuesday-ish").status_code, 400)

    def test_cannot_skip_ahead_or_go_backwards(self):
        ref = self.make()
        for action in ("schedule", "seen", "report", "close", "decline", "needs_info"):
            kw = {"scheduled_for": timezone.now().isoformat(), "report_text": "x", "note": "x"}
            self.assertEqual(self.act(ref["id"], action, **kw).status_code, 409, action)
        sent = self.sent()
        self.assertEqual(self.act(sent["id"], "close", note="x").status_code, 409)  # nothing back from the specialist yet
        self.assertEqual(self.act(sent["id"], "sign_send", user=self.doctor).status_code, 409)

    def test_a_report_can_arrive_without_the_middle_steps(self):
        ref = self.sent()
        r = self.act(ref["id"], "report", report_text="Seen last week, all fine.")
        self.assertEqual(r.json()["status"], "report_received")
        self.assertIsNotNone(Referral.objects.get(pk=ref["id"]).seen_at)

    def test_text_is_required_where_it_matters(self):
        ref = self.sent()
        for action in ("needs_info", "decline", "cancel", "report"):
            r = self.act(ref["id"], action)
            self.assertEqual(r.status_code, 400, action)

    def test_needs_info_then_send_again(self):
        ref = self.sent()
        r = self.act(ref["id"], "needs_info", note="Please send the last ECG")
        self.assertEqual(r.json()["status"], "needs_info")
        self.assertEqual(r.json()["status_note"], "Please send the last ECG")
        r = self.act(ref["id"], "resend", note="ECG attached")
        self.assertEqual(r.json()["status"], "sent")
        self.assertEqual(r.json()["status_note"], "")

    def test_declined_cancelled_and_expired_are_endings(self):
        a = self.sent()
        self.assertEqual(self.act(a["id"], "decline", note="Not accepting new patients").json()["status"], "declined")
        self.assertEqual(self.act(a["id"], "close", note="Choosing another specialist").json()["status"], "closed")
        b = self.sent()
        self.assertEqual(self.act(b["id"], "cancel", note="Patient moved away").json()["status"], "cancelled")
        self.assertEqual(self.act(b["id"], "schedule", scheduled_for=timezone.now().isoformat()).status_code, 409)
        c = self.sent()
        self.assertEqual(self.act(c["id"], "expire", note="Never scheduled").json()["status"], "expired")

    def test_a_draft_can_be_cancelled(self):
        ref = self.make()
        self.assertEqual(self.act(ref["id"], "cancel", note="Entered by mistake").json()["status"], "cancelled")

    def test_cannot_be_seen_in_the_future(self):
        ref = self.sent()
        r = self.act(ref["id"], "seen", seen_at=(timezone.now() + timedelta(days=2)).isoformat())
        self.assertEqual(r.status_code, 400)

    def test_notes_and_assignment_do_not_change_the_status(self):
        ref = self.sent()
        r = self.act(ref["id"], "note", note="Called the office, left a message")
        self.assertEqual(r.json()["status"], "sent")
        self.assertEqual(self.act(ref["id"], "note").status_code, 400)
        r = self.act(ref["id"], "assign", assigned_to=self.coordinator.pk)
        self.assertEqual(r.json()["assigned_to"], self.coordinator.pk)
        self.assertEqual(r.json()["assigned_to_name"], "coord")
        self.assertEqual(self.act(ref["id"], "assign", assigned_to=self.outsider.pk).status_code, 400)
        self.assertEqual(self.act(ref["id"], "assign", assigned_to=self.patient.pk).status_code, 400)
        self.assertIsNone(self.act(ref["id"], "assign", assigned_to="").json()["assigned_to"])

    def test_the_history_records_who_did_what(self):
        ref = self.sent()
        self.act(ref["id"], "needs_info", user=self.nurse, note="Need labs")
        events = list(ReferralEvent.objects.filter(referral_id=ref["id"]).values_list("event_type", "user__username", "from_status", "to_status"))
        self.assertEqual(events[-1], ("needs_info", "nurse", "sent", "needs_info"))

    def test_other_clinics_cannot_touch_it(self):
        ref = self.sent()
        self.assertEqual(self.act(ref["id"], "note", user=self.outsider, note="hi").status_code, 404)
        self.assertEqual(self.as_(self.outsider).get(DETAIL.format(ref["id"])).status_code, 404)
        self.assertEqual(self.as_(self.outsider).get(LIST).json()["count"], 0)

    def test_patients_cannot_act(self):
        ref = self.sent()
        self.assertEqual(self.act(ref["id"], "note", user=self.patient, note="hi").status_code, 403)

    def test_unknown_actions_are_refused(self):
        ref = self.sent()
        self.assertEqual(self.act(ref["id"], "explode").status_code, 400)


class OverdueTests(RefBase):
    def test_not_scheduled_in_time(self):
        ref = self.sent(urgency="emergent")
        self.assertFalse(self.as_(self.nurse).get(DETAIL.format(ref["id"])).json()["overdue"])
        Referral.objects.filter(pk=ref["id"]).update(schedule_due=timezone.now() - timedelta(hours=1))
        d = self.as_(self.nurse).get(DETAIL.format(ref["id"])).json()
        self.assertTrue(d["overdue"])
        self.assertEqual(d["overdue_reason"], "Not scheduled in time")
        self.assertEqual(self.as_(self.nurse).get(LIST, {"queue": "overdue"}).json()["count"], 1)

    def test_scheduling_stops_that_clock_and_starts_the_report_clock(self):
        ref = self.sent()
        self.act(ref["id"], "schedule", scheduled_for=(timezone.now() + timedelta(days=2)).isoformat())
        row = Referral.objects.get(pk=ref["id"])
        self.assertIsNone(row.schedule_due)
        self.assertAlmostEqual((row.report_due - row.scheduled_for).days, 14, delta=0)
        Referral.objects.filter(pk=ref["id"]).update(report_due=timezone.now() - timedelta(days=1))
        self.assertEqual(self.as_(self.nurse).get(DETAIL.format(ref["id"])).json()["overdue_reason"], "Report overdue")

    def test_a_received_report_is_never_overdue(self):
        ref = self.sent()
        self.act(ref["id"], "report", report_text="Done")
        self.assertFalse(self.as_(self.nurse).get(DETAIL.format(ref["id"])).json()["overdue"])
        self.assertEqual(self.as_(self.nurse).get(LIST, {"queue": "overdue"}).json()["count"], 0)

    def test_clinic_timers_are_used(self):
        ReferralSettings.objects.create(organization=self.org, schedule_days={"routine": 5}, report_days=30)
        ref = self.sent()
        row = Referral.objects.get(pk=ref["id"])
        self.assertEqual((row.schedule_due - row.sent_at).days, 5)
        self.act(ref["id"], "seen")
        row.refresh_from_db()
        self.assertEqual((row.report_due - row.seen_at).days, 30)

    def test_defaults_when_a_clinic_has_no_settings(self):
        days, report = rf.settings_for(self.org)
        self.assertEqual(days, {"routine": 14, "urgent": 3, "emergent": 1})
        self.assertEqual(report, 14)


class QueueTests(RefBase):
    def setUp(self):
        super().setUp()
        self.draft = self.make()
        self.to_schedule = self.sent()
        self.scheduled = self.sent()
        self.act(self.scheduled["id"], "schedule", scheduled_for=(timezone.now() + timedelta(days=4)).isoformat())
        self.passed = self.sent()
        self.act(self.passed["id"], "schedule", scheduled_for=(timezone.now() + timedelta(days=1)).isoformat())
        Referral.objects.filter(pk=self.passed["id"]).update(scheduled_for=timezone.now() - timedelta(days=1))
        self.seen = self.sent()
        self.act(self.seen["id"], "seen")
        self.review = self.sent()
        self.act(self.review["id"], "report", report_text="ok")
        self.done = self.sent()
        self.act(self.done["id"], "report", report_text="ok")
        self.act(self.done["id"], "close", note="done")

    def ids(self, queue, user=None):
        r = self.as_(user or self.nurse).get(LIST, {"queue": queue})
        self.assertEqual(r.status_code, 200)
        return {x["id"] for x in r.json()["results"]}

    def test_each_queue(self):
        self.assertEqual(self.ids("draft"), {self.draft["id"]})
        self.assertEqual(self.ids("to_schedule"), {self.to_schedule["id"]})
        self.assertEqual(self.ids("scheduled"), {self.scheduled["id"], self.passed["id"]})
        self.assertEqual(self.ids("awaiting_report"), {self.seen["id"], self.passed["id"]})
        self.assertEqual(self.ids("to_review"), {self.review["id"]})
        self.assertEqual(self.ids("closed"), {self.done["id"]})
        self.assertEqual(len(self.ids("all")), 7)

    def test_needs_action_is_what_a_person_has_to_do_next(self):
        self.assertEqual(
            self.ids("needs_action"),
            {self.to_schedule["id"], self.passed["id"], self.seen["id"], self.review["id"]},
        )

    def test_counts_match_the_lists(self):
        counts = self.as_(self.nurse).get(QUEUES).json()["counts"]
        for queue in ("draft", "to_schedule", "scheduled", "awaiting_report", "to_review", "closed", "needs_action", "all"):
            self.assertEqual(counts[queue], len(self.ids(queue)), queue)
        self.assertEqual(counts["mine"], 0)
        self.act(self.to_schedule["id"], "assign", assigned_to=self.nurse.pk)
        self.assertEqual(self.as_(self.nurse).get(QUEUES).json()["counts"]["mine"], 1)
        self.assertEqual({x["id"] for x in self.as_(self.nurse).get(LIST, {"assigned_to": "me"}).json()["results"]}, {self.to_schedule["id"]})

    def test_filters(self):
        self.assertEqual(self.as_(self.nurse).get(LIST, {"patient": self.patient.pk}).json()["count"], 7)
        self.assertEqual(self.as_(self.nurse).get(LIST, {"patient": self.other_patient.pk}).json()["count"], 0)
        self.assertEqual(self.as_(self.nurse).get(LIST, {"status": "draft"}).json()["count"], 1)
        self.assertEqual(self.as_(self.nurse).get(LIST, {"q": "Bcs"}).json()["count"], 7)
        self.assertEqual(self.as_(self.nurse).get(LIST, {"q": "nobody-here"}).json()["count"], 0)
        self.assertEqual(self.as_(self.nurse).get(LIST, {"specialty": "cardio"}).json()["count"], 7)
        self.assertEqual(self.as_(self.nurse).get(LIST, {"destination": self.cardio.pk}).json()["count"], 7)

    def test_paging_and_order(self):
        r = self.as_(self.nurse).get(LIST, {"page_size": 3, "page": 2}).json()
        self.assertEqual((r["count"], len(r["results"]), r["page"]), (7, 3, 2))
        newest = self.as_(self.nurse).get(LIST).json()["results"][0]["id"]
        oldest = self.as_(self.nurse).get(LIST, {"ordering": "oldest"}).json()["results"][0]["id"]
        self.assertEqual(oldest, self.draft["id"])
        self.assertEqual(newest, self.done["id"])

    def test_urgent_first_ordering(self):
        urgent = self.make(urgency="emergent")
        first = self.as_(self.nurse).get(LIST, {"ordering": "urgency"}).json()["results"][0]["id"]
        self.assertEqual(first, urgent["id"])

    def test_queue_counts_stay_inside_the_clinic(self):
        counts = self.as_(self.outsider).get(QUEUES).json()["counts"]
        self.assertEqual(counts["all"], 0)


class DirectoryTests(RefBase):
    def test_any_staff_can_read_and_add_an_outside_practice(self):
        self.assertEqual([d["name"] for d in self.as_(self.nurse).get(DESTS).json()], ["Dr. Heart"])
        r = self.as_(self.nurse).post(DESTS, {"name": "Skin Center", "specialty": "Dermatology", "phone": "555-0101", "npi": "1234567893"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["kind"], "external")
        self.assertEqual(ReferralDestination.objects.get(pk=r.json()["id"]).organization, self.org)

    def test_inside_providers_and_edits_are_for_administrators(self):
        r = self.as_(self.nurse).post(DESTS, {"name": "Our Cardiology", "kind": "internal", "provider": self.doctor.pk}, format="json")
        self.assertEqual(r.status_code, 403)
        r = self.as_(self.admin).post(DESTS, {"name": "Our Cardiology", "specialty": "Cardiology", "kind": "internal", "provider": self.doctor.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.as_(self.nurse).patch(DESTS + f"{self.cardio.pk}/", {"phone": "1"}, format="json").status_code, 403)
        r = self.as_(self.admin).patch(DESTS + f"{self.cardio.pk}/", {"phone": "555-0199"}, format="json")
        self.assertEqual(r.json()["phone"], "555-0199")

    def test_checks(self):
        admin = self.as_(self.admin)
        self.assertEqual(admin.post(DESTS, {"specialty": "x"}, format="json").status_code, 400)
        self.assertEqual(admin.post(DESTS, {"name": "A", "npi": "12"}, format="json").status_code, 400)
        self.assertEqual(admin.post(DESTS, {"name": "Dr. Heart", "specialty": "Cardiology"}, format="json").status_code, 400)  # duplicate
        self.assertEqual(admin.post(DESTS, {"name": "B", "kind": "moon"}, format="json").status_code, 400)
        self.assertEqual(admin.post(DESTS, {"name": "B", "kind": "internal", "provider": self.outsider.pk}, format="json").status_code, 400)

    def test_deleting_a_used_destination_just_hides_it(self):
        self.sent()
        r = self.as_(self.admin).delete(DESTS + f"{self.cardio.pk}/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["deactivated"])
        self.assertEqual(self.as_(self.nurse).get(DESTS).json(), [])
        self.assertEqual(len(self.as_(self.nurse).get(DESTS, {"active": "0"}).json()), 1)
        unused = ReferralDestination.objects.create(organization=self.org, name="Unused")
        self.assertEqual(self.as_(self.admin).delete(DESTS + f"{unused.pk}/").status_code, 204)

    def test_each_clinic_has_its_own_directory(self):
        self.assertEqual(self.as_(self.outsider).get(DESTS).json(), [])
        self.assertEqual(self.as_(self.outsider).get(DESTS + f"{self.cardio.pk}/").status_code, 404)

    def test_search_and_filters(self):
        ReferralDestination.objects.create(organization=self.org, name="Skin Center", specialty="Dermatology", kind="internal")
        self.assertEqual(len(self.as_(self.nurse).get(DESTS, {"q": "derm"}).json()), 1)
        self.assertEqual(len(self.as_(self.nurse).get(DESTS, {"kind": "internal"}).json()), 1)
        self.assertEqual(len(self.as_(self.nurse).get(DESTS, {"specialty": "cardio"}).json()), 1)

    def test_a_system_admin_picks_the_clinic(self):
        sysadmin = self.as_(self.sysadmin)
        self.assertEqual(sysadmin.get(DESTS).status_code, 400)
        self.assertEqual(len(sysadmin.get(DESTS, {"org": self.org.pk}).json()), 1)
        r = sysadmin.post(DESTS, {"name": "New", "organization": self.other_org.pk}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(ReferralDestination.objects.get(pk=r.json()["id"]).organization, self.other_org)


class SettingsAndMetaTests(RefBase):
    def test_settings_default_and_update(self):
        got = self.as_(self.nurse).get(SETTINGS).json()
        self.assertEqual(got["schedule_days"], {"routine": 14, "urgent": 3, "emergent": 1})
        self.assertFalse(got["can_edit"])
        self.assertEqual(self.as_(self.nurse).put(SETTINGS, {"report_days": 5}, format="json").status_code, 403)
        r = self.as_(self.admin).put(SETTINGS, {"schedule_days": {"urgent": 2}, "report_days": 21}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["schedule_days"], {"routine": 14, "urgent": 2, "emergent": 1})
        self.assertEqual(r.json()["report_days"], 21)
        self.assertEqual(self.as_(self.nurse).get(SETTINGS).json()["report_days"], 21)

    def test_settings_checks(self):
        admin = self.as_(self.admin)
        for bad in ({"schedule_days": {"urgent": 0}}, {"schedule_days": {"urgent": "3"}}, {"schedule_days": {"soon": 3}},
                    {"schedule_days": [1]}, {"report_days": 400}, {"report_days": True}):
            self.assertEqual(admin.put(SETTINGS, bad, format="json").status_code, 400, bad)

    def test_settings_are_per_clinic(self):
        self.as_(self.admin).put(SETTINGS, {"report_days": 21}, format="json")
        self.assertEqual(self.as_(self.outsider).get(SETTINGS).json()["report_days"], 14)

    def test_a_system_admin_acting_for_a_clinic_with_the_facility_header(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.sysadmin).access_token}", HTTP_X_FACILITY_ID=str(self.other_org.pk))
        self.assertEqual(c.put(SETTINGS, {"report_days": 9}, format="json").status_code, 200)
        self.assertEqual(ReferralSettings.objects.get(organization=self.other_org).report_days, 9)
        self.assertFalse(ReferralSettings.objects.filter(organization=self.org).exists())

    def test_meta_lists_what_the_screens_need(self):
        meta = self.as_(self.nurse).get(META).json()
        self.assertIn("Cardiology", meta["specialties"])
        self.assertEqual([u["value"] for u in meta["urgencies"]], ["routine", "urgent", "emergent"])
        self.assertIn("mine", [q["value"] for q in meta["queues"]])
        self.assertIn(self.doctor.pk, [d["id"] for d in meta["doctors"]])
        self.assertNotIn(self.outsider.pk, [s["id"] for s in meta["staff"]])
        self.assertNotIn(self.patient.pk, [s["id"] for s in meta["staff"]])
        self.assertFalse(meta["can_manage"])
        self.assertTrue(self.as_(self.admin).get(META).json()["can_manage"])
        self.assertEqual(self.as_(self.patient).get(META).status_code, 403)


class DetailTests(RefBase):
    def test_detail_has_the_history_and_the_patient_dob(self):
        ref = self.sent()
        d = self.as_(self.nurse).get(DETAIL.format(ref["id"])).json()
        self.assertEqual(d["patient_name"], "Test Bcs")
        self.assertTrue(d["patient_dob"])
        self.assertEqual(d["destination_detail"]["npi"], "1234567893")
        self.assertEqual(d["events"][0]["type"], "created")
        self.assertEqual(d["events"][0]["user"], "Jeffrey Lee")

    def test_the_actions_offered_follow_the_status_and_the_person(self):
        ref = self.make()
        self.assertEqual(self.as_(self.doctor).get(DETAIL.format(ref["id"])).json()["actions"], ["sign_send", "cancel", "assign", "note"])
        self.assertEqual(self.as_(self.nurse).get(DETAIL.format(ref["id"])).json()["actions"], ["cancel", "assign", "note"])
        self.act(ref["id"], "sign_send", user=self.doctor)
        actions = self.as_(self.nurse).get(DETAIL.format(ref["id"])).json()["actions"]
        for expected in ("schedule", "seen", "report", "needs_info", "decline", "cancel", "expire", "assign", "note"):
            self.assertIn(expected, actions)
        self.assertNotIn("sign_send", actions)
        self.assertNotIn("close", actions)
