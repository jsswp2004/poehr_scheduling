from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Organization

from .models import Contact
from .patient_sync import sync_patient_contact

User = get_user_model()


def make_patient(org, username="pat", consent=True, phone="3015550111", **kw):
    return User.objects.create_user(
        username=username, password="x", role="patient", organization=org,
        first_name="Pat", last_name="Ient", email=f"{username}@example.com",
        phone_number=phone, sms_consent=consent, **kw,
    )


class PatientSyncTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other_org = Organization.objects.create(name="Clinic B")
        self.staff = User.objects.create_user(username="staff", password="x", role="admin", organization=self.org)

    def test_consenting_patient_becomes_contact(self):
        p = make_patient(self.org)
        c = Contact.objects.get(patient_user=p)
        self.assertEqual(c.name, "Pat Ient")
        self.assertEqual(c.phone_e164, "+13015550111")

    def test_patient_without_consent_is_not_added(self):
        p = make_patient(self.org, consent=False)
        self.assertFalse(Contact.objects.filter(patient_user=p).exists())

    def test_consent_change_adds_and_removes(self):
        p = make_patient(self.org, consent=False)
        p.sms_consent = True
        p.save()
        self.assertTrue(Contact.objects.filter(patient_user=p).exists())
        p.sms_consent = False
        p.save()
        self.assertFalse(Contact.objects.filter(patient_user=p).exists())

    def test_phone_change_is_mirrored_and_no_duplicates(self):
        p = make_patient(self.org)
        p.phone_number = "+63 962 828 9452"
        p.save()
        self.assertEqual(Contact.objects.filter(patient_user=p).count(), 1)
        self.assertEqual(Contact.objects.get(patient_user=p).phone_e164, "+639628289452")

    def test_deactivated_patient_removed(self):
        p = make_patient(self.org)
        p.is_active = False
        p.save()
        self.assertFalse(Contact.objects.filter(patient_user=p).exists())

    def test_opt_out_is_carried_over(self):
        p = make_patient(self.org, sms_opt_out=True)
        self.assertTrue(Contact.objects.get(patient_user=p).sms_opt_out)

    def test_staff_user_never_synced(self):
        self.assertFalse(Contact.objects.filter(patient_user__isnull=False).exists())

    def test_backfill_command(self):
        p = make_patient(self.org)
        Contact.objects.all().delete()
        call_command("sync_patient_contacts")
        self.assertTrue(Contact.objects.filter(patient_user=p).exists())


class PatientContactVisibilityTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other_org = Organization.objects.create(name="Clinic B")
        self.sender = User.objects.create_user(username="sender", password="x", role="admin", organization=self.org)
        self.nurse = User.objects.create_user(username="nurse", password="x", role="nurse", organization=self.org)
        self.outsider = User.objects.create_user(username="out", password="x", role="admin", organization=self.other_org)
        self.pat = make_patient(self.org)
        self.api = APIClient()

    def ids(self, user):
        self.api.force_authenticate(user)
        data = self.api.get("/api/communicator/contacts/").json()
        data = data["results"] if isinstance(data, dict) else data
        return {c["id"] for c in data}

    def test_sender_in_org_sees_patient(self):
        cid = Contact.objects.get(patient_user=self.pat).id
        self.assertIn(cid, self.ids(self.sender))

    def test_other_org_does_not_see_patient(self):
        cid = Contact.objects.get(patient_user=self.pat).id
        self.assertNotIn(cid, self.ids(self.outsider))

    def test_user_without_send_right_does_not_see_patient(self):
        from users.rights import user_has_right
        cid = Contact.objects.get(patient_user=self.pat).id
        if not user_has_right(self.nurse, "messages.send"):
            self.assertNotIn(cid, self.ids(self.nurse))

    def test_synced_contact_is_read_only(self):
        cid = Contact.objects.get(patient_user=self.pat).id
        self.api.force_authenticate(self.sender)
        self.assertEqual(self.api.patch(f"/api/communicator/contacts/{cid}/", {"name": "X"}, format="json").status_code, 403)
        self.assertEqual(self.api.delete(f"/api/communicator/contacts/{cid}/").status_code, 403)
        self.assertTrue(Contact.objects.filter(id=cid).exists())

    def test_is_patient_flag(self):
        self.api.force_authenticate(self.sender)
        data = self.api.get("/api/communicator/contacts/").json()
        data = data["results"] if isinstance(data, dict) else data
        self.assertTrue(any(c["is_patient"] for c in data))
