"""Header search: patients, MRNs, visits, close spellings, clinic isolation and the audit log."""

from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Organization, Patient, Registration

from . import global_search
from .models import SearchAudit

User = get_user_model()
URL = "/api/search/"


def make_user(username, role, org, **extra):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org, **extra)


def make_patient(org, first, last, dob=None, phone=""):
    user = make_user(f"{first}{last}{org.pk}".lower(), "patient", org, first_name=first, last_name=last)
    Patient.objects.filter(user=user).update(organization=org, date_of_birth=dob, phone_number=phone)
    return Patient.objects.get(user=user)


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other = Organization.objects.create(name="Clinic B")
        self.doc = make_user("doc", "doctor", self.org, first_name="Dana", last_name="Chen")
        self.nurse = make_user("nurse", "nurse", self.org)
        self.maria = make_patient(self.org, "Maria", "Santos", date(1972, 3, 14), "(301) 880-6015")
        self.roberto = make_patient(self.org, "Roberto", "Santos", date(2017, 6, 2))
        self.lucia = make_patient(self.org, "Lucia", "Santos-Rivera", date(1994, 11, 19))
        self.smith = make_patient(self.org, "James", "Smith", date(1957, 1, 5))
        self.stranger = make_patient(self.other, "Maria", "Santos", date(1980, 1, 1))
        self.visit = Registration.objects.create(patient=self.maria, organization=self.org, care_setting="acute", attending_provider=self.doc)
        self.old = Registration.objects.create(patient=self.maria, organization=self.org, care_setting="emergency", discharge_datetime="2026-03-03T10:00:00Z")
        # the newest visit is the open acute one
        Registration.objects.filter(pk=self.old.pk).update(created_at="2026-03-03T06:42:00Z")

    def client_for(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def get(self, q="", user=None, **params):
        return (self.client_for(user or self.doc)).get(URL, {"q": q, **params})


class RecognisingTests(TestCase):
    def test_what_was_typed(self):
        self.assertEqual(global_search.detect("MRN-000142"), ("mrn", 142))
        self.assertEqual(global_search.detect("mrn 142"), ("mrn", 142))
        self.assertEqual(global_search.detect("VN-000231"), ("vn", 231))
        self.assertEqual(global_search.detect("03/14/1972"), ("dob", date(1972, 3, 14)))
        self.assertEqual(global_search.detect("1972-03-14"), ("dob", date(1972, 3, 14)))
        self.assertEqual(global_search.detect("(301) 880-6015"), ("phone", "3018806015"))
        self.assertEqual(global_search.detect("6015"), ("phone", "6015"))
        self.assertEqual(global_search.detect("santos, maria"), ("name", "santos, maria"))


class SearchTests(Base):
    def test_name_finds_patients_with_their_visits(self):
        data = self.get("santos").data
        names = [r["full_name"] for r in data["patients"]]
        self.assertEqual(sorted(names), ["Lucia Santos-Rivera", "Maria Santos", "Roberto Santos"])
        self.assertTrue(data["visits"])
        self.assertTrue(all(v["full_name"] == "Maria Santos" for v in data["visits"]))
        maria = next(r for r in data["patients"] if r["full_name"] == "Maria Santos")
        self.assertEqual(maria["badge"], "In house")
        self.assertEqual(maria["visit"]["visit_number"], self.visit.visit_number)
        self.assertEqual(maria["mrn"], self.maria.mrn)

    def test_words_in_any_order_and_with_a_comma(self):
        for q in ("Santos Maria", "santos, maria", "maria s"):
            data = self.get(q).data
            self.assertEqual([r["full_name"] for r in data["patients"]], ["Maria Santos"], q)

    def test_exact_mrn_is_flagged_for_enter(self):
        data = self.get(self.maria.mrn).data
        self.assertEqual(data["kind"], "mrn")
        self.assertTrue(data["exact"])
        self.assertEqual(len(data["patients"]), 1)

    def test_exact_visit_number_opens_that_visit(self):
        data = self.get(self.old.visit_number).data
        self.assertEqual(data["kind"], "vn")
        self.assertTrue(data["exact"])
        self.assertEqual([v["id"] for v in data["visits"]], [self.old.pk])
        self.assertFalse(data["visits"][0]["is_current"])
        self.assertEqual(self.get(self.visit.visit_number).data["visits"][0]["is_current"], True)

    def test_date_of_birth_and_phone(self):
        self.assertEqual([r["full_name"] for r in self.get("03/14/1972").data["patients"]], ["Maria Santos"])
        self.assertEqual([r["full_name"] for r in self.get("301-880-6015").data["patients"]], ["Maria Santos"])
        self.assertEqual([r["full_name"] for r in self.get("6015").data["patients"]], ["Maria Santos"])

    def test_no_match_offers_close_spellings(self):
        data = self.get("smyth").data
        self.assertEqual(data["patients"], [])
        self.assertEqual([r["full_name"] for r in data["suggestions"]], ["James Smith"])

    def test_care_setting_filter(self):
        data = self.get("santos", care="acute").data
        self.assertEqual([r["full_name"] for r in data["patients"]], ["Maria Santos"])
        self.assertEqual(self.get("santos", care="emergency").data["patients"], [])

    def test_only_my_clinic(self):
        data = self.get("santos").data
        self.assertNotIn(self.stranger.mrn, [r["mrn"] for r in data["patients"]])
        self.assertEqual(self.get(self.stranger.mrn).data["patients"], [])

    def test_nothing_typed_lists_my_patients_in_house(self):
        data = self.get("").data
        self.assertEqual(data["kind"], "mine")
        self.assertEqual([r["full_name"] for r in data["patients"]], ["Maria Santos"])
        self.assertEqual(self.get("", user=self.nurse).data["patients"], [])

    def test_patients_cannot_search(self):
        self.assertEqual(self.get("santos", user=self.maria.user).status_code, 403)
        self.assertEqual(APIClient().get(URL, {"q": "santos"}).status_code, 401)


class AuditTests(Base):
    def open(self, **body):
        return self.client_for(self.doc).post(URL + "opened/", body, format="json")

    def test_opening_a_chart_is_logged(self):
        res = self.open(patient=self.maria.user_id, visit=self.visit.pk, q="santos", action="chart")
        self.assertEqual(res.status_code, 201)
        row = SearchAudit.objects.get()
        self.assertEqual((row.user, row.patient, row.registration_id, row.kind, row.query), (self.doc, self.maria.user, self.visit.pk, "name", "santos"))
        self.assertEqual(row.organization, self.org)

    def test_birth_dates_and_phones_are_not_kept(self):
        self.open(patient=self.maria.user_id, q="03/14/1972")
        self.open(patient=self.maria.user_id, q="3018806015")
        self.assertEqual(set(SearchAudit.objects.values_list("query", flat=True)), {""})
        self.assertEqual(set(SearchAudit.objects.values_list("kind", flat=True)), {"dob", "phone"})

    def test_other_clinics_patient_is_refused(self):
        self.assertEqual(self.open(patient=self.stranger.user_id).status_code, 404)
        self.assertEqual(self.open().status_code, 400)
        self.assertFalse(SearchAudit.objects.exists())


class StaffingOnlyClinicTests(TestCase):
    """A clinic that only has the Staffing service searches staff, units and staffing pages, not charts."""

    def setUp(self):
        from staffing.models import Staff, Unit as StaffUnit

        self.org = Organization.objects.create(name="St Marys", enabled_modules=["staffing"])
        self.admin = make_user("smadmin", "admin", self.org)
        self.nurse = Staff.objects.create(organization=self.org, first_name="Nia", last_name="Brooks", profession="Nurse", nursing_role="rn", phone_number="(301) 555-0188", email="nia@example.com")
        Staff.objects.create(organization=self.org, first_name="Paul", last_name="Okafor", profession="CNA", is_active=False)
        StaffUnit.objects.create(organization=self.org, name="2 West", bed_capacity=24)
        other = Organization.objects.create(name="Elsewhere", enabled_modules=["staffing"])
        Staff.objects.create(organization=other, first_name="Nia", last_name="Stranger", profession="Nurse")
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.admin).access_token}")

    def get(self, q):
        return self.client.get(URL, {"q": q}).data

    def test_scope_says_staff_only(self):
        self.assertEqual(self.get("nia")["scope"], {"patients": False, "staff": True})

    def test_staff_by_name_profession_phone_and_email(self):
        self.assertEqual([r["full_name"] for r in self.get("nia")["staff"]], ["Nia Brooks"])
        self.assertEqual([r["full_name"] for r in self.get("brooks nurse")["staff"]], ["Nia Brooks"])
        self.assertEqual([r["full_name"] for r in self.get("555-0188")["staff"]], ["Nia Brooks"])
        self.assertEqual([r["full_name"] for r in self.get("nia@example")["staff"]], ["Nia Brooks"])
        row = self.get("nia")["staff"][0]
        self.assertEqual((row["profession"], row["nursing_role"], row["is_active"]), ("Nurse", "rn", True))
        self.assertNotIn("phone_number", row)
        self.assertNotIn("email", row)

    def test_only_this_clinics_staff_and_inactive_are_flagged(self):
        self.assertNotIn("Stranger", " ".join(r["full_name"] for r in self.get("nia")["staff"]))
        self.assertFalse(self.get("okafor")["staff"][0]["is_active"])

    def test_units_and_close_spellings(self):
        self.assertEqual([u["name"] for u in self.get("west")["units"]], ["2 West"])
        self.assertEqual([r["full_name"] for r in self.get("brookes")["staff_suggestions"]], ["Nia Brooks"])

    def test_no_patient_results_or_my_patients(self):
        data = self.get("MRN-000001")
        self.assertEqual((data["patients"], data["visits"], data["staff"]), ([], [], []))
        self.assertEqual(self.get("")["patients"], [])

    def test_clinic_with_charts_still_gets_patients_and_staff_names(self):
        self.org.enabled_modules = ["staffing", "clinical_documentation"]
        self.org.save()
        make_patient(self.org, "Nia", "Santos")
        data = self.get("nia")
        self.assertEqual(data["scope"], {"patients": True, "staff": True})
        self.assertEqual([r["full_name"] for r in data["patients"]], ["Nia Santos"])
        self.assertEqual([r["full_name"] for r in data["staff"]], ["Nia Brooks"])

    def test_clinic_without_staffing_gets_no_staff(self):
        self.org.enabled_modules = ["clinical_documentation"]
        self.org.save()
        self.assertEqual(self.get("nia")["staff"], [])
