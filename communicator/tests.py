from django.contrib.auth import get_user_model
from django.test import TestCase
from .models import Contact


class ContactModelTest(TestCase):
    def test_create_contact(self):
        User = get_user_model()
        user = User.objects.create_user(username='tester', password='pass')
        contact = Contact.objects.create(name='John', phone='123', email='a@b.com', uploaded_by=user)
        self.assertEqual(contact.uploaded_by, user)
        self.assertEqual(Contact.objects.count(), 1)
