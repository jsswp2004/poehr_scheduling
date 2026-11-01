"""Staff Inbox: message threads, alerts, things to sign, co-sign requests, Sent and Done."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization, Patient, Registration

from . import inbox, lab_results
from .models import (
    Appointment,
    ClinicalNote,
    InboxAlert,
    LabReport,
    LabResultItem,
    NoteCosign,
    Order,
    Orderable,
)

User = get_user_model()
URL = "/api/inbox/"


def make_user(username, role, org):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org)


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other = Organization.objects.create(name="Clinic B")
        self.doc = make_user("doc", "doctor", self.org)
        self.doc2 = make_user("doc2", "doctor", self.org)
        self.nurse = make_user("nurse", "nurse", self.org)
        self.reg = make_user("reg", "registrar", self.org)
        self.outside = make_user("out", "doctor", self.other)
        self.patient = make_user("pat", "patient", self.org)
        self.patient.first_name, self.patient.last_name = "Maria", "Santos"
        self.patient.save()
        self.appt = Appointment.objects.create(
            organization=self.org, patient=self.patient, provider=self.doc, title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )

    def api(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def items(self, user, folder="all", **params):
        r = self.api(user).get(URL, {"folder": folder, **params})
        self.assertEqual(r.status_code, 200, r.data)
        return r.data["items"]

    def keys(self, user, folder="all", **params):
        return [i["key"] for i in self.items(user, folder, **params)]

    def send(self, sender, to, subject="Check this", body="Please look at the BMP", **extra):
        r = self.api(sender).post(URL + "messages/", {"to": [u.pk for u in to], "subject": subject, "body": body, **extra}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data["key"]

    def note(self, author, status="draft"):
        return ClinicalNote.objects.create(
            organization=self.org, appointment=self.appt, patient=self.patient, author=author, note_type="nursing_assessment",
            status=status, signed_at=timezone.now() if status == "signed" else None, assessment="Stable",
        )


class AccessTests(Base):
    def test_patients_and_anonymous_are_refused(self):
        self.assertEqual(self.api(self.patient).get(URL).status_code, 403)
        self.assertEqual(APIClient().get(URL).status_code, 401)

    def test_people_are_my_clinic_staff_only(self):
        r = self.api(self.doc).get(URL + "people/")
        ids = {p["id"] for p in r.data}
        self.assertEqual(ids, {self.doc2.pk, self.nurse.pk, self.reg.pk})


class MessageTests(Base):
    def test_message_reaches_recipient_unread_and_sender_has_it_under_sent(self):
        key = self.send(self.nurse, [self.doc])
        mine = self.items(self.doc, "messages")
        self.assertEqual([i["key"] for i in mine], [key])
        self.assertTrue(mine[0]["unread"])
        self.assertEqual(mine[0]["from_name"], "nurse")
        self.assertEqual(self.keys(self.nurse, "messages"), [])  # nothing received yet
        self.assertEqual(self.keys(self.nurse, "sent"), [key])
        self.assertEqual(self.api(self.doc).get(URL + "counts/").data["messages"], 1)

    def test_opening_marks_it_read(self):
        key = self.send(self.nurse, [self.doc])
        r = self.api(self.doc).get(URL + "item/", {"key": key})
        self.assertEqual(r.data["messages"][0]["body"], "Please look at the BMP")
        self.assertFalse(self.items(self.doc, "messages")[0]["unread"])
        self.api(self.doc).post(URL + "read/", {"key": key, "read": False}, format="json")
        self.assertTrue(self.items(self.doc, "messages")[0]["unread"])

    def test_reply_threads_and_brings_it_back(self):
        key = self.send(self.nurse, [self.doc, self.doc2])
        tid = key.split(":")[1]
        self.api(self.doc).get(URL + "item/", {"key": key})
        self.api(self.doc).post(URL + "done/", {"key": key}, format="json")
        self.assertEqual(self.keys(self.doc, "messages"), [])
        self.assertEqual(self.keys(self.doc, "done"), [key])
        r = self.api(self.doc2).post(URL + f"messages/{tid}/reply/", {"body": "On it"}, format="json")
        self.assertEqual(r.status_code, 200)
        # everyone else gets it back as unread, in one thread
        row = self.items(self.doc, "messages")[0]
        self.assertTrue(row["unread"])
        self.assertEqual(row["count"], 2)
        self.assertEqual(row["from_name"], "doc2")
        self.assertEqual(self.keys(self.doc, "done"), [])
        self.assertFalse(self.items(self.doc2, "all")[0]["unread"])  # my own reply is not unread for me
        detail = self.api(self.nurse).get(URL + "item/", {"key": key}).data
        self.assertEqual([m["body"] for m in detail["messages"]], ["Please look at the BMP", "On it"])

    def test_done_and_undo(self):
        key = self.send(self.nurse, [self.doc])
        c = self.api(self.doc)
        c.post(URL + "done/", {"key": key}, format="json")
        self.assertEqual(self.keys(self.doc, "all"), [])
        self.assertEqual(self.keys(self.doc, "done"), [key])
        c.post(URL + "done/", {"key": key, "done": False}, format="json")
        self.assertEqual(self.keys(self.doc, "all"), [key])

    def test_forward_starts_a_new_thread_with_the_original_quoted(self):
        key = self.send(self.nurse, [self.doc], body="BMP is back")
        tid = key.split(":")[1]
        r = self.api(self.doc).post(URL + f"messages/{tid}/forward/", {"to": [self.doc2.pk], "note": "FYI"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        detail = self.api(self.doc2).get(URL + "item/", {"key": r.data["key"]}).data
        self.assertEqual(detail["title"], "Fwd: Check this")
        self.assertIn("FYI", detail["messages"][0]["body"])
        self.assertIn("BMP is back", detail["messages"][0]["body"])

    def test_cannot_write_to_other_clinics_patients_or_nobody(self):
        c = self.api(self.nurse)
        for body in (
            {"to": [self.outside.pk], "subject": "x", "body": "y"},
            {"to": [self.patient.pk], "subject": "x", "body": "y"},
            {"to": [], "subject": "x", "body": "y"},
            {"to": [self.doc.pk], "subject": " ", "body": "y"},
            {"to": [self.doc.pk], "subject": "x", "body": " "},
        ):
            self.assertEqual(c.post(URL + "messages/", body, format="json").status_code, 400, body)

    def test_outsider_cannot_open_or_reply(self):
        key = self.send(self.nurse, [self.doc])
        c = self.api(self.doc2)
        self.assertEqual(c.get(URL + "item/", {"key": key}).status_code, 404)
        self.assertEqual(c.post(URL + f"messages/{key.split(':')[1]}/reply/", {"body": "hi"}, format="json").status_code, 404)

    def test_message_about_a_patient_filters_by_patient(self):
        a = self.send(self.nurse, [self.doc], subject="About Maria", patient=self.patient.pk)
        self.send(self.nurse, [self.doc], subject="General")
        self.assertEqual(self.keys(self.doc, "all", patient=self.patient.pk), [a])
        self.assertEqual(self.items(self.doc, "all", patient=self.patient.pk)[0]["patient"]["name"], "Maria Santos")

    def test_search_and_unread_filters(self):
        a = self.send(self.nurse, [self.doc], subject="Lisinopril question")
        b = self.send(self.nurse, [self.doc], subject="Schedule")
        self.assertEqual(self.keys(self.doc, "all", q="lisin"), [a])
        self.api(self.doc).get(URL + "item/", {"key": b})
        self.assertEqual(self.keys(self.doc, "all", unread="1"), [a])


class AlertTests(Base):
    def test_notify_once_per_source_and_acknowledge(self):
        a = inbox.notify(self.doc, "Critical result: K", "K 6.9 (HH)", kind="critical", patient=self.patient, source_type="lab_report", source_id=5)
        again = inbox.notify(self.doc, "Critical result: K", "K 6.9 (HH)", kind="critical", patient=self.patient, source_type="lab_report", source_id=5)
        self.assertEqual(a.pk, again.pk)
        row = self.items(self.doc, "alerts")[0]
        self.assertEqual((row["severity"], row["unread"]), ("critical", True))
        c = self.api(self.doc)
        c.get(URL + "item/", {"key": row["key"]})
        c.post(URL + "done/", {"key": row["key"]}, format="json")
        self.assertEqual(self.keys(self.doc, "alerts"), [])
        self.assertEqual(self.keys(self.doc, "done"), [row["key"]])

    def test_other_people_do_not_see_it(self):
        inbox.notify(self.doc, "Hi", kind="notice")
        self.assertEqual(self.keys(self.doc2), [self.keys(self.doc)[0]][:0])

    def test_old_done_items_age_out_of_done(self):
        a = inbox.notify(self.doc, "Old", kind="notice")
        InboxAlert.objects.filter(pk=a.pk).update(done_at=timezone.now() - timedelta(days=45), created_at=timezone.now() - timedelta(days=46))
        self.assertEqual(self.keys(self.doc, "done"), [])


class SignAndCosignTests(Base):
    def test_draft_note_is_to_sign_then_done_when_signed(self):
        n = self.note(self.nurse)
        self.assertEqual(self.keys(self.nurse, "sign"), [f"sign:note:{n.pk}"])
        self.assertEqual(self.api(self.nurse).get(URL + "counts/").data["sign_open"], 1)
        n.status, n.signed_at = "signed", timezone.now()
        n.save()
        self.assertEqual(self.keys(self.nurse, "sign"), [])
        self.assertEqual(self.keys(self.nurse, "done"), [f"sign:note:{n.pk}"])

    def test_other_authors_drafts_are_not_mine(self):
        self.note(self.nurse)
        self.assertEqual(self.keys(self.doc, "sign"), [])

    def test_cosign_request_reaches_cosigner_and_leaves_when_answered(self):
        n = self.note(self.nurse, "signed")
        req = NoteCosign.objects.create(organization=self.org, note=n, requested_by=self.nurse, cosigner=self.doc, message="Please check the plan")
        row = self.items(self.doc, "cosign")[0]
        self.assertEqual((row["key"], row["unread"], row["from_name"]), (f"cosign:note:{req.pk}", True, "nurse"))
        self.assertEqual(self.keys(self.nurse, "sent"), [f"cosign:sent:{req.pk}"])
        d = self.api(self.doc).get(URL + "item/", {"key": row["key"]}).data
        self.assertEqual((d["request"]["message"], d["note"]["assessment"]), ("Please check the plan", "Stable"))
        self.assertFalse(self.items(self.doc, "cosign")[0]["unread"])
        resp = self.api(self.doc).post(f"/api/clinical-notes/{n.pk}/cosign/")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self.keys(self.doc, "cosign"), [])
        self.assertEqual(self.keys(self.doc, "done"), [row["key"]])
        # and the author is told
        notice = self.items(self.nurse, "alerts")[0]
        self.assertEqual(notice["title"], "Note co-signed")

    def test_returned_note_tells_the_author_why(self):
        n = self.note(self.nurse, "signed")
        NoteCosign.objects.create(organization=self.org, note=n, requested_by=self.nurse, cosigner=self.doc)
        self.api(self.doc).post(f"/api/clinical-notes/{n.pk}/return-cosign/", {"comment": "Add the allergy reaction"}, format="json")
        d = self.api(self.nurse).get(URL + "item/", {"key": self.keys(self.nurse, "alerts")[0]}).data
        self.assertEqual(d["title"], "Note returned with comments")
        self.assertIn("Add the allergy reaction", d["body"])

    def test_overdue_flag_and_overdue_notices_for_both(self):
        n = self.note(self.nurse, "signed")
        NoteCosign.objects.create(organization=self.org, note=n, requested_by=self.nurse, cosigner=self.doc, due_at=timezone.now() - timedelta(hours=1))
        self.assertTrue(self.items(self.doc, "cosign")[0]["overdue"])
        self.assertEqual([i["title"] for i in self.items(self.doc, "alerts")], ["Co-signature overdue"])
        self.assertEqual([i["title"] for i in self.items(self.nurse, "alerts")], ["Co-signature overdue"])
        self.items(self.doc, "alerts")  # opening again does not repeat it
        self.assertEqual(len(self.items(self.doc, "alerts")), 1)

    def test_reminder_before_due_goes_to_cosigner_only(self):
        n = self.note(self.nurse, "signed")
        NoteCosign.objects.create(organization=self.org, note=n, requested_by=self.nurse, cosigner=self.doc,
                                  due_at=timezone.now() + timedelta(minutes=30), reminder_minutes=60)
        self.assertEqual([i["title"] for i in self.items(self.doc, "alerts")], ["Co-signature reminder"])
        self.assertEqual(self.items(self.nurse, "alerts"), [])

    def test_orders_waiting_for_cosign_go_to_people_with_the_right(self):
        cbc = Orderable.objects.create(code="cbc", name="CBC", category="laboratory", code_system="loinc", external_code="58410-2")
        order = Order.objects.create(
            organization=self.org, appointment=self.appt, patient=self.patient, ordering_provider=self.nurse, orderable=cbc,
            orderable_name="CBC", orderable_category="laboratory", status="pending_cosign", signed_by=self.nurse, signed_at=timezone.now(),
        )
        self.assertEqual(self.keys(self.doc, "cosign"), [f"cosign:order:{order.pk}"])
        self.assertEqual(self.keys(self.reg, "cosign"), [])
        self.assertEqual(self.keys(self.nurse, "cosign"), [])  # the signer can't co-sign their own


class LabAlertTests(Base):
    def make_order(self, provider):
        cbc = Orderable.objects.create(code="bmp", name="BMP", category="laboratory", code_system="loinc", external_code="51990-0")
        return Order.objects.create(
            organization=self.org, appointment=self.appt, patient=self.patient, ordering_provider=provider, orderable=cbc,
            orderable_name="BMP", orderable_category="laboratory", status="active", signed_by=provider, signed_at=timezone.now(),
        )

    def report(self, user, items, order=None):
        return lab_results.create_report(user, {"patient": self.patient.pk, "title": "BMP", "items": items, "order": order.pk if order else None})

    def test_critical_result_alerts_the_ordering_provider(self):
        order = self.make_order(self.doc)
        self.report(self.nurse, [{"test_name": "Potassium", "value": "6.9", "units": "mmol/L", "abnormal_flag": "HH"}], order)
        row = self.items(self.doc, "alerts")[0]
        self.assertEqual((row["subtype"], row["severity"]), ("critical", "critical"))
        self.assertEqual(row["patient"]["name"], "Maria Santos")
        self.assertIn("Potassium", self.api(self.doc).get(URL + "item/", {"key": row["key"]}).data["body"])
        self.assertEqual(self.items(self.doc2, "alerts"), [])

    def test_abnormal_and_plain_results(self):
        order = self.make_order(self.doc)
        self.report(self.nurse, [{"test_name": "Potassium", "value": "5.4", "reference_range": "3.5-5.0"}], order)
        self.report(self.nurse, [{"test_name": "Sodium", "value": "140", "reference_range": "135-145"}], order)
        self.assertEqual(sorted(i["subtype"] for i in self.items(self.doc, "alerts")), ["abnormal", "result"])

    def test_no_order_goes_to_the_attending(self):
        reg = Registration.objects.create(patient=Patient.objects.get(user=self.patient), organization=self.org, attending_provider=self.doc2, care_setting="emergency")
        self.report(self.nurse, [{"test_name": "Potassium", "value": "7.0", "abnormal_flag": "HH"}])
        self.assertEqual(len(self.items(self.doc2, "alerts")), 1)
        self.assertEqual(self.items(self.doc, "alerts"), [])
        self.assertEqual(self.items(self.doc2, "alerts")[0]["care"], "emergency")
        self.assertEqual(self.keys(self.doc2, "all", care="emergency"), self.keys(self.doc2, "all"))
        self.assertEqual(self.keys(self.doc2, "all", care="acute"), [])
        self.assertIsNotNone(reg.pk)

    def test_nobody_to_tell_is_fine(self):
        self.report(self.nurse, [{"test_name": "Potassium", "value": "7.0", "abnormal_flag": "HH"}])
        self.assertEqual(InboxAlert.objects.count(), 0)
