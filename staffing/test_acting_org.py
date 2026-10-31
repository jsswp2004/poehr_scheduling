from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from staffing.models import Unit
from users.models import CustomUser, Organization


class StaffingFollowsChosenOrganizationTests(TestCase):
    """A system admin who chose an organization sees only its units, with no extra request parameter."""

    def setUp(self):
        self.home = Organization.objects.create(name="Home")
        self.demo = Organization.objects.create(name="Demo")
        Unit.objects.create(organization=self.home, name="Home Unit")
        Unit.objects.create(organization=self.demo, name="Demo Unit")
        self.admin = CustomUser.objects.create_user(username="sa", password="pw", role="system_admin", organization=self.home)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.admin)}")

    def _units(self):
        data = self.client.get("/api/staffing/units/").json()
        rows = data["results"] if isinstance(data, dict) and "results" in data else data
        return {u["name"] for u in rows}

    def test_before_choosing_every_organization_is_listed(self):
        self.assertEqual(self._units(), {"Home Unit", "Demo Unit"})

    def test_after_choosing_only_that_organization_is_listed(self):
        self.client.put("/api/users/acting-organization/", {"organization": self.demo.id}, format="json")
        self.assertEqual(self._units(), {"Demo Unit"})
        self.client.put("/api/users/acting-organization/", {"organization": self.home.id}, format="json")
        self.assertEqual(self._units(), {"Home Unit"})
