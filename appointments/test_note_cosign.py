"""Co-signature on clinical notes: signed notes stay visible, the right people are asked,
a returned note is answered by an addendum and a new request."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization

from .models import Appointment, ClinicalNote, NoteCosign

User = get_user_model()


def make_user(username, role, org):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org)


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other = Organization.objects.create(name="Clinic B")
        self.nurse = make_user("nurse", "nurse", self.org)
        self.doctor = make_user("doc", "doctor", self.org)
        self.doctor2 = make_user("doc2", "doctor", self.org)
        self.outside_doc = make_user("odoc", "doctor", self.other)
        self.registrar = make_user("reg", "registrar", self.org)
        self.patient = make_user("pat", "patient", self.org)
        self.appt = Appointment.objects.create(
            organization=self.org, patient=self.patient, provider=self.doctor, title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        self.client = APIClient()

    def as_user(self, u):
        # JWT, not force_authenticate: the tenant scoping reads the signed-in clinic from the token.
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(u).access_token}")

    def note(self, author=None, status="signed"):
        return ClinicalNote.objects.create(
            organization=self.org, appointment=self.appt, patient=self.patient, author=author or self.nurse,
            note_type="nursing_assessment", status=status, signed_at=timezone.now() if status == "signed" else None,
        )

    def url(self, note, action):
        return f"/api/clinical-notes/{note.pk}/{action}/"

    def ask(self, note, cosigner=None, **extra):
        return self.client.post(self.url(note, "request-cosign"), {"cosigner": (cosigner or self.doctor).pk, **extra}, format="json")


class RequestTests(Base):
    def test_header_status_starts_as_none(self):
        n = self.note()
        self.as_user(self.nurse)
        r = self.client.get(f"/api/clinical-notes/{n.pk}/")
        self.assertEqual(r.data["cosign"], {"status": "none"})

    def test_signed_note_is_visible_and_awaiting_right_away(self):
        n = self.note()
        self.as_user(self.nurse)
        r = self.ask(n, message="Please review the plan", due_at=(timezone.now() + timedelta(hours=4)).isoformat())
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["status"], "signed")
        self.assertEqual(r.data["cosign"]["status"], "awaiting")
        self.assertEqual(r.data["cosign"]["message"], "Please review the plan")
        self.assertFalse(r.data["cosign"]["overdue"])
        lst = self.client.get(f"/api/clinical-notes/?patient={self.patient.pk}")
        rows = lst.data["results"] if isinstance(lst.data, dict) else lst.data
        self.assertEqual([x["cosign"]["status"] for x in rows], ["awaiting"])

    def test_draft_note_cannot_be_sent(self):
        n = self.note(status="draft")
        self.as_user(self.nurse)
        self.assertEqual(self.ask(n).status_code, 400)

    def test_cannot_ask_the_author_or_someone_without_the_right(self):
        n = self.note(author=self.doctor)
        self.as_user(self.doctor)
        self.assertEqual(self.ask(n, self.doctor).status_code, 400)
        self.assertEqual(self.ask(n, self.registrar).status_code, 400)

    def test_cannot_ask_another_clinic(self):
        n = self.note()
        self.as_user(self.nurse)
        self.assertEqual(self.ask(n, self.outside_doc).status_code, 400)

    def test_only_author_or_admin_can_ask(self):
        n = self.note()
        self.as_user(self.doctor2)
        self.assertEqual(self.ask(n).status_code, 403)

    def test_one_open_request_at_a_time(self):
        n = self.note()
        self.as_user(self.nurse)
        self.assertEqual(self.ask(n).status_code, 200)
        self.assertEqual(self.ask(n, self.doctor2).status_code, 400)

    def test_candidates_exclude_me_and_people_without_the_right(self):
        self.as_user(self.doctor)
        r = self.client.get("/api/clinical-notes/cosigners/")
        ids = {p["id"] for p in r.data}
        self.assertIn(self.doctor2.pk, ids)
        self.assertNotIn(self.doctor.pk, ids)
        self.assertNotIn(self.registrar.pk, ids)
        self.assertNotIn(self.outside_doc.pk, ids)

    def test_overdue_flag(self):
        n = self.note()
        NoteCosign.objects.create(organization=self.org, note=n, requested_by=self.nurse, cosigner=self.doctor, due_at=timezone.now() - timedelta(hours=1))
        self.as_user(self.nurse)
        r = self.client.get(f"/api/clinical-notes/{n.pk}/")
        self.assertTrue(r.data["cosign"]["overdue"])


class AnswerTests(Base):
    def setUp(self):
        super().setUp()
        self.n = self.note()
        self.as_user(self.nurse)
        self.ask(self.n)

    def test_cosigner_cosigns(self):
        self.as_user(self.doctor)
        r = self.client.post(self.url(self.n, "cosign"))
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["cosign"]["status"], "cosigned")
        self.assertIsNotNone(r.data["cosign"]["resolved_at"])
        self.assertEqual(self.ask_again().status_code, 400)

    def ask_again(self):
        self.as_user(self.nurse)
        return self.ask(self.n, self.doctor2)

    def test_someone_else_cannot_cosign(self):
        self.as_user(self.doctor2)
        self.assertEqual(self.client.post(self.url(self.n, "cosign")).status_code, 403)
        self.as_user(self.nurse)
        self.assertEqual(self.client.post(self.url(self.n, "cosign")).status_code, 403)

    def test_return_needs_a_comment(self):
        self.as_user(self.doctor)
        self.assertEqual(self.client.post(self.url(self.n, "return-cosign"), {"comment": "  "}, format="json").status_code, 400)

    def test_return_then_addendum_then_request_again(self):
        self.as_user(self.doctor)
        r = self.client.post(self.url(self.n, "return-cosign"), {"comment": "Add the allergy reaction"}, format="json")
        self.assertEqual(r.data["cosign"]["status"], "returned")
        self.assertEqual(r.data["cosign"]["comment"], "Add the allergy reaction")
        self.assertEqual(r.data["status"], "signed")  # still in the chart
        self.as_user(self.nurse)
        add = self.client.post(self.url(self.n, "addend"), {"subjective": "Reaction: hives"}, format="json")
        self.assertEqual(add.status_code, 201, add.data)
        again = self.ask(self.n, self.doctor2, message="Addendum added")
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(again.data["cosign"]["status"], "awaiting")
        self.assertEqual(again.data["cosign"]["cosigner"], self.doctor2.pk)
        self.assertEqual(NoteCosign.objects.filter(note=self.n).count(), 2)

    def test_cancel(self):
        self.as_user(self.nurse)
        r = self.client.post(self.url(self.n, "cancel-cosign"))
        self.assertEqual(r.data["cosign"]["status"], "none")
        self.as_user(self.doctor)
        self.assertEqual(self.client.post(self.url(self.n, "cosign")).status_code, 400)

    def test_other_clinic_cannot_see_the_note(self):
        self.as_user(self.outside_doc)
        self.assertEqual(self.client.post(self.url(self.n, "cosign")).status_code, 404)
