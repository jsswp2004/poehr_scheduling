from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Organization, Patient, Registration

from . import registration_insurance as ri
from .models import InsuranceCarrier, InsurancePlan, InsuranceType, PatientPolicy

User = get_user_model()
SETUP = "/api/insurance-setup/"


def make_user(username, role, org):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org
    )


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside Clinic")
        self.other = Organization.objects.create(name="Other Clinic")
        self.registrar = make_user("reg", "registrar", self.org)
        self.admin = make_user("adm", "admin", self.org)
        self.outsider = make_user("out", "registrar", self.other)
        self.patient_user = make_user("pat", "patient", self.org)
        self.patient = Patient.objects.get(user=self.patient_user)
        self.patient.organization = self.org
        self.patient.save()
        self.hmo = InsuranceType.objects.create(organization=self.org, name="Commercial HMO", policy_format="ZZZZZZZZ", required_primary=True)
        self.medicare = InsuranceType.objects.create(organization=self.org, name="Medicare", policy_format="NNNNNNNNNA")
        self.ppo = InsuranceType.objects.create(organization=self.org, name="Commercial PPO")
        self.aetna = InsuranceCarrier.objects.create(organization=self.org, name="Aetna")
        self.cms = InsuranceCarrier.objects.create(organization=self.org, name="Medicare Part B")
        self.pos = InsurancePlan.objects.create(organization=self.org, carrier=self.aetna, insurance_type=self.hmo, name="Aetna Choice")
        self.medb = InsurancePlan.objects.create(organization=self.org, carrier=self.cms, insurance_type=self.medicare, name="Medicare B")
        self.ppo_plan = InsurancePlan.objects.create(organization=self.org, carrier=self.aetna, insurance_type=self.ppo, name="Aetna PPO")
        self.url = f"/api/patient-policies/{self.patient_user.id}/"
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client

    def put(self, body, user=None):
        return self.as_user(user or self.registrar).put(self.url, body, format="json")


class FormatTests(TestCase):
    def test_format_letters(self):
        self.assertTrue(ri.matches_format("NNNNNNNNNA", "123456789A"))
        self.assertFalse(ri.matches_format("NNNNNNNNNA", "12345678AA"))
        self.assertFalse(ri.matches_format("NNNNNNNNNA", "123456789"))
        self.assertTrue(ri.matches_format("AANNNNNNA", "AB123456C"))
        self.assertTrue(ri.matches_format("ZZZZ", "A1b2"))
        self.assertFalse(ri.matches_format("ZZZZ", "A1-2"))
        self.assertTrue(ri.matches_format("NNN-NN", "123-45"))
        self.assertFalse(ri.matches_format("NNN-NN", "123.45"))
        self.assertTrue(ri.matches_format("NNPNN", "12-45"))
        self.assertTrue(ri.matches_format("", "anything"))


class SetupTests(Base):
    def test_staff_can_read_admin_can_change(self):
        data = self.as_user(self.registrar).get(SETUP).json()
        self.assertEqual({t["name"] for t in data["types"]}, {"Commercial HMO", "Medicare", "Commercial PPO"})
        self.assertFalse(data["can_edit"])
        r = self.as_user(self.registrar).put(SETUP, {"kind": "carriers", "items": [{"name": "X"}]}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_add_and_change_type(self):
        c = self.as_user(self.admin)
        r = c.put(SETUP, {"kind": "types", "items": [{"name": "COBRA", "policy_format": "zzzzzzzz"}, {"id": self.medicare.pk, "name": "Medicare", "policy_format": "NNNNNNNNNA", "active": False}]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(InsuranceType.objects.get(name="COBRA").policy_format, "ZZZZZZZZ")
        self.medicare.refresh_from_db()
        self.assertFalse(self.medicare.active)

    def test_plan_needs_carrier_and_type(self):
        c = self.as_user(self.admin)
        r = c.put(SETUP, {"kind": "plans", "items": [{"name": "New plan"}]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("carrier and an insurance type", r.json()["detail"])
        ok = c.put(SETUP, {"kind": "plans", "items": [{"name": "New plan", "carrier": self.aetna.pk, "insurance_type": self.ppo.pk}]}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(InsurancePlan.objects.filter(name="New plan").exists())

    def test_rules(self):
        c = self.as_user(self.admin)
        cases = [
            ({"kind": "zzz", "items": []}, "Unknown kind"),
            ({"kind": "types", "items": "x"}, "must be a list"),
            ({"kind": "types", "items": [{"name": " "}]}, "needs a name"),
            ({"kind": "types", "items": [{"name": "A"}, {"name": "a"}]}, "twice"),
            ({"kind": "types", "items": [{"name": "Medicare"}]}, "already exists"),
            ({"kind": "types", "items": [{"name": "New", "policy_format": "QQ!!"}]}, "may only use"),
            ({"kind": "carriers", "items": [{"name": "x" * 121}]}, "longer than"),
        ]
        for body, text in cases:
            r = c.put(SETUP, body, format="json")
            self.assertEqual(r.status_code, 400, body)
            self.assertIn(text, r.json()["detail"])

    def test_other_clinic_sees_nothing_of_ours(self):
        data = self.as_user(self.outsider).get(SETUP).json()
        self.assertEqual(data["types"], [])


class PolicyTests(Base):
    def policy(self, plan=None, number="ABC12345", order=1, **kw):
        return {"plan": (plan or self.pos).pk, "policy_number": number, "cob_order": order, **kw}

    def test_empty(self):
        self.assertEqual(self.as_user(self.registrar).get(self.url).json(), {"policies": [], "warnings": []})

    def test_add_two_and_read_back(self):
        r = self.put({"policies": [self.policy(), self.policy(self.medb, "123456789A", 2, insured_person="Self", effective_date="2026-04-01")]})
        self.assertEqual(r.status_code, 200, r.content)
        rows = r.json()["policies"]
        self.assertEqual([(p["plan_name"], p["cob_order"], p["status"]) for p in rows], [("Aetna Choice", 1, "Active"), ("Medicare B", 2, "Active")])
        self.assertEqual(rows[0]["carrier_name"], "Aetna")
        self.assertEqual(rows[1]["effective_date"], "2026-04-01")

    def test_update_by_id_keeps_other_policies(self):
        first = self.put({"policies": [self.policy(), self.policy(self.medb, "123456789A", 2)]}).json()["policies"]
        r = self.put({"policies": [{**self.policy(self.medb, "123456789B", 2), "id": first[1]["id"]}]})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(PatientPolicy.objects.count(), 2)
        self.assertEqual(PatientPolicy.objects.get(pk=first[1]["id"]).policy_number, "123456789B")

    def test_number_must_match_format(self):
        r = self.put({"policies": [self.policy(self.medb, "12345", 1)]})
        self.assertEqual(r.status_code, 400)
        self.assertIn("must match NNNNNNNNNA", r.json()["detail"])
        self.assertEqual(PatientPolicy.objects.count(), 0)

    def test_two_current_policies_cannot_share_an_order(self):
        r = self.put({"policies": [self.policy(), self.policy(self.medb, "123456789A", 1)]})
        self.assertEqual(r.status_code, 400)
        self.assertIn("COB order 1", r.json()["detail"])
        self.assertEqual(PatientPolicy.objects.count(), 0)

    def test_required_primary_type_must_be_order_one(self):
        r = self.put({"policies": [self.policy(self.medb, "123456789A", 1), self.policy(self.pos, "ABC12345", 2)]})
        self.assertEqual(r.status_code, 400)
        self.assertIn("has to be the primary", r.json()["detail"])

    def test_same_type_twice_warns(self):
        r = self.put({"policies": [self.policy(self.ppo_plan, "X1", 1), self.policy(self.ppo_plan, "X2", 2)]})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(any("More than one current Commercial PPO" in w for w in r.json()["warnings"]))

    def test_ended_policy_is_history_and_frees_its_order(self):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        r = self.put({"policies": [self.policy(end_date=yesterday), self.policy(self.medb, "123456789A", 1)]})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual({p["plan_name"]: p["status"] for p in r.json()["policies"]}, {"Aetna Choice": "History", "Medicare B": "Active"})

    def test_end_before_start_refused(self):
        r = self.put({"policies": [self.policy(effective_date="2026-05-01", end_date="2026-04-01")]})
        self.assertEqual(r.status_code, 400)

    def test_bad_input(self):
        for body, text in [
            ({"policies": [{"plan": 999999, "policy_number": "x"}]}, "Pick a plan"),
            ({"policies": [self.policy(number=" ")]}, "needs a policy number"),
            ({"policies": [self.policy(order=0)]}, "between 1 and 9"),
            ({"policies": [self.policy(order="x")]}, "must be a number"),
            ({"policies": [self.policy(effective_date="04/01/2026")]}, "Dates must"),
            ({"policies": "x"}, "must be lists"),
        ]:
            r = self.put(body)
            self.assertEqual(r.status_code, 400, body)
            self.assertIn(text, r.json()["detail"])

    def test_a_plan_from_another_clinic_is_refused(self):
        foreign = InsurancePlan.objects.create(
            organization=self.other,
            carrier=InsuranceCarrier.objects.create(organization=self.other, name="Z"),
            insurance_type=InsuranceType.objects.create(organization=self.other, name="T"),
            name="Foreign",
        )
        r = self.put({"policies": [{"plan": foreign.pk, "policy_number": "1"}]})
        self.assertEqual(r.status_code, 400)

    def test_delete_unused_policy_but_not_one_used_on_a_visit(self):
        rows = self.put({"policies": [self.policy(), self.policy(self.medb, "123456789A", 2)]}).json()["policies"]
        visit = Registration.objects.create(patient=self.patient, organization=self.org, visit_policy=PatientPolicy.objects.get(pk=rows[0]["id"]))
        r = self.put({"delete_ids": [rows[0]["id"]]})
        self.assertEqual(r.status_code, 400)
        self.assertIn("End it instead", r.json()["detail"])
        ok = self.put({"delete_ids": [rows[1]["id"]]})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(PatientPolicy.objects.count(), 1)
        visit.refresh_from_db()
        self.assertIsNotNone(visit.visit_policy_id)

    def test_other_clinic_and_patients_are_kept_out(self):
        self.assertEqual(self.as_user(self.outsider).get(self.url).status_code, 404)
        self.assertEqual(self.as_user(self.patient_user).get(self.url).status_code, 403)


class VisitInsuranceTests(Base):
    def test_visit_carries_policy_authorization_and_copay(self):
        pol = PatientPolicy.objects.create(patient=self.patient, plan=self.pos, policy_number="ABC12345")
        c = self.as_user(self.registrar)
        r = c.post("/api/users/registrations/", {"patient": self.patient.pk, "visit_policy": pol.pk, "authorization_number": "AUTH-9", "copay_due": "30.00"}, format="json")
        self.assertIn(r.status_code, (200, 201), r.content)
        got = r.json()
        self.assertEqual((got["visit_policy"], got["authorization_number"], got["copay_due"]), (pol.pk, "AUTH-9", "30.00"))

    def test_policy_of_another_patient_is_refused(self):
        other_user = make_user("pat2", "patient", self.org)
        other = Patient.objects.get(user=other_user)
        pol = PatientPolicy.objects.create(patient=other, plan=self.pos, policy_number="ABC12345")
        r = self.as_user(self.registrar).post("/api/users/registrations/", {"patient": self.patient.pk, "visit_policy": pol.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("visit_policy", r.json())
