from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Organization, Patient, Registration

from .models import PatientGuarantor, PaymentReceipt, VisitTransport, ZipCode

User = get_user_model()


def make_user(username, role, org):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org)


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside Clinic")
        self.other = Organization.objects.create(name="Other Clinic")
        self.registrar = make_user("reg", "registrar", self.org)
        self.nurse = make_user("nur", "nurse", self.org)
        self.doctor = make_user("doc", "doctor", self.org)
        self.admin = make_user("adm", "admin", self.org)
        self.outsider = make_user("out", "admin", self.other)
        self.patient_user = make_user("pat", "patient", self.org)
        self.patient_user.first_name, self.patient_user.last_name = "Maria", "Santos"
        self.patient_user.save()
        self.patient = Patient.objects.get(user=self.patient_user)
        self.patient.organization = self.org
        self.patient.phone_number, self.patient.address, self.patient.city = "3475550101", "12 Main St", "Brooklyn"
        self.patient.save()
        self.visit = Registration.objects.create(patient=self.patient, organization=self.org)
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client


class SettingsTests(Base):
    def test_defaults_to_us_labels(self):
        r = self.as_user(self.registrar).get("/api/registration-settings/").json()
        self.assertEqual((r["country"], r["validate_zip"], r["labels"]["zip_code"], r["labels"]["state"]), ("US", False, "Zip Code", "State"))

    def test_canada_changes_labels(self):
        r = self.as_user(self.admin).put("/api/registration-settings/", {"country": "CA", "validate_zip": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        got = self.as_user(self.nurse).get("/api/registration-settings/").json()
        self.assertEqual((got["labels"]["zip_code"], got["labels"]["state"], got["validate_zip"]), ("Postal Code", "Province", True))
        self.assertIn("Social Insurance", got["labels"]["ssn_last4"])

    def test_rules(self):
        self.assertEqual(self.as_user(self.registrar).put("/api/registration-settings/", {"country": "CA"}, format="json").status_code, 403)
        self.assertEqual(self.as_user(self.admin).put("/api/registration-settings/", {"country": "MX"}, format="json").status_code, 400)
        self.assertEqual(self.as_user(self.admin).put("/api/registration-settings/", {"country": "US", "validate_zip": "yes"}, format="json").status_code, 400)

    def test_clinics_separate(self):
        self.as_user(self.admin).put("/api/registration-settings/", {"country": "CA"}, format="json")
        self.assertEqual(self.as_user(self.outsider).get("/api/registration-settings/").json()["country"], "US")


class ZipTests(Base):
    CSV = "zip,city,state\n11201,Brooklyn,NY\n10001-1234,New York,NY\nK1A 0B1,Ottawa,ON\n"

    def imp(self, csv, **kw):
        return self.as_user(self.admin).post("/api/zip-codes/", {"csv": csv, **kw}, format="json")

    def test_preview_saves_nothing(self):
        r = self.imp(self.CSV, preview=True).json()
        self.assertEqual((r["valid"], r["new"], r["updated"], r["saved"], r["header_skipped"]), (3, 3, 0, False, True))
        self.assertEqual(ZipCode.objects.count(), 0)

    def test_import_and_lookup(self):
        r = self.imp(self.CSV).json()
        self.assertTrue(r["saved"])
        self.assertEqual(r["total"], 3)
        c = self.as_user(self.registrar)
        self.assertEqual(c.get("/api/zip-codes/", {"zip": "11201"}).json()["match"]["city"], "Brooklyn")
        self.assertEqual(c.get("/api/zip-codes/", {"zip": "10001-0000"}).json()["match"]["city"], "New York")  # ZIP+4 uses the 5 digits
        self.assertEqual(c.get("/api/zip-codes/", {"zip": "k1a0b1"}).json()["match"]["state"], "ON")
        self.assertIsNone(c.get("/api/zip-codes/", {"zip": "99999"}).json()["match"])

    def test_geonames_file_imports_as_is(self):
        text = "US\t11201\tBrooklyn\tNew York\tNY\tKings\t047\t\t\t40.69\t-73.99\t4\nUS\t00501\tHoltsville\tNew York\tNY\tSuffolk\t103\t\t\t40.81\t-73.04\t4\n"
        r = self.imp(text).json()
        self.assertEqual((r["valid"], r["error_count"], r["saved"]), (2, 0, True))
        got = self.as_user(self.registrar).get("/api/zip-codes/", {"zip": "11201"}).json()["match"]
        self.assertEqual((got["city"], got["state"]), ("Brooklyn", "NY"))

    def test_geonames_canada_file(self):
        self.imp("CA\tK1A\tOttawa\tOntario\tON\tOttawa\t\t\t\t45.4\t-75.7\t6\n")
        got = self.as_user(self.registrar).get("/api/zip-codes/", {"zip": "K1A 0B1"}).json()["match"]
        self.assertEqual((got["city"], got["state"]), ("Ottawa", "ON"))

    def test_canadian_fsa_fallback(self):
        self.imp("K1A,Ottawa,ON\n")
        got = self.as_user(self.registrar).get("/api/zip-codes/", {"zip": "K1A 9Z9"}).json()["match"]
        self.assertEqual(got["city"], "Ottawa")

    def test_reimport_updates_in_place(self):
        self.imp(self.CSV)
        r = self.imp("11201,Brooklyn Heights,NY\n11202,Brooklyn,NY\n").json()
        self.assertEqual((r["new"], r["updated"]), (1, 1))
        self.assertEqual(ZipCode.objects.get(code="11201").city, "Brooklyn Heights")
        self.assertEqual(ZipCode.objects.count(), 4)

    def test_replace(self):
        self.imp(self.CSV)
        self.imp("11201,Brooklyn,NY\n", replace=True)
        self.assertEqual(ZipCode.objects.count(), 1)

    def test_bad_rows_reported_good_rows_kept(self):
        r = self.imp("11201,Brooklyn,NY\nabc,Nowhere,NY\n11202,,NY\n11203,Queens\n").json()
        self.assertEqual((r["valid"], r["error_count"]), (1, 3))
        self.assertTrue(any("Line 2" in e for e in r["errors"]))
        self.assertEqual(ZipCode.objects.count(), 1)

    def test_empty_and_no_usable_rows(self):
        self.assertEqual(self.imp("  ").status_code, 400)
        self.assertEqual(self.imp("nope,x,y\n").status_code, 400)

    def test_only_admins_import_or_remove(self):
        self.assertEqual(self.as_user(self.registrar).post("/api/zip-codes/", {"csv": self.CSV}, format="json").status_code, 403)
        self.assertEqual(self.as_user(self.registrar).delete("/api/zip-codes/?all=1").status_code, 403)

    def test_list_filter_and_delete(self):
        self.imp(self.CSV)
        c = self.as_user(self.admin)
        self.assertEqual([z["code"] for z in c.get("/api/zip-codes/", {"q": "10"}).json()["results"]], ["10001"])
        self.assertEqual(c.delete("/api/zip-codes/?code=10001").json()["total"], 2)
        self.assertEqual(c.delete("/api/zip-codes/?code=00000").status_code, 404)
        self.assertEqual(c.delete("/api/zip-codes/?all=1").json()["total"], 0)

    def test_clinics_separate(self):
        self.imp(self.CSV)
        self.assertIsNone(self.as_user(self.outsider).get("/api/zip-codes/", {"zip": "11201"}).json()["match"])


class TransportTests(Base):
    url = property(lambda self: f"/api/visit-transport/{self.visit.pk}/")

    def test_blank_then_save(self):
        c = self.as_user(self.registrar)
        self.assertEqual(c.get(self.url).json()["needed"], "")
        r = c.put(self.url, {"needed": "yes", "reason": "Dialysis", "provider": "Wheelchair van", "pickup_location": "12 Main St", "pickup_time": "2026-11-03T09:30"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        got = c.get(self.url).json()
        self.assertEqual((got["needed"], got["reason"], got["pickup_time"]), ("yes", "Dialysis", "2026-11-03T09:30"))
        self.assertEqual(VisitTransport.objects.count(), 1)

    def test_no_clears_the_details(self):
        c = self.as_user(self.registrar)
        c.put(self.url, {"needed": "yes", "reason": "Dialysis"}, format="json")
        c.put(self.url, {"needed": "no", "reason": "Dialysis"}, format="json")
        t = VisitTransport.objects.get()
        self.assertEqual((t.needed, t.reason), ("no", ""))

    def test_rules(self):
        c = self.as_user(self.registrar)
        self.assertEqual(c.put(self.url, {"needed": "maybe"}, format="json").status_code, 400)
        self.assertEqual(c.put(self.url, {"needed": "yes", "pickup_time": "tomorrow"}, format="json").status_code, 400)
        self.assertEqual(c.put(self.url, {"needed": "yes", "notes": "x" * 501}, format="json").status_code, 400)

    def test_other_clinic_and_patient_role_kept_out(self):
        self.assertEqual(self.as_user(self.outsider).get(self.url).status_code, 404)
        self.assertEqual(self.as_user(self.patient_user).get(self.url).status_code, 403)


class PaymentTests(Base):
    url = property(lambda self: f"/api/payments/{self.patient_user.id}/")

    def pay(self, user=None, **kw):
        body = {"payment_type": "Copay", "method": "Cash", "amount": "25.00", "visit": self.visit.pk, **kw}
        return self.as_user(user or self.registrar).post(self.url, body, format="json")

    def test_receipts_are_numbered_in_order(self):
        a = self.pay().json()["receipt"]
        b = self.pay(amount="10").json()["receipt"]
        self.assertEqual((a["number"], b["number"]), ("R-000001", "R-000002"))
        self.assertEqual((a["clinic"], a["patient_name"], a["received_by"], a["visit"]), ("Riverside Clinic", "Maria Santos", "reg", self.visit.pk))

    def test_numbers_are_per_clinic(self):
        self.pay()
        other_user = make_user("pat9", "patient", self.other)
        p = Patient.objects.get(user=other_user)
        p.organization = self.other
        p.save()
        r = self.as_user(self.outsider).post(f"/api/payments/{other_user.id}/", {"payment_type": "Copay", "method": "Cash", "amount": "5"}, format="json")
        self.assertEqual(r.json()["receipt"]["number"], "R-000001")

    def test_total_ignores_void(self):
        r1 = self.pay().json()["receipt"]
        self.pay(amount="10.50")
        v = self.as_user(self.registrar).post(f"/api/payment-void/{r1['id']}/", {"reason": "Entered twice"}, format="json")
        self.assertEqual(v.status_code, 200, v.content)
        listed = self.as_user(self.registrar).get(self.url).json()
        self.assertEqual(listed["total_collected"], "10.50")
        self.assertEqual(len(listed["receipts"]), 2)
        self.assertTrue(next(r for r in listed["receipts"] if r["id"] == r1["id"])["voided"])

    def test_void_rules(self):
        r1 = self.pay().json()["receipt"]
        url = f"/api/payment-void/{r1['id']}/"
        self.assertEqual(self.as_user(self.nurse).post(url, {"reason": "x"}, format="json").status_code, 403)
        self.assertEqual(self.as_user(self.registrar).post(url, {"reason": " "}, format="json").status_code, 400)
        self.assertEqual(self.as_user(self.outsider).post(url, {"reason": "x"}, format="json").status_code, 404)
        self.as_user(self.registrar).post(url, {"reason": "x"}, format="json")
        self.assertEqual(self.as_user(self.registrar).post(url, {"reason": "again"}, format="json").status_code, 400)

    def test_amount_rules(self):
        for amount, text in [("0", "more than zero"), ("-5", "more than zero"), ("abc", "as a number"), ("1.234", "two decimal"), ("100000", "too large"), ("NaN", "")]:
            r = self.pay(amount=amount)
            self.assertEqual(r.status_code, 400, amount)
            if text:
                self.assertIn(text, r.json()["detail"])
        self.assertEqual(PaymentReceipt.objects.count(), 0)

    def test_type_and_method_required(self):
        self.assertEqual(self.pay(payment_type="").status_code, 400)
        self.assertEqual(self.pay(method=" ").status_code, 400)

    def test_roles(self):
        self.assertEqual(self.pay(user=self.doctor).status_code, 403)
        self.assertEqual(self.pay(user=self.nurse).status_code, 201)
        self.assertEqual(self.as_user(self.doctor).get(self.url).status_code, 200)

    def test_visit_must_belong_to_patient(self):
        stranger_user = make_user("pat2", "patient", self.org)
        stranger = Patient.objects.get(user=stranger_user)
        v = Registration.objects.create(patient=stranger, organization=self.org)
        self.assertEqual(self.pay(visit=v.pk).status_code, 404)

    def test_other_clinic_kept_out(self):
        self.assertEqual(self.as_user(self.outsider).get(self.url).status_code, 404)


class NewbornTests(Base):
    url = "/api/newborn-registration/"

    def body(self, **kw):
        return {"mother": self.patient.pk, "first_name": "Luz", "date_of_birth": timezone.localdate().isoformat(), "legal_sex": "F", "gestational_age_weeks": 38, "birth_weight_g": 3200, "create_visit": True, **kw}

    def test_creates_baby_under_the_mother(self):
        r = self.as_user(self.registrar).post(self.url, self.body(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        out = r.json()
        baby = Patient.objects.get(pk=out["patient"]["id"])
        self.assertEqual((baby.mother_id, baby.organization_id, baby.legal_sex, baby.birth_weight_g, baby.city), (self.patient.pk, self.org.pk, "F", 3200, "Brooklyn"))
        self.assertEqual((baby.user.first_name, baby.user.last_name), ("Luz", "Santos"))
        g = PatientGuarantor.objects.get(patient=baby)
        self.assertEqual((g.is_self, g.name, g.relationship, g.phone), (False, "Maria Santos", "Mother", "3475550101"))
        self.assertTrue(Registration.objects.filter(pk=out["visit"], patient=baby, reason_for_visit="Newborn").exists())
        self.assertTrue(baby.mrn)

    def test_visit_is_optional(self):
        r = self.as_user(self.registrar).post(self.url, self.body(create_visit=False), format="json")
        self.assertIsNone(r.json()["visit"])

    def test_baby_cannot_log_in(self):
        out = self.as_user(self.registrar).post(self.url, self.body(), format="json").json()
        self.assertFalse(User.objects.get(pk=out["patient"]["user_id"]).has_usable_password())

    def test_rules(self):
        c = self.as_user(self.registrar)
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        for patch, text in [({"first_name": " "}, "first name"), ({"date_of_birth": ""}, "date of birth"), ({"date_of_birth": tomorrow}, "future"), ({"legal_sex": "Q"}, "M, F or X"), ({"gestational_age_weeks": 10}, "20 and 45"), ({"birth_weight_g": 50}, "200 and 7000"), ({"birth_weight_g": "heavy"}, "whole numbers")]:
            r = c.post(self.url, self.body(**patch), format="json")
            self.assertEqual(r.status_code, 400, patch)
            self.assertIn(text, r.json()["detail"])
        self.assertEqual(Patient.objects.filter(mother__isnull=False).count(), 0)

    def test_twin_with_a_different_name_is_allowed_same_baby_twice_is_not(self):
        c = self.as_user(self.registrar)
        self.assertEqual(c.post(self.url, self.body(), format="json").status_code, 201)
        self.assertEqual(c.post(self.url, self.body(first_name="Sol"), format="json").status_code, 201)
        r = c.post(self.url, self.body(first_name="luz"), format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("already registered", r.json()["detail"])

    def test_mother_must_exist_and_be_in_the_clinic(self):
        self.assertEqual(self.as_user(self.registrar).post(self.url, self.body(mother=99999), format="json").status_code, 404)
        self.assertEqual(self.as_user(self.outsider).post(self.url, self.body(), format="json").status_code, 404)

    def test_a_newborn_cannot_be_a_mother(self):
        out = self.as_user(self.registrar).post(self.url, self.body(), format="json").json()
        r = self.as_user(self.registrar).post(self.url, self.body(mother=out["patient"]["id"], first_name="Zed"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_patients_cannot_register_babies(self):
        self.assertEqual(self.as_user(self.patient_user).post(self.url, self.body(), format="json").status_code, 403)
