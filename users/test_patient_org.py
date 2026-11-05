"""A new patient user gets an organization, and can be found by username in the patient list."""
from django.test import TestCase
from rest_framework.test import APIClient

from .models import CustomUser, Organization, Patient


class PatientOrganizationTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Reg Clinic")
        self.registrar = CustomUser.objects.create_user(
            username="reg1", password="x", role="registrar", organization=self.org
        )

    def test_new_patient_profile_takes_the_users_organization(self):
        user = CustomUser.objects.create_user(
            username="newpt", password="x", role="patient", organization=self.org
        )
        self.assertEqual(Patient.objects.get(user=user).organization_id, self.org.id)

    def test_patient_list_search_finds_a_patient_by_username(self):
        CustomUser.objects.create_user(
            username="zz_unique_login", email="other@example.com", first_name="Ann",
            last_name="Lee", password="x", role="patient", organization=self.org,
        )
        client = APIClient()
        client.force_authenticate(self.registrar)
        res = client.get("/api/users/patients/", {"search": "zz_unique_login"})
        self.assertEqual(res.status_code, 200)
        rows = res.data.get("results", res.data)
        self.assertEqual(len(rows), 1)
