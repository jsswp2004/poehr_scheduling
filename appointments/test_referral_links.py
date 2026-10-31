"""Secure referral link: sending, the code check, the specialist's replies, attachments and switching it off."""

import re
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from communicator.models import MessageLog

from . import referral_links as rl
from .models import LabReport, LabReportEvent, Referral, ReferralAttachment, ReferralLink
from .test_referrals import ACTION, DETAIL, RefBase

SEND = "/api/referrals/{}/send-link/"
REVOKE = "/api/referrals/{}/revoke-link/"
FILE = "/api/referrals/{}/attachments/{}/file/"
OPEN = "/api/referral-link/open/"
CODE = "/api/referral-link/code/"
VERIFY = "/api/referral-link/verify/"
PACKET = "/api/referral-link/packet/"
REPLY = "/api/referral-link/reply/"

PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
BOTH = {"channels": ["sms", "email"], "mobile": "301-555-0142", "email": "referrals@heart.example"}


def raw_key(text):
    return re.search(r"referral#([\w-]+)", text).group(1)


@override_settings(REFERRAL_PUBLIC_URL="https://app.example/referral", REFERRAL_LINK_REQUIRE_CODE=True)
class LinkBase(RefBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        sms = mock.patch("communicator.utils.send_sms")
        mail = mock.patch("communicator.utils.send_email")
        self.sms = sms.start()
        self.mail = mail.start()
        self.addCleanup(sms.stop)
        self.addCleanup(mail.stop)
        self.public = APIClient()

    def sign_and_send(self, delivery=BOTH, **extra):
        ref = self.make(**extra)
        r = self.act(ref["id"], "sign_send", user=self.doctor, delivery=delivery)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def sent_key(self, **extra):
        data = self.sign_and_send(**extra)
        return data, raw_key(self.sms.call_args.args[1])

    def last_code(self):
        """The 6-digit code from the last message that carried one (email or text)."""
        for mock_fn, index in ((self.mail, 2), (self.sms, 1)):
            for call in reversed(mock_fn.call_args_list):
                found = re.search(r"code is (\d{6})", call.args[index])
                if found:
                    return found.group(1)
        self.fail("no code was sent")

    def open_and_verify(self, key):
        r = self.public.post(OPEN, {"token": key}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["needs_code"])
        r = self.public.post(VERIFY, {"token": key, "code": self.last_code()}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()["session"]

    def authed(self, session):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Referral {session}")
        return c


class SendingTests(LinkBase):
    def test_signing_can_send_the_link_by_text_and_email(self):
        data = self.sign_and_send()
        self.assertEqual(data["status"], "sent")
        self.assertEqual([d["channel"] for d in data["delivery"]["deliveries"]], ["sms", "email"])
        self.assertTrue(all(d["sent"] for d in data["delivery"]["deliveries"]))
        self.assertEqual(self.sms.call_count, 1)
        self.assertEqual(self.mail.call_count, 1)
        self.assertEqual(data["link"]["state"], "active")
        self.assertIn("link_sent", [e["type"] for e in data["events"]])

    def test_the_messages_name_the_clinic_but_nothing_about_the_patient(self):
        self.sign_and_send()
        text, subject, body = self.sms.call_args.args[1], self.mail.call_args.args[1], self.mail.call_args.args[2]
        self.assertIn("Riverside Clinic", text)
        self.assertIn("Riverside Clinic", subject)
        for message in (text, subject, body):
            for secret in ("Bcs", "Test", "Chest pain", "CAD", "R07.9", "Cardiology"):
                self.assertNotIn(secret, message)
        self.assertIn("https://app.example/referral#", self.sms.call_args.args[1])

    def test_only_a_hash_of_the_key_is_stored(self):
        _data, key = self.sent_key()
        link = ReferralLink.objects.get()
        self.assertNotEqual(link.token_hash, key)
        self.assertEqual(link.token_hash, rl.hash_token(key))
        self.assertNotIn(key, str(link.deliveries))
        self.assertGreater(link.expires_at, timezone.now() + timedelta(days=29))

    def test_a_bad_contact_stops_the_signing(self):
        ref = self.make()
        for delivery in ({"channels": ["sms"]}, {"channels": ["email"], "email": "nope"}, {"channels": ["sms"], "mobile": "12345"}):
            r = self.act(ref["id"], "sign_send", user=self.doctor, delivery=delivery)
            self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(Referral.objects.get(pk=ref["id"]).status, "draft")
        self.assertEqual(self.sms.call_count + self.mail.call_count, 0)

    def test_signing_with_no_delivery_sends_nothing(self):
        data = self.sign_and_send(delivery=None)
        self.assertEqual(data["status"], "sent")
        self.assertNotIn("delivery", data)
        self.assertIsNone(data["link"])
        self.assertEqual(self.sms.call_count, 0)

    def test_a_blocked_text_is_reported_and_the_referral_still_goes(self):
        self.sms.side_effect = Exception("SMS blocked: Recipient has opted out of SMS notifications")
        data = self.sign_and_send(delivery={"channels": ["sms"], "mobile": "3015550142"})
        self.assertEqual(data["status"], "sent")
        result = data["delivery"]["deliveries"][0]
        self.assertFalse(result["sent"])
        self.assertEqual(result["reason"], "opted_out")

    def test_the_key_and_code_are_wiped_from_the_message_log(self):
        def fake_send(to, message, user=None, organization=None, **kw):
            MessageLog.objects.create(organization=organization, recipient="+13015550142", body=message, message_type="sms", status="sent")

        self.sms.side_effect = fake_send
        data = self.sign_and_send(delivery={"channels": ["sms"], "mobile": "3015550142", "email": "referrals@heart.example"})
        key = raw_key(self.sms.call_args.args[1])
        self.assertTrue(MessageLog.objects.exists())
        for row in MessageLog.objects.all():
            self.assertNotIn(key, row.body)
            self.assertIn("[hidden]", row.body)
        self.assertEqual(data["status"], "sent")

    def test_sending_again_replaces_the_old_link(self):
        _data, old = self.sent_key()
        ref_id = Referral.objects.get().pk
        r = self.as_(self.nurse).post(SEND.format(ref_id), BOTH, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        new = raw_key(self.sms.call_args.args[1])
        self.assertNotEqual(old, new)
        self.assertEqual(self.public.post(OPEN, {"token": old}, format="json").status_code, 410)
        self.assertEqual(self.public.post(OPEN, {"token": new}, format="json").status_code, 200)

    def test_copy_the_link_without_sending(self):
        ref = self.make()
        self.act(ref["id"], "sign_send", user=self.doctor)
        r = self.as_(self.nurse).post(SEND.format(ref["id"]), {"copy": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["url"].startswith("https://app.example/referral#"))
        self.assertEqual(self.sms.call_count + self.mail.call_count, 0)
        key = r.json()["url"].split("#", 1)[1]
        # no contact on file, so there is nowhere to send a code and none is asked for
        out = self.public.post(OPEN, {"token": key}, format="json").json()
        self.assertFalse(out["needs_code"])
        self.assertIn("session", out)

    def test_a_draft_cannot_be_sent_and_the_wrong_people_are_kept_out(self):
        ref = self.make()
        self.assertEqual(self.as_(self.nurse).post(SEND.format(ref["id"]), BOTH, format="json").status_code, 409)
        sent = self.sign_and_send()
        self.assertEqual(self.as_(self.outsider).post(SEND.format(sent["id"]), BOTH, format="json").status_code, 404)
        self.assertEqual(self.as_(self.patient).post(SEND.format(sent["id"]), BOTH, format="json").status_code, 403)
        self.assertEqual(self.as_(self.outsider).post(REVOKE.format(sent["id"]), format="json").status_code, 404)

    def test_the_directory_keeps_a_mobile_number_and_email(self):
        r = self.as_(self.admin).patch(f"/api/referral-destinations/{self.cardio.pk}/", {"mobile": "301-555-0142", "email": "a@b.org"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()["mobile"], r.json()["email"]), ("(301) 555-0142", "a@b.org"))
        bad = self.as_(self.admin).patch(f"/api/referral-destinations/{self.cardio.pk}/", {"email": "nope"}, format="json")
        self.assertEqual(bad.status_code, 400)


class OpeningTests(LinkBase):
    def test_a_wrong_or_missing_key_gets_the_same_answer(self):
        self.sign_and_send()
        for token in ("", "nonsense", "x" * 500, None):
            r = self.public.post(OPEN, {"token": token}, format="json")
            self.assertEqual((r.status_code, r.json()["detail"]), (410, "link_unavailable"))

    def test_opening_asks_for_a_code_sent_to_the_other_contact(self):
        self.sign_and_send(delivery={"channels": ["sms"], "mobile": "3015550142", "email": "referrals@heart.example"})
        key = raw_key(self.sms.call_args.args[1])
        r = self.public.post(OPEN, {"token": key}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["needs_code"])
        self.assertEqual(r.json()["sent_to"], "r•••@heart.example")
        self.assertNotIn("session", r.json())
        self.assertEqual(self.mail.call_count, 1)  # the code went by email, the link went by text
        self.assertEqual(self.sms.call_count, 1)

    def test_reloading_the_page_does_not_send_another_code(self):
        _data, key = self.sent_key()
        self.public.post(OPEN, {"token": key}, format="json")
        sent = self.mail.call_count
        self.public.post(OPEN, {"token": key}, format="json")
        self.assertEqual(self.mail.call_count, sent)

    def test_the_packet_needs_the_session(self):
        _data, key = self.sent_key()
        self.assertEqual(self.public.get(PACKET).status_code, 410)
        self.assertEqual(self.authed("garbage").get(PACKET).status_code, 410)
        self.public.post(OPEN, {"token": key}, format="json")  # opened, not yet proven
        self.assertEqual(self.authed(key).get(PACKET).status_code, 410)  # the key itself is not a session

    def test_a_wrong_code_is_refused_and_too_many_lock_it(self):
        _data, key = self.sent_key()
        self.public.post(OPEN, {"token": key}, format="json")
        good = self.last_code()
        bad = "000000" if good != "000000" else "111111"
        for _ in range(rl.CODE_MAX_ATTEMPTS):
            self.assertEqual(self.public.post(VERIFY, {"token": key, "code": bad}, format="json").status_code, 400)
            cache.clear()  # keep the request throttle out of this check
        r = self.public.post(VERIFY, {"token": key, "code": good}, format="json")
        self.assertEqual(r.status_code, 429, r.content)

    def test_an_expired_code_is_refused_and_a_new_one_works(self):
        _data, key = self.sent_key()
        self.public.post(OPEN, {"token": key}, format="json")
        old = self.last_code()
        ReferralLink.objects.update(code_expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.public.post(VERIFY, {"token": key, "code": old}, format="json").status_code, 400)
        self.assertEqual(self.public.post(CODE, {"token": key}, format="json").status_code, 200)
        r = self.public.post(VERIFY, {"token": key, "code": self.last_code()}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_codes_are_limited_per_hour(self):
        _data, key = self.sent_key()
        self.public.post(OPEN, {"token": key}, format="json")  # 1st
        for expected in (200, 200, 429):  # 2nd, 3rd, then refused
            cache.clear()
            self.assertEqual(self.public.post(CODE, {"token": key}, format="json").status_code, expected)

    def test_the_specialist_sees_the_referral_and_allergies_only(self):
        from .models import PatientAllergy

        PatientAllergy.objects.create(patient=self.patient, substance="Penicillin", reaction="Rash", severity="severe")
        _data, key = self.sent_key(urgency="urgent")
        session = self.open_and_verify(key)
        r = self.authed(session).get(PACKET)
        self.assertEqual(r.status_code, 200, r.content)
        p = r.json()
        self.assertEqual(p["organization"], "Riverside Clinic")
        self.assertEqual(p["patient"]["name"], "Test Bcs")
        self.assertEqual(p["patient"]["age"], 43)
        self.assertEqual(p["patient"]["sex"], "M")
        self.assertEqual(p["urgency_label"], "Urgent")
        self.assertEqual(p["reason"], "Chest pain on exertion")
        self.assertEqual(p["allergies"]["items"], [{"substance": "Penicillin", "reaction": "Rash"}])
        self.assertEqual([x["action"] for x in p["replies"]], ["schedule", "needs_info", "decline", "report"])
        for private in ("events", "report_text", "assigned_to", "signed_by_name", "created_by", "mrn", "ssn"):
            self.assertNotIn(private, p)
        self.assertEqual(self.authed(session).get(PACKET)["Cache-Control"], "no-store")

    def test_the_first_opening_is_recorded_once(self):
        _data, key = self.sent_key()
        self.open_and_verify(key)
        self.public.post(OPEN, {"token": key}, format="json")
        link = ReferralLink.objects.get()
        self.assertEqual(link.open_count, 2)
        self.assertIsNotNone(link.first_opened_at)
        events = self.as_(self.nurse).get(DETAIL.format(link.referral_id)).json()["events"]
        self.assertEqual([e["type"] for e in events].count("link_opened"), 1)

    @override_settings(REFERRAL_LINK_REQUIRE_CODE=False)
    def test_the_code_can_be_switched_off(self):
        _data, key = self.sent_key()
        out = self.public.post(OPEN, {"token": key}, format="json").json()
        self.assertFalse(out["needs_code"])
        self.assertEqual(self.authed(out["session"]).get(PACKET).status_code, 200)

    def test_an_old_session_stops_working(self):
        _data, key = self.sent_key()
        session = self.open_and_verify(key)
        with override_settings(REFERRAL_SESSION_TTL_SECONDS=-1):
            self.assertEqual(self.authed(session).get(PACKET).status_code, 410)


class ReplyTests(LinkBase):
    def setUp(self):
        super().setUp()
        self.data, self.key = self.sent_key()
        self.ref_id = self.data["id"]
        self.session = self.open_and_verify(self.key)
        self.c = self.authed(self.session)

    def reply(self, action, **fields):
        return self.c.post(REPLY, {"action": action, **fields}, format="multipart")

    def detail(self):
        return self.as_(self.nurse).get(DETAIL.format(self.ref_id)).json()

    def test_scheduling_moves_the_referral_and_stops_the_clock(self):
        when = (timezone.now() + timedelta(days=5)).replace(microsecond=0)
        r = self.reply("schedule", scheduled_for=when.isoformat(), appointment_location="Heart Associates, Suite 4")
        self.assertEqual(r.status_code, 200, r.content)
        d = self.detail()
        self.assertEqual(d["status"], "scheduled")
        self.assertEqual(d["appointment_location"], "Heart Associates, Suite 4")
        self.assertIsNone(d["schedule_due"])
        event = [e for e in d["events"] if e["type"] == "scheduled"][0]
        self.assertEqual(event["detail"]["via"], "secure_link")
        self.assertEqual(event["user"], "")  # no staff member did this
        self.assertEqual(r.json()["status"], "scheduled")
        self.assertEqual([x["action"] for x in r.json()["replies"]], ["schedule", "needs_info", "decline", "report"])

    def test_a_date_is_required_to_schedule(self):
        self.assertEqual(self.reply("schedule").status_code, 400)
        self.assertEqual(self.reply("schedule", scheduled_for="not a date").status_code, 400)
        self.assertEqual(self.detail()["status"], "sent")

    def test_asking_for_information_needs_the_question_and_shows_to_the_clinic(self):
        self.assertEqual(self.reply("needs_info").status_code, 400)
        r = self.reply("needs_info", message="Please send the latest ECG.")
        self.assertEqual(r.status_code, 200, r.content)
        d = self.detail()
        self.assertEqual((d["status"], d["status_note"]), ("needs_info", "Please send the latest ECG."))
        self.assertEqual(r.json()["conversation"][-1]["note"], "Please send the latest ECG.")

    def test_the_clinic_can_answer_and_the_specialist_sees_it(self):
        self.reply("needs_info", message="Please send the latest ECG.")
        self.act(self.ref_id, "resend", user=self.nurse, note="ECG attached to the chart; see Results.")
        p = self.c.get(PACKET).json()
        self.assertEqual(p["status"], "sent")
        self.assertEqual([c["from"] for c in p["conversation"]], ["specialist", "clinic"])
        self.assertEqual(p["conversation"][1]["note"], "ECG attached to the chart; see Results.")

    def test_declining_needs_a_reason_and_then_the_link_is_closed(self):
        self.assertEqual(self.reply("decline").status_code, 400)
        self.assertEqual(self.reply("decline", message="Not in our scope.").status_code, 200)
        self.assertEqual(self.detail()["status"], "declined")
        self.assertEqual(self.c.get(PACKET).status_code, 410)

    def test_sending_the_consult_files_the_report(self):
        r = self.reply("report", message="Stress test normal. Follow up in 6 months.", seen_on="2026-11-04")
        self.assertEqual(r.status_code, 200, r.content)
        d = self.detail()
        self.assertEqual(d["status"], "report_received")
        self.assertIn("Seen on: 2026-11-04", d["report_text"])
        self.assertIn("Stress test normal.", d["report_text"])
        self.assertEqual(r.json()["replies"], [])
        # nothing more can be sent once the consult is in
        self.assertEqual(self.reply("report", message="again").status_code, 409)

    def test_a_consult_needs_text_or_a_file(self):
        self.assertEqual(self.reply("report").status_code, 400)

    def test_the_attached_letter_is_filed_as_an_unreviewed_outside_document(self):
        letter = SimpleUploadedFile("Consult letter - Alvarez.pdf", PDF, content_type="application/pdf")
        r = self.c.post(REPLY, {"action": "report", "message": "See letter.", "files": [letter]}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        att = ReferralAttachment.objects.get()
        report = att.lab_report
        self.assertEqual(report.patient_id, self.patient.pk)
        self.assertEqual(report.organization_id, self.org.pk)
        self.assertEqual(report.review_status, "unreviewed")
        self.assertEqual(report.source, "scan")
        self.assertEqual(report.file_content_type, "application/pdf")
        self.assertIn("Outside consult", report.title)
        self.assertIsNone(report.entered_by)
        d = self.detail()
        self.assertEqual([a["file_name"] for a in d["attachments"]], ["Consult letter - Alvarez.pdf"])
        self.assertEqual(d["attachments"][0]["review_status"], "unreviewed")
        # a person on the care team opens it, and the opening is recorded on the document
        got = self.as_(self.nurse).get(FILE.format(self.ref_id, att.pk))
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.content, PDF)
        self.assertEqual(got["X-Content-Type-Options"], "nosniff")
        self.assertTrue(LabReportEvent.objects.filter(report=report, event_type="file_viewed").exists())
        # another clinic cannot
        self.assertEqual(self.as_(self.outsider).get(FILE.format(self.ref_id, att.pk)).status_code, 404)
        # and a letter alone is enough for a consult
        self.assertIn("Attached: Consult letter - Alvarez.pdf", d["report_text"])

    def test_a_letter_with_no_typed_findings_is_accepted(self):
        letter = SimpleUploadedFile("letter.pdf", PDF, content_type="application/pdf")
        r = self.c.post(REPLY, {"action": "report", "files": [letter]}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("See the attached consult letter.", self.detail()["report_text"])

    def test_files_are_judged_by_what_they_are_not_what_they_are_called(self):
        fake = SimpleUploadedFile("letter.pdf", b"MZ\x90\x00 this is a program", content_type="application/pdf")
        r = self.c.post(REPLY, {"action": "report", "message": "x", "files": [fake]}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertIn("PDF, JPEG or PNG", r.json()["detail"])
        empty = SimpleUploadedFile("e.pdf", b"", content_type="application/pdf")
        self.assertEqual(self.c.post(REPLY, {"action": "report", "message": "x", "files": [empty]}, format="multipart").status_code, 400)
        self.assertEqual(self.detail()["status"], "sent")
        self.assertFalse(LabReport.objects.exists())

    def test_too_big_and_too_many_files_are_refused(self):
        with mock.patch("appointments.lab_results.MAX_FILE_BYTES", 20):
            big = SimpleUploadedFile("big.pdf", PDF, content_type="application/pdf")
            r = self.c.post(REPLY, {"action": "report", "message": "x", "files": [big]}, format="multipart")
            self.assertEqual(r.status_code, 400)
            self.assertIn("too large", r.json()["detail"])
        files = [SimpleUploadedFile(f"{i}.pdf", PDF + bytes([i]), content_type="application/pdf") for i in range(rl.MAX_FILES + 1)]
        r = self.c.post(REPLY, {"action": "report", "message": "x", "files": files}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(ReferralAttachment.objects.exists())

    def test_a_failed_reply_files_nothing(self):
        letter = SimpleUploadedFile("letter.pdf", PDF, content_type="application/pdf")
        r = self.c.post(REPLY, {"action": "schedule", "files": [letter]}, format="multipart")  # no date
        self.assertEqual(r.status_code, 400)
        self.assertFalse(LabReport.objects.exists())
        self.assertFalse(ReferralAttachment.objects.exists())

    def test_the_same_file_sent_twice_is_filed_once(self):
        for _ in range(2):
            letter = SimpleUploadedFile("letter.pdf", PDF, content_type="application/pdf")
            self.c.post(REPLY, {"action": "needs_info", "message": "Q", "files": [letter]}, format="multipart")
            self.act(self.ref_id, "resend", user=self.nurse)
        self.assertEqual(LabReport.objects.count(), 1)
        self.assertEqual(ReferralAttachment.objects.count(), 2)

    def test_an_unknown_reply_is_refused(self):
        self.assertEqual(self.reply("close").status_code, 400)
        self.assertEqual(self.reply("sign_send").status_code, 400)
        self.assertEqual(self.reply("").status_code, 400)

    def test_the_lab_review_pile_counts_the_letter(self):
        letter = SimpleUploadedFile("letter.pdf", PDF, content_type="application/pdf")
        self.c.post(REPLY, {"action": "report", "message": "ok", "files": [letter]}, format="multipart")
        r = self.as_(self.doctor).get("/api/lab-reports/inbox/?summary=1")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertGreaterEqual(r.json()["count"], 1)


class EndingTests(LinkBase):
    def test_turning_the_link_off_stops_it_everywhere(self):
        data, key = self.sent_key()
        session = self.open_and_verify(key)
        r = self.as_(self.nurse).post(REVOKE.format(data["id"]), format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["link"]["state"], "turned_off")
        self.assertIn("link_revoked", [e["type"] for e in r.json()["events"]])
        self.assertEqual(self.public.post(OPEN, {"token": key}, format="json").status_code, 410)
        self.assertEqual(self.authed(session).get(PACKET).status_code, 410)
        self.assertEqual(self.authed(session).post(REPLY, {"action": "decline", "message": "x"}, format="multipart").status_code, 410)

    def test_an_expired_link_stops_working(self):
        _data, key = self.sent_key()
        ReferralLink.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.public.post(OPEN, {"token": key}, format="json").status_code, 410)

    def test_closing_or_cancelling_the_referral_ends_the_link(self):
        data, key = self.sent_key()
        session = self.open_and_verify(key)
        r = self.act(data["id"], "cancel", user=self.nurse, note="Patient moved")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["link"]["state"], "closed")
        self.assertEqual(self.public.post(OPEN, {"token": key}, format="json").status_code, 410)
        self.assertEqual(self.authed(session).get(PACKET).status_code, 410)

    def test_a_session_from_one_link_does_not_open_the_next(self):
        data, key = self.sent_key()
        session = self.open_and_verify(key)
        self.as_(self.nurse).post(SEND.format(data["id"]), BOTH, format="json")  # replaces the link
        self.assertEqual(self.authed(session).get(PACKET).status_code, 410)

    def test_each_key_opens_only_its_own_referral(self):
        _first, key_one = self.sent_key()
        _second, key_two = self.sent_key(reason="A different problem")
        packet_one = self.authed(self.open_and_verify(key_one)).get(PACKET).json()
        packet_two = self.authed(self.open_and_verify(key_two)).get(PACKET).json()
        self.assertEqual(packet_one["reason"], "Chest pain on exertion")
        self.assertEqual(packet_two["reason"], "A different problem")
