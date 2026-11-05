from django.test import TestCase
from rest_framework.test import APIClient

from appointments.models import Facility
from users.models import CustomUser, Organization

URL = "/api/users/mds/session/"


def make_user(org, role, username):
    return CustomUser.objects.create_user(username=username, password="pw12345!", role=role, organization=org, email=f"{username}@x.com")


class MdsSessionTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverbend Group")
        self.other = Organization.objects.create(name="Other Co")
        self.f1 = Facility.objects.create(organization=self.org, name="Riverbend North")
        self.f2 = Facility.objects.create(organization=self.org, name="Riverbend South")
        Facility.objects.create(organization=self.other, name="Not Yours")
        self.nurse = make_user(self.org, "nurse", "nurse1")

    def get(self, user):
        client = APIClient()
        if user:
            client.force_authenticate(user)
        return client.get(URL)

    def test_requires_sign_in(self):
        self.assertEqual(self.get(None).status_code, 401)

    def test_nurse_gets_identity_organization_and_all_facilities(self):
        r = self.get(self.nurse)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["user_id"], self.nurse.pk)
        self.assertEqual(r.data["role"], "nurse")
        self.assertEqual(r.data["organization"], {"id": self.org.pk, "name": "Riverbend Group"})
        self.assertEqual([f["name"] for f in r.data["facilities"]], ["Riverbend North", "Riverbend South"])

    def test_assigned_nurse_only_gets_assigned_facilities(self):
        self.nurse.facilities.add(self.f2)
        r = self.get(self.nurse)
        self.assertEqual([f["id"] for f in r.data["facilities"]], [self.f2.pk])

    def test_other_roles_are_refused(self):
        for role in ("patient", "staff", "registrar", "receptionist"):
            r = self.get(make_user(self.org, role, f"u_{role}"))
            self.assertEqual(r.status_code, 403, role)
            self.assertEqual(r.data["code"], "role_not_allowed")

    def test_module_must_be_on_for_the_organization(self):
        self.org.enabled_modules = ["scheduling"]
        self.org.save()
        r = self.get(self.nurse)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data["code"], "module_not_enabled")
        self.org.enabled_modules = ["scheduling", "mds"]
        self.org.save()
        self.assertEqual(self.get(self.nurse).status_code, 200)

    def test_never_configured_organization_has_everything(self):
        self.org.enabled_modules = None
        self.org.save()
        self.assertEqual(self.get(self.nurse).status_code, 200)

    def test_system_admin_is_not_blocked_by_modules(self):
        self.org.enabled_modules = ["scheduling"]
        self.org.save()
        admin = make_user(self.org, "system_admin", "sysadmin")
        self.assertEqual(self.get(admin).status_code, 200)
