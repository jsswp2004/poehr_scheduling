"""
Tests for the optional nursing_role column on the Staff Roster CSV upload.

    python manage.py test staffing.test_staff_csv_upload
"""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization

from .models import Staff

URL = "/api/staffing/staff/upload-csv/"
HEADER = "first_name,last_name,profession,nursing_role,email,phone_number\n"


def upload(user, text):
    c = APIClient()
    c.force_authenticate(user)
    f = SimpleUploadedFile("roster.csv", text.encode("utf-8"), content_type="text/csv")
    return c.post(URL, {"file": f}, format="multipart")


class NursingRoleCsvTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org A")
        self.admin = CustomUser.objects.create_user(
            username="a", password="x", role="admin", organization=self.org)

    def role_of(self, first, last):
        return Staff.objects.get(organization=self.org, first_name=first, last_name=last).nursing_role

    def test_roles_are_saved_with_common_spellings(self):
        r = upload(self.admin, HEADER + (
            "Ann,One,Nurse,rn,,\n"
            "Bob,Two,Nurse,Registered Nurse,,\n"
            "Cy,Three,Nurse,LPN,,\n"
            "Di,Four,Aide,GNA,,\n"
            "Ed,Five,Aide,CNA / support,,\n"
            "Flo,Six,Physician,other,,\n"
        ))
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["errors"], [])
        self.assertEqual(body["created"], 6)
        self.assertEqual(body["nursing_roles_set"], 6)
        self.assertEqual(self.role_of("Ann", "One"), "rn")
        self.assertEqual(self.role_of("Bob", "Two"), "rn")
        self.assertEqual(self.role_of("Cy", "Three"), "lpn")
        self.assertEqual(self.role_of("Di", "Four"), "cna")
        self.assertEqual(self.role_of("Ed", "Five"), "cna")
        self.assertEqual(self.role_of("Flo", "Six"), "other")
        # only the physician is "other"
        self.assertEqual(body["not_counted"], 1)

    def test_blank_role_defaults_to_other_for_new_staff(self):
        r = upload(self.admin, HEADER + "Gus,Seven,Nurse,,,\n")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.role_of("Gus", "Seven"), "other")
        self.assertEqual(r.json()["nursing_roles_set"], 0)
        self.assertEqual(r.json()["not_counted"], 1)

    def test_blank_role_does_not_overwrite_existing_role(self):
        upload(self.admin, HEADER + "Hal,Eight,Nurse,rn,,\n")
        r = upload(self.admin, HEADER + "Hal,Eight,Nurse,,,\n")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["updated"], 1)
        self.assertEqual(self.role_of("Hal", "Eight"), "rn")
        self.assertEqual(r.json()["not_counted"], 0)

    def test_file_without_nursing_role_column_still_works_and_keeps_roles(self):
        upload(self.admin, HEADER + "Ivy,Nine,Nurse,lpn,,\n")
        old_format = "first_name,last_name,profession,email,phone_number\nIvy,Nine,Nurse,ivy@example.com,555-0100\n"
        r = upload(self.admin, old_format)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["errors"], [])
        self.assertEqual(self.role_of("Ivy", "Nine"), "lpn")

    def test_role_can_be_changed_on_reupload(self):
        upload(self.admin, HEADER + "Jo,Ten,Nurse,lpn,,\n")
        r = upload(self.admin, HEADER + "Jo,Ten,Nurse,rn,,\n")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.role_of("Jo", "Ten"), "rn")
        self.assertEqual(Staff.objects.filter(organization=self.org).count(), 1)

    def test_unrecognised_role_saves_person_reports_row_and_keeps_role(self):
        upload(self.admin, HEADER + "Kay,Eleven,Nurse,rn,,\n")
        r = upload(self.admin, HEADER + (
            "Kay,Eleven,Nurse,registered nursey,,\n"
            "Lee,Twelve,Nurse,wizard,,\n"
            "Max,Thirteen,Nurse,cna,,\n"
        ))
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(len(body["errors"]), 2)
        self.assertIn("Row 2", body["errors"][0])
        self.assertIn("not recognised", body["errors"][0])
        self.assertIn("Row 3", body["errors"][1])
        # the bad value never changes an existing role, new people start as Other,
        # and the good row in the same file is unaffected
        self.assertEqual(self.role_of("Kay", "Eleven"), "rn")
        self.assertEqual(self.role_of("Lee", "Twelve"), "other")
        self.assertEqual(self.role_of("Max", "Thirteen"), "cna")

    def test_profession_is_never_used_to_guess_the_role(self):
        r = upload(self.admin, HEADER + "Ned,Fourteen,RN,,,\n")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.role_of("Ned", "Fourteen"), "other")

    def test_non_admin_cannot_upload(self):
        nurse = CustomUser.objects.create_user(
            username="n", password="x", role="nurse", organization=self.org)
        r = upload(nurse, HEADER + "Oz,Fifteen,Nurse,rn,,\n")
        self.assertEqual(r.status_code, 403)
        self.assertFalse(Staff.objects.filter(first_name="Oz").exists())
