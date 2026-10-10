from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Contact


class ContactModelTest(TestCase):
    def test_create_contact(self):
        User = get_user_model()
        user = User.objects.create_user(username='tester', password='pass')
        contact = Contact.objects.create(name='John', phone='123', email='a@b.com', uploaded_by=user)
        self.assertEqual(contact.uploaded_by, user)
        self.assertEqual(Contact.objects.count(), 1)


@patch("users.permissions.user_has_right", return_value=True)
class SendBulkMessageTest(TestCase):
    """Covers the mobile-facing contract of POST /api/communicator/send/."""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="sender", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.c1 = Contact.objects.create(name="A", phone="3015550101", email="a@example.com", uploaded_by=self.user)
        self.c2 = Contact.objects.create(name="B", phone="3015550102", uploaded_by=self.user)
        self.c3 = Contact.objects.create(name="C", phone="3015550103", uploaded_by=self.user)

    def post(self, payload):
        return self.client.post("/api/communicator/send/", payload, format="json")

    def test_requires_message(self, _perm):
        res = self.post({"message": "   "})
        self.assertEqual(res.status_code, 400)

    def test_requires_a_channel(self, _perm):
        res = self.post({"message": "Hi", "send_sms": False, "send_email": False})
        self.assertEqual(res.status_code, 400)

    @patch("communicator.views.send_sms")
    def test_counts_sent_skipped_and_failed(self, mock_sms, _perm):
        def fake(phone, *args, **kwargs):
            if phone.endswith("0102"):
                raise Exception("SMS blocked: Recipient has opted out of SMS notifications")
            if phone.endswith("0103"):
                raise Exception("Twilio error")
            return object()

        mock_sms.side_effect = fake
        res = self.post({"message": "Hi"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["sent"], 3)  # legacy meaning: contacts processed
        self.assertEqual(res.data["results"]["sms_sent"], 1)
        self.assertEqual(res.data["results"]["sms_skipped"], 1)
        self.assertEqual(res.data["results"]["sms_failed"], 1)

    @patch("communicator.views.send_sms")
    def test_contact_ids_limits_recipients(self, mock_sms, _perm):
        res = self.post({"message": "Hi", "contact_ids": [self.c1.id]})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["recipient_count"], 1)
        self.assertEqual(mock_sms.call_count, 1)

    @patch("communicator.views.send_sms")
    def test_does_not_send_to_other_users_contacts(self, mock_sms, _perm):
        other = get_user_model().objects.create_user(username="other", password="pass")
        stranger = Contact.objects.create(name="X", phone="3015559999", uploaded_by=other)
        res = self.post({"message": "Hi", "contact_ids": [stranger.id]})
        self.assertEqual(res.data["recipient_count"], 0)
        mock_sms.assert_not_called()

    @patch("communicator.views.send_sms")
    def test_confirm_count_mismatch_sends_nothing(self, mock_sms, _perm):
        res = self.post({"message": "Hi", "confirm_count": 2})
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["recipient_count"], 3)
        mock_sms.assert_not_called()

    @patch("communicator.views.send_email")
    @patch("communicator.views.send_sms")
    def test_email_only(self, mock_sms, mock_email, _perm):
        res = self.post({"message": "Hi", "subject": "S", "send_sms": False, "send_email": True})
        self.assertEqual(res.status_code, 200)
        mock_sms.assert_not_called()
        self.assertEqual(res.data["results"]["email_sent"], 1)


class ContactListTest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="lister", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        for i in range(55):
            Contact.objects.create(name=f"N{i}", phone=f"30155501{i:02d}", uploaded_by=self.user)

    def test_plain_list_when_no_page_param(self):
        res = self.client.get("/api/communicator/contacts/")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.data, list)
        self.assertEqual(len(res.data), 55)

    def test_paginates_when_page_param_present(self):
        res = self.client.get("/api/communicator/contacts/?page=1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 55)
        self.assertEqual(len(res.data["results"]), 50)

    def test_opted_out_flag_present(self):
        res = self.client.get("/api/communicator/contacts/")
        self.assertIn("opted_out", res.data[0])
        self.assertFalse(res.data[0]["opted_out"])


class ContactOptOutTest(TestCase):
    """Contact-level SMS opt-out for recipients who are not registered users."""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="owner", password="pass")
        self.contact = Contact.objects.create(
            name="Plain", phone="(301) 555-0199", uploaded_by=self.user
        )

    def test_phone_is_normalized_on_save(self):
        self.assertEqual(self.contact.phone_e164, "+13015550199")

    def test_stop_marks_contact_opted_out_and_start_clears_it(self):
        from .utils import set_contacts_opt_out

        self.assertEqual(set_contacts_opt_out("+13015550199", True, "STOP"), 1)
        self.contact.refresh_from_db()
        self.assertTrue(self.contact.sms_opt_out)
        self.assertEqual(self.contact.sms_opt_out_method, "STOP")
        self.assertIsNotNone(self.contact.sms_opt_out_date)

        set_contacts_opt_out("+13015550199", False)
        self.contact.refresh_from_db()
        self.assertFalse(self.contact.sms_opt_out)
        self.assertIsNone(self.contact.sms_opt_out_date)

    def test_send_sms_blocked_for_opted_out_contact(self):
        from .models import MessageLog
        from .utils import send_sms, set_contacts_opt_out

        set_contacts_opt_out("+13015550199", True, "STOP")
        with patch("communicator.utils.Client") as mock_client:
            with self.assertRaises(Exception) as ctx:
                send_sms("3015550199", "Hello", user=self.user)
        self.assertIn("opted out", str(ctx.exception))
        mock_client.assert_not_called()
        self.assertTrue(
            MessageLog.objects.filter(status="blocked_opted_out").exists()
        )

    def test_send_sms_still_works_for_normal_contact(self):
        from .utils import send_sms

        with patch("communicator.utils.Client") as mock_client:
            mock_client.return_value.messages.create.return_value.sid = "SM123"
            send_sms("3015550199", "Hello", user=self.user)
        mock_client.return_value.messages.create.assert_called_once()

    def test_serializer_reports_opted_out(self):
        from .serializers import ContactSerializer
        from .utils import set_contacts_opt_out

        set_contacts_opt_out("+13015550199", True)
        self.contact.refresh_from_db()
        self.assertTrue(ContactSerializer(self.contact).data["opted_out"])

    def test_webhook_stop_then_start(self):
        client = APIClient()
        client.post("/api/communicator/sms-webhook/", {"From": "+13015550199", "Body": "STOP"})
        self.contact.refresh_from_db()
        self.assertTrue(self.contact.sms_opt_out)
        client.post("/api/communicator/sms-webhook/", {"From": "+13015550199", "Body": "START"})
        self.contact.refresh_from_db()
        self.assertFalse(self.contact.sms_opt_out)
