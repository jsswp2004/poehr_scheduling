from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization, OrganizationAccessChange
from users.modules import (
    BASE_PRICE, EXTRA_MODULE_PRICE, enabled_codes, module_for_path, monthly_total, plan_key,
)


def make_org(name="Org", **kw):
    return Organization.objects.create(name=name, **kw)


def make_user(org, role, username):
    return CustomUser.objects.create_user(username=username, password="pw12345!", role=role, organization=org, email=f"{username}@x.com")


class PricingTests(TestCase):
    def test_total(self):
        self.assertEqual(monthly_total([]), BASE_PRICE)
        self.assertEqual(monthly_total(["scheduling"]), 299)
        self.assertEqual(monthly_total(["scheduling", "staffing", "telehealth"]), 299 + 2 * EXTRA_MODULE_PRICE)
        self.assertEqual(monthly_total(["scheduling", "lab_interface"]), 299)  # lab is quoted separately

    def test_plan_key(self):
        self.assertEqual(plan_key("Clinic"), "premium")
        self.assertEqual(plan_key("Group"), "enterprise")
        self.assertEqual(plan_key("premium"), "premium")
        self.assertEqual(plan_key("nonsense"), "basic")

    def test_routes(self):
        self.assertIsNone(module_for_path("/api/staffing/custom-reports/x/"))  # Reports always on
        self.assertEqual(module_for_path("/api/staffing/shifts/"), "staffing")
        self.assertIsNone(module_for_path("/api/communicator/announcements/"))
        self.assertEqual(module_for_path("/api/communicator/messages/"), "communicator")
        self.assertIsNone(module_for_path("/api/users/me/"))
        self.assertIsNone(module_for_path("/static/x"))

    def test_unconfigured_org_has_all(self):
        org = make_org("A")
        self.assertIn("telehealth", enabled_codes(org))


class AccessApiTests(TestCase):
    def setUp(self):
        self.org = make_org("Clinic A", subscription_tier="premium", max_users=10, enabled_modules=["scheduling", "staffing"])
        self.admin = make_user(self.org, "admin", "adm")
        self.sysadmin = make_user(self.org, "system_admin", "sys")
        self.c = APIClient()

    def test_catalog_public(self):
        r = self.c.get("/api/users/modules/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["pricing"]["base"], 299)

    def test_org_admin_reads_not_writes(self):
        self.c.force_authenticate(self.admin)
        r = self.c.get("/api/users/organization-access/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["can_edit"])
        self.assertEqual(r.json()["pricing"]["monthly_total"], 449)
        r = self.c.patch("/api/users/organization-access/", {"modules": ["scheduling"]}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_other_roles_denied(self):
        self.c.force_authenticate(make_user(self.org, "doctor", "doc"))
        self.assertEqual(self.c.get("/api/users/organization-access/").status_code, 403)

    @mock.patch("users.org_access.sync_module_billing", return_value=(True, "ok"))
    def test_sysadmin_changes_and_logs(self, sync):
        self.c.force_authenticate(self.sysadmin)
        r = self.c.patch(
            f"/api/users/organization-access/?organization={self.org.id}",
            {"modules": ["scheduling", "dictation"], "plan": "enterprise"}, format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.org.refresh_from_db()
        self.assertEqual(self.org.enabled_modules, ["scheduling", "dictation"])
        self.assertTrue(self.org.dictation_enabled)
        self.assertEqual(self.org.subscription_tier, "enterprise")
        self.assertGreater(self.org.max_users, 10)
        texts = " | ".join(OrganizationAccessChange.objects.values_list("summary", flat=True))
        self.assertIn("turned off", texts)
        self.assertIn("turned on", texts)
        self.assertIn("Plan changed", texts)
        sync.assert_called_once()

    def test_limit_below_count_rejected(self):
        self.c.force_authenticate(self.sysadmin)
        r = self.c.patch(f"/api/users/organization-access/?organization={self.org.id}", {"user_limit": 1}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_unknown_module_rejected(self):
        self.c.force_authenticate(self.sysadmin)
        r = self.c.patch(f"/api/users/organization-access/?organization={self.org.id}", {"modules": ["nope"]}, format="json")
        self.assertEqual(r.status_code, 400)


class EnforcementTests(TestCase):
    def setUp(self):
        self.org = make_org("Only Sched", subscription_tier="premium", max_users=10, enabled_modules=["scheduling"])
        self.doc = make_user(self.org, "admin", "adm2")
        self.sys = make_user(self.org, "system_admin", "sys2")

    def test_blocked_module(self):
        c = APIClient()
        c.force_authenticate(self.doc)
        # force_authenticate bypasses our authentication class, so exercise the gate directly
        from poehr_scheduling_backend.tenancy import TenantAwareJWTAuthentication
        from rest_framework.exceptions import PermissionDenied
        from rest_framework.test import APIRequestFactory

        auth = TenantAwareJWTAuthentication()
        req = APIRequestFactory().get("/api/staffing/shifts/")
        with self.assertRaises(PermissionDenied):
            auth._enforce_module(req, self.doc)
        auth._enforce_module(req, self.sys)  # system admin exempt
        auth._enforce_module(APIRequestFactory().get("/api/appointments/"), self.doc)
        auth._enforce_module(APIRequestFactory().get("/api/communicator/announcements/"), self.doc)


class SignUpTests(TestCase):
    def test_enrollment_sets_plan_and_modules(self):
        with mock.patch("users.views.StripeService") as svc:
            svc.return_value.create_customer.return_value = mock.Mock(id="cus_1")
            svc.return_value.create_organization_trial_subscription.return_value = mock.Mock(id="sub_1")
            r = APIClient().post("/api/auth/register/", {
                "username": "newadm", "password": "Str0ng!pass99", "email": "n@x.com", "first_name": "N", "last_name": "A",
                "is_enrollment": True, "organization_name": "Fresh Clinic", "organization_type": "clinic",
                "subscription_tier": "premium", "modules": ["clinical_documentation", "dictation"],
            }, format="json")
        self.assertIn(r.status_code, (200, 201), r.content)
        org = Organization.objects.get(name="Fresh Clinic")
        self.assertEqual(org.subscription_tier, "premium")
        self.assertEqual(org.max_users, 10)
        self.assertEqual(org.enabled_modules, ["clinical_documentation", "dictation"])
        self.assertTrue(org.dictation_enabled)

    def test_user_limit_enforced(self):
        org = make_org("Solo", subscription_tier="basic", max_users=1)
        admin = make_user(org, "admin", "solo")
        c = APIClient()
        c.force_authenticate(admin)
        r = c.post("/api/auth/register/", {"username": "second", "password": "Str0ng!pass99", "email": "s@x.com", "role": "doctor"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json().get("code"), "user_limit_reached")


class NormalizeMigrationTests(TestCase):
    def test_repairs_display_names_and_limits(self):
        import importlib

        from django.apps import apps

        mig = importlib.import_module("users.migrations.0049_normalize_plans_and_limits")
        clinic = make_org("C1", subscription_tier="Clinic", max_users=1)
        group = make_org("G1", subscription_tier="Group", max_users=1)
        solo = make_org("S1", subscription_tier="basic", max_users=1)
        for i in range(3):
            make_user(solo, "doctor", f"d{i}")  # already over its limit: must not shrink or lock out
        mig.normalize(apps, None)
        for o in (clinic, group, solo):
            o.refresh_from_db()
        self.assertEqual((clinic.subscription_tier, clinic.max_users), ("premium", 10))
        self.assertEqual(group.subscription_tier, "enterprise")
        self.assertGreaterEqual(group.max_users, 999999)
        self.assertEqual(solo.max_users, 3)
