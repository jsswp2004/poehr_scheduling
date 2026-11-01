from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Organization, Patient

from . import registration_config as rc
from . import registration_tabs as rt
from .models import PatientContact, PatientEmployer, PatientGuarantor

User = get_user_model()


def make_user(username, role, org):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org
    )


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside Clinic")
        self.other = Organization.objects.create(name="Other Clinic")
        self.registrar = make_user("reg", "registrar", self.org)
        self.outsider = make_user("out", "registrar", self.other)
        self.patient_user = make_user("pat", "patient", self.org)
        self.patient = Patient.objects.get(user=self.patient_user)  # created with the patient login
        self.patient.organization = self.org
        self.patient.save()
        self.url = f"/api/registration-extras/{self.patient_user.id}/"
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client


class ExtrasReadWrite(Base):
    def test_empty_patient(self):
        data = self.as_user(self.registrar).get(self.url).json()
        self.assertEqual(data, {"contacts": [], "guarantor": None, "employer": None})

    def test_save_everything_and_read_back(self):
        body = {
            "contacts": [
                {"contact_type": "Next of kin", "name": "Denise Hale", "relationship": "Sister", "phone": "(347) 555-0108", "receives_communication": False},
                {"contact_type": "Health care proxy", "name": "Marcus Whitfield", "relationship": "Spouse", "receives_communication": True},
            ],
            "guarantor": {"is_self": False, "name": "Marcus Whitfield", "relationship": "Spouse", "phone": "718-555-0171"},
            "employer": {"employer_name": "NYC Dept of Education", "employment_status": "Full time", "occupation": "Teacher", "from_date": "2011-09-01"},
        }
        r = self.as_user(self.registrar).put(self.url, body, format="json")
        self.assertEqual(r.status_code, 200)
        data = self.as_user(self.registrar).get(self.url).json()
        self.assertEqual([c["name"] for c in data["contacts"]], ["Denise Hale", "Marcus Whitfield"])
        self.assertTrue(data["contacts"][1]["receives_communication"])
        self.assertEqual(data["guarantor"]["name"], "Marcus Whitfield")
        self.assertFalse(data["guarantor"]["is_self"])
        self.assertEqual(data["employer"]["from_date"], "2011-09-01")

    def test_contacts_are_replaced_not_added(self):
        c = self.as_user(self.registrar)
        c.put(self.url, {"contacts": [{"name": "A"}, {"name": "B"}]}, format="json")
        c.put(self.url, {"contacts": [{"name": "C"}]}, format="json")
        self.assertEqual(list(PatientContact.objects.values_list("name", flat=True)), ["C"])

    def test_order_is_kept(self):
        self.as_user(self.registrar).put(self.url, {"contacts": [{"name": "Z"}, {"name": "A"}, {"name": "M"}]}, format="json")
        self.assertEqual([c["name"] for c in self.as_user(self.registrar).get(self.url).json()["contacts"]], ["Z", "A", "M"])

    def test_a_key_left_out_is_untouched(self):
        c = self.as_user(self.registrar)
        c.put(self.url, {"contacts": [{"name": "A"}], "employer": {"employer_name": "Acme"}}, format="json")
        c.put(self.url, {"guarantor": {"is_self": True}}, format="json")
        self.assertEqual(PatientContact.objects.count(), 1)
        self.assertEqual(PatientEmployer.objects.get().employer_name, "Acme")
        self.assertTrue(PatientGuarantor.objects.get().is_self)

    def test_self_guarantor_drops_other_details(self):
        self.as_user(self.registrar).put(self.url, {"guarantor": {"is_self": True, "name": "Ignored", "phone": "1"}}, format="json")
        g = PatientGuarantor.objects.get()
        self.assertEqual((g.is_self, g.name, g.relationship, g.phone), (True, "", "Self", ""))

    def test_null_removes_guarantor_and_blank_employer_removes_employer(self):
        c = self.as_user(self.registrar)
        c.put(self.url, {"guarantor": {"is_self": True}, "employer": {"employer_name": "Acme"}}, format="json")
        c.put(self.url, {"guarantor": None, "employer": {"employer_name": "  ", "occupation": ""}}, format="json")
        self.assertEqual(PatientGuarantor.objects.count(), 0)
        self.assertEqual(PatientEmployer.objects.count(), 0)

    def test_values_are_trimmed(self):
        self.as_user(self.registrar).put(self.url, {"contacts": [{"name": "  Ana  "}]}, format="json")
        self.assertEqual(PatientContact.objects.get().name, "Ana")


class ExtrasRules(Base):
    def put(self, body):
        return self.as_user(self.registrar).put(self.url, body, format="json")

    def test_validation(self):
        cases = [
            ({"contacts": "x"}, "must be a list"),
            ({"contacts": [{"name": ""}]}, "needs a name"),
            ({"contacts": ["x"]}, "not valid"),
            ({"contacts": [{"name": "x" * 256}]}, "longer than"),
            ({"contacts": [{"name": "a"}] * 21}, "At most 20"),
            ({"guarantor": "x"}, "must be an object"),
            ({"guarantor": {"is_self": False, "name": ""}}, "needs a name"),
            ({"employer": {"employer_name": "A", "from_date": "09/01/2011"}}, "From date"),
            ({"employer": []}, "must be an object"),
        ]
        for body, text in cases:
            r = self.put(body)
            self.assertEqual(r.status_code, 400, body)
            self.assertIn(text, r.json()["detail"])
        self.assertEqual(PatientContact.objects.count(), 0)

    def test_bad_part_saves_nothing(self):
        r = self.put({"contacts": [{"name": "Good"}], "employer": {"employer_name": "A", "from_date": "nope"}})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(PatientContact.objects.count(), 0)

    def test_patients_cannot_use_it(self):
        self.assertEqual(self.as_user(self.patient_user).get(self.url).status_code, 403)

    def test_other_clinic_cannot_see_the_patient(self):
        self.assertEqual(self.as_user(self.outsider).get(self.url).status_code, 404)
        self.assertEqual(self.as_user(self.outsider).put(self.url, {"contacts": []}, format="json").status_code, 404)

    def test_unknown_patient(self):
        self.assertEqual(self.as_user(self.registrar).get("/api/registration-extras/999999/").status_code, 404)


class PatientDemographics(Base):
    def test_new_fields_save_through_the_patient_endpoint(self):
        c = self.as_user(self.registrar)
        body = {"marital_status": "Married", "race": "Asian", "city": "Brooklyn", "state": "NY", "zip_code": "11217", "directive_type": "Living will", "directive_received_date": "2026-03-02", "middle_name": "Lee"}
        r = c.patch(f"/api/users/patients/by-user/{self.patient_user.id}/edit/", body, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.patient.refresh_from_db()
        self.assertEqual((self.patient.marital_status, self.patient.zip_code, self.patient.middle_name), ("Married", "11217", "Lee"))
        got = c.get(f"/api/users/patients/by-user/{self.patient_user.id}/").json()
        self.assertEqual((got["race"], got["city"], got["directive_type"], got["directive_received_date"]), ("Asian", "Brooklyn", "Living will", "2026-03-02"))

    def test_clearing_fields_sent_as_multipart_blanks_them(self):
        # the registration form sends multipart; a cleared field arrives as an empty string
        c = self.as_user(self.registrar)
        url = f"/api/users/patients/by-user/{self.patient_user.id}/edit/"
        c.patch(url, {"marital_status": "Married", "city": "Brooklyn", "directive_received_date": "2026-03-02"}, format="json")
        r = c.patch(url, {"marital_status": "", "city": "", "directive_received_date": ""}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.patient.refresh_from_db()
        self.assertEqual((self.patient.marital_status, self.patient.city, self.patient.directive_received_date), ("", "", None))

    def test_defaults_are_blank(self):
        got = self.as_user(self.registrar).get(f"/api/users/patients/by-user/{self.patient_user.id}/").json()
        self.assertEqual((got["title"], got["address2"], got["directive_received_date"]), ("", "", None))


class CatalogTests(Base):
    def test_new_steps_in_the_default_sequence(self):
        keys = [t["key"] for t in self.as_user(self.registrar).get("/api/registration-tabs/").json()["tabs"]]
        self.assertEqual(keys[0], "identity")
        for k in ("demographics", "contacts", "guarantor", "employer"):
            self.assertIn(k, keys)

    def test_new_steps_can_be_saved_in_a_sequence(self):
        admin = make_user("adm", "admin", self.org)
        tabs = [{"key": k} for k in ("identity", "demographics", "guarantor", "logistics")]
        r = self.as_user(admin).put("/api/registration-tabs/", {"tabs": tabs}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_every_step_has_field_settings_or_is_a_known_exception(self):
        no_fields = set(rt.LABELS) - set(rc.WINDOWS)
        self.assertEqual(no_fields, {"legal"})

    def test_new_dictionaries_present_and_valid(self):
        for code in ("title", "suffix", "marital_status", "race", "ethnicity", "religion", "veteran_status", "address_type", "contact_type", "directive_type", "employment_status"):
            self.assertIn(code, rc.DICTIONARIES)
            cleaned, error = rc.clean_entries(rc.default_entries(code))
            self.assertIsNone(error, code)

    def test_new_windows_save_field_settings(self):
        admin = make_user("adm2", "admin", self.org)
        r = self.as_user(admin).put("/api/registration-fields/", {"window": "demographics", "fields": {"race": {"mode": "req"}, "state": {"label": "Province"}}}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
