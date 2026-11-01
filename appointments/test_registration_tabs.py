from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Organization

from . import registration_tabs as rt
from .models import RegistrationTabSequence

User = get_user_model()
URL = "/api/registration-tabs/"


def make_user(username, role, org):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org
    )


def seq(*keys, review=()):
    return [{"key": k, "require_review": k in review} for k in keys]


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside Clinic")
        self.other = Organization.objects.create(name="Other Clinic")
        self.registrar = make_user("reg", "registrar", self.org)
        self.admin = make_user("adm", "admin", self.org)
        self.patient = make_user("pat", "patient", self.org)
        self.outsider = make_user("out", "admin", self.other)
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client


class ResolveTests(Base):
    def test_default_when_nothing_saved(self):
        r = self.as_user(self.registrar).get(URL)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual([t["key"] for t in data["tabs"]], [k for k, _ in rt.CATALOG])
        self.assertEqual(data["source"], "default")
        self.assertFalse(data["can_edit"])
        self.assertTrue(all(not t["require_review"] for t in data["tabs"]))

    def test_clinic_wide_sequence(self):
        RegistrationTabSequence.objects.create(organization=self.org, care_setting="", tabs=seq("identity", "reason", "logistics", review=("reason",)))
        data = self.as_user(self.registrar).get(URL, {"care_setting": "acute"}).json()
        self.assertEqual([t["key"] for t in data["tabs"]], ["identity", "reason", "logistics"])
        self.assertEqual(data["source"], "organization")
        self.assertTrue(data["tabs"][1]["require_review"])
        self.assertEqual(data["tabs"][1]["label"], "Reason for Visit")

    def test_care_setting_beats_clinic_wide(self):
        RegistrationTabSequence.objects.create(organization=self.org, care_setting="", tabs=seq("identity", "logistics"))
        RegistrationTabSequence.objects.create(organization=self.org, care_setting="emergency", tabs=seq("identity", "reason", "logistics"))
        er = self.as_user(self.registrar).get(URL, {"care_setting": "emergency"}).json()
        self.assertEqual(er["source"], "care_setting")
        self.assertEqual(len(er["tabs"]), 3)
        amb = self.as_user(self.registrar).get(URL, {"care_setting": "ambulatory"}).json()
        self.assertEqual(amb["source"], "organization")
        self.assertEqual(sorted(amb["overrides"]), ["all", "emergency"])

    def test_another_clinics_sequence_is_not_used(self):
        RegistrationTabSequence.objects.create(organization=self.other, care_setting="", tabs=seq("identity", "logistics"))
        self.assertEqual(self.as_user(self.registrar).get(URL).json()["source"], "default")

    def test_patients_cannot_read(self):
        self.assertEqual(self.as_user(self.patient).get(URL).status_code, 403)

    def test_unknown_care_setting(self):
        self.assertEqual(self.as_user(self.registrar).get(URL, {"care_setting": "bogus"}).status_code, 400)


class SaveTests(Base):
    def put(self, user, tabs, care_setting=""):
        return self.as_user(user).put(URL, {"care_setting": care_setting, "tabs": tabs}, format="json")

    def test_admin_saves_and_reads_back(self):
        r = self.put(self.admin, seq("identity", "financial", "logistics", review=("financial",)))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["source"], "organization")
        got = self.as_user(self.registrar).get(URL).json()
        self.assertEqual([t["key"] for t in got["tabs"]], ["identity", "financial", "logistics"])
        self.assertTrue(got["tabs"][1]["require_review"])

    def test_saving_again_updates_the_same_row(self):
        self.put(self.admin, seq("identity", "logistics"))
        self.put(self.admin, seq("identity", "reason", "logistics"))
        self.assertEqual(RegistrationTabSequence.objects.filter(organization=self.org).count(), 1)

    def test_per_care_setting_row(self):
        r = self.put(self.admin, seq("identity", "logistics"), "emergency")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(RegistrationTabSequence.objects.get(organization=self.org).care_setting, "emergency")

    def test_registrar_cannot_save(self):
        self.assertEqual(self.put(self.registrar, seq("identity", "logistics")).status_code, 403)

    def test_rules(self):
        cases = {
            "identity must stay": seq("reason", "logistics"),
            "identity must stay first": seq("reason", "identity", "logistics"),
            "logistics must stay": seq("identity", "reason"),
            "unknown": seq("identity", "logistics", "bogus"),
            "twice": seq("identity", "logistics", "logistics"),
            "empty": [],
        }
        for name, tabs in cases.items():
            r = self.put(self.admin, tabs)
            self.assertEqual(r.status_code, 400, name)
        self.assertEqual(RegistrationTabSequence.objects.count(), 0)

    def test_bad_care_setting_on_save(self):
        self.assertEqual(self.put(self.admin, seq("identity", "logistics"), "bogus").status_code, 400)

    def test_tabs_not_a_list(self):
        self.assertEqual(self.as_user(self.admin).put(URL, {"tabs": "identity"}, format="json").status_code, 400)

    def test_reset_to_default(self):
        self.put(self.admin, seq("identity", "logistics"))
        r = self.as_user(self.admin).delete(URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["source"], "default")
        self.assertEqual(RegistrationTabSequence.objects.count(), 0)

    def test_registrar_cannot_reset(self):
        self.put(self.admin, seq("identity", "logistics"))
        self.assertEqual(self.as_user(self.registrar).delete(URL).status_code, 403)
        self.assertEqual(RegistrationTabSequence.objects.count(), 1)

    def test_other_clinic_admin_does_not_touch_this_clinic(self):
        self.put(self.admin, seq("identity", "logistics"))
        self.as_user(self.outsider).delete(URL)
        self.assertEqual(RegistrationTabSequence.objects.filter(organization=self.org).count(), 1)
