from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import CustomUser, Organization, OrganizationAccessChange
from users.modules import (
    BASE_PRICE, EXTRA_MODULE_PRICE, enabled_codes, module_for_path, monthly_total, normalize_codes, plan_key,
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

    def test_clinic_includes_two_services(self):
        self.assertEqual(monthly_total(["scheduling"], "premium"), 599)
        self.assertEqual(monthly_total(["scheduling", "staffing"], "premium"), 599)
        self.assertEqual(monthly_total(["scheduling", "staffing", "telehealth"], "premium"), 599 + EXTRA_MODULE_PRICE)
        self.assertEqual(monthly_total(["scheduling", "staffing", "lab_interface"], "premium"), 599)
        self.assertEqual(monthly_total(["scheduling", "staffing"], "Clinic"), 599)
        self.assertEqual(monthly_total(["scheduling", "staffing"], "basic"), 299 + EXTRA_MODULE_PRICE)

    def test_retired_codes_become_clinical_notes(self):
        self.assertEqual(
            normalize_codes(["scheduling", "orders_labs", "triage_boards", "clinical_documentation", "nonsense"]),
            ["scheduling", "clinical_documentation"],
        )
        org = make_org("Old", enabled_modules=["orders_labs", "prescriptions_referrals"])
        self.assertEqual(enabled_codes(org), ["clinical_documentation"])

    def test_orders_prescriptions_triage_routes_follow_clinical_notes(self):
        for path in ("/api/orders/1/", "/api/prescriptions/", "/api/referrals/", "/api/triage/x/", "/api/lab-reports/"):
            self.assertEqual(module_for_path(path), "clinical_documentation", path)

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
        plans = r.json()["pricing"]["plans"]
        self.assertEqual((plans["premium"]["base"], plans["premium"]["included_count"]), (599, 2))
        self.assertEqual((plans["basic"]["base"], plans["basic"]["included_count"]), (299, 1))
        self.assertTrue(plans["enterprise"]["quoted"])
        messaging = r.json()["pricing"]["messaging"]
        self.assertEqual(messaging["rates"], {"email": 0.01, "sms": 0.03})
        self.assertEqual(messaging["allowances"]["premium"], {"email": 1000, "sms": 300})
        self.assertNotIn("orders_labs", [m["code"] for m in r.json()["modules"]])

    def test_org_admin_reads_not_writes(self):
        self.c.force_authenticate(self.admin)
        r = self.c.get("/api/users/organization-access/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["can_edit"])
        self.assertEqual(r.json()["pricing"]["monthly_total"], 599)
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


class AssistantBillingTests(TestCase):
    def setUp(self):
        from users.assistant_billing import record_question

        self.record = record_question

    def test_counts_per_org_month_and_assistant(self):
        from users.assistant_billing import compute_assistant_usage

        org = make_org("A")
        other = make_org("B")
        for _ in range(3):
            self.record(org, "staffing")
        self.record(org, "scheduler")
        self.record(other, "communicator")
        u = compute_assistant_usage(org)
        self.assertEqual(u["questions"], 4)
        self.assertEqual(u["by_assistant"], {"staffing": 3, "communicator": 0, "scheduler": 1})
        self.assertEqual(u["billable"], 0)
        self.assertEqual(compute_assistant_usage(other)["questions"], 1)

    def test_overage_by_plan(self):
        from users.assistant_billing import ASSISTANT_OVERAGE_RATE, compute_assistant_usage

        org = make_org("Clinic", subscription_tier="premium")
        for _ in range(520):
            self.record(org, "staffing")
        u = compute_assistant_usage(org)
        self.assertEqual((u["included"], u["billable"]), (500, 20))
        self.assertEqual(u["cost"], round(20 * ASSISTANT_OVERAGE_RATE, 2))
        pro = make_org("Pro", subscription_tier="basic")
        for _ in range(101):
            self.record(pro, "scheduler")
        self.assertEqual(compute_assistant_usage(pro)["billable"], 1)

    def test_unknown_assistant_or_org_is_ignored(self):
        from users.models import AssistantUsage

        self.record(None, "staffing")
        self.record(make_org("C"), "bogus")
        self.assertEqual(AssistantUsage.objects.count(), 0)

    def test_other_month_not_counted(self):
        import datetime

        from django.utils import timezone

        from users.assistant_billing import compute_assistant_usage

        org = make_org("D")
        self.record(org, "staffing", when=timezone.make_aware(datetime.datetime(2026, 9, 30, 12)))
        self.record(org, "staffing", when=timezone.make_aware(datetime.datetime(2026, 10, 1, 12)))
        self.assertEqual(compute_assistant_usage(org, 2026, 9)["questions"], 1)
        self.assertEqual(compute_assistant_usage(org, 2026, 10)["questions"], 1)

    def test_catalog_and_org_payload_show_terms_and_usage(self):
        org = make_org("E", subscription_tier="premium")
        admin = make_user(org, "admin", "e_admin")
        self.record(org, "communicator")
        c = APIClient()
        pub = c.get("/api/users/modules/").json()
        self.assertEqual(pub["pricing"]["assistants"]["allowances"], {"basic": 100, "premium": 500, "enterprise": 2000})
        c.force_authenticate(admin)
        data = c.get("/api/users/organization-access/").json()
        self.assertEqual(data["usage"]["assistant"]["questions"], 1)
        self.assertEqual(data["usage"]["assistant"]["included"], 500)

    def test_report_includes_assistant_overage_in_dry_run(self):
        from users.messaging_stripe import report_monthly_messaging_usage

        org = make_org("F", subscription_tier="basic")
        make_user(org, "admin", "f_admin")
        org.users.update(stripe_customer_id="cus_test")
        for _ in range(103):
            self.record(org, "staffing")
        r = report_monthly_messaging_usage(org, dry_run=True)
        self.assertEqual(r["results"]["assistant"]["reported_units"], 3)
        self.assertTrue(r["results"]["assistant"]["identifier"].startswith("org%d-assistant-" % org.id))
        self.assertAlmostEqual(r["total_cost"], 0.15)


class AssistantCostReportTests(TestCase):
    def run_cmd(self, *args):
        from io import StringIO

        from django.core.management import call_command

        out = StringIO()
        call_command("report_assistant_cost", *args, stdout=out)
        return out.getvalue()

    def test_empty_period_says_so(self):
        out = self.run_cmd("--input-price", "1", "--output-price", "5")
        self.assertIn("nothing to price from yet", out)

    def test_average_cost_from_logged_tokens(self):
        import uuid

        from communicator.models import CommunicatorAssistantMessage as Log

        org = make_org("G")
        for tin, tout, err in ((1000, 100, ""), (3000, 300, ""), (9999, 999, "Boom")):
            Log.objects.create(organization=org, conversation_id=uuid.uuid4(), question="q", answer="a",
                               input_tokens=tin, output_tokens=tout, error=err)
        # $2 / M in, $10 / M out: (1000*2+100*10)/1e6 = 0.003 and (3000*2+300*10)/1e6 = 0.009 -> avg 0.006
        out = self.run_cmd("--input-price", "2", "--output-price", "10", "--margin", "3")
        self.assertIn("2 questions", out)
        self.assertIn("$0.0060 average per question", out)
        self.assertIn("$0.02 per question", out)
        self.assertIn(f"org {org.id}: 2 questions", out)

    def test_lists_the_models_that_answered(self):
        import uuid

        from communicator.models import CommunicatorAssistantMessage as Log

        org = make_org("H")
        for m in ("claude-sonnet-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"):
            Log.objects.create(organization=org, conversation_id=uuid.uuid4(), question="q", answer="a",
                               model=m, input_tokens=1000, output_tokens=100)
        out = self.run_cmd("--input-price", "1", "--output-price", "5")
        self.assertIn("claude-sonnet-5-5 (2), claude-haiku-5-5 (1)", out)
        self.assertIn("More than one model appears", out)


class ActingOrganizationTests(TestCase):
    """A system administrator who chooses an organization works in that organization only."""

    def setUp(self):
        self.home = make_org("Home")
        self.demo = make_org("Demo")
        self.other = make_org("Other")
        self.admin = CustomUser.objects.create_user(username="sa", password="pw", role="system_admin", organization=self.home)
        from rest_framework_simplejwt.tokens import AccessToken

        # A real token, so the request goes through the same authentication the app uses.
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.admin)}")
        for org, name in ((self.home, "h"), (self.demo, "d"), (self.other, "o")):
            CustomUser.objects.create_user(username="doc_" + name, password="pw", role="doctor", organization=org)

    def _doctors(self):
        return {d["username"] for d in self.client.get("/api/users/doctors/").json()}

    def test_without_a_choice_the_lists_span_every_organization(self):
        self.assertEqual(self._doctors(), {"doc_h", "doc_d", "doc_o"})

    def test_choosing_an_organization_limits_the_lists_to_it(self):
        r = self.client.put("/api/users/acting-organization/", {"organization": self.demo.id}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["organization"]["id"], self.demo.id)
        self.assertEqual(r.json()["own"]["id"], self.home.id)
        self.assertEqual(self._doctors(), {"doc_d"})

    def test_choosing_their_own_organization_limits_to_it_too(self):
        self.client.put("/api/users/acting-organization/", {"organization": self.home.id}, format="json")
        self.assertEqual(self._doctors(), {"doc_h"})

    def test_the_choice_never_changes_the_administrators_real_organization(self):
        self.client.put("/api/users/acting-organization/", {"organization": self.demo.id}, format="json")
        self._doctors()
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.organization_id, self.home.id)
        self.assertEqual(self.admin.role, "system_admin")

    def test_each_choice_is_logged(self):
        from users.models import ActingOrganizationLog

        self.client.put("/api/users/acting-organization/", {"organization": self.demo.id, "source": "login"}, format="json")
        self.client.put("/api/users/acting-organization/", {"organization": self.other.id}, format="json")
        rows = list(ActingOrganizationLog.objects.order_by("id").values_list("organization_name", "source"))
        self.assertEqual(rows, [("Demo", "login"), ("Other", "header")])

    def test_a_choice_is_required(self):
        r = self.client.put("/api/users/acting-organization/", {}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.put("/api/users/acting-organization/", {"organization": 999999}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_only_system_admins_can_choose(self):
        doc = CustomUser.objects.get(username="doc_d")
        c = APIClient()
        c.force_authenticate(doc)
        self.assertEqual(c.put("/api/users/acting-organization/", {"organization": self.home.id}, format="json").status_code, 403)
        self.assertEqual(c.get("/api/users/acting-organization/").status_code, 403)
        doc.refresh_from_db()
        self.assertIsNone(doc.acting_organization_id)

    def test_signing_in_clears_the_choice(self):
        self.client.put("/api/users/acting-organization/", {"organization": self.demo.id}, format="json")
        r = APIClient().post("/api/users/login/", {"username": "sa", "password": "pw"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.admin.refresh_from_db()
        self.assertIsNone(self.admin.acting_organization_id)
