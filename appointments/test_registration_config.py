from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Organization

from . import registration_config as rc
from .models import RegistrationDictionary, RegistrationFieldSetting

User = get_user_model()
DICT_URL = "/api/registration-dictionaries/"
FIELD_URL = "/api/registration-fields/"


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
        self.patient = make_user("pat", "patient", self.org)
        self.outsider = make_user("out", "admin", self.other)
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client


def entries(*values, off=()):
    return [{"value": v, "abbr": "", "active": v not in off} for v in values]


class DictionaryTests(Base):
    def test_defaults_for_a_clinic_with_nothing_saved(self):
        data = self.as_user(self.registrar).get(DICT_URL).json()
        codes = [d["code"] for d in data["dictionaries"]]
        self.assertEqual(codes, list(rc.DICTIONARIES))
        lang = next(d for d in data["dictionaries"] if d["code"] == "language")
        self.assertEqual(lang["source"], "default")
        self.assertEqual(lang["entries"][0], {"value": "English", "abbr": "", "active": True})
        self.assertFalse(data["can_edit"])

    def test_patient_cannot_read(self):
        self.assertEqual(self.as_user(self.patient).get(DICT_URL).status_code, 403)

    def test_admin_saves_and_it_is_used(self):
        body = {"code": "language", "entries": [{"value": "English", "abbr": "ENG", "active": True}, {"value": "Tagalog", "abbr": "", "active": True}, {"value": "Russian", "abbr": "", "active": False}]}
        r = self.as_user(self.admin).put(DICT_URL, body, format="json")
        self.assertEqual(r.status_code, 200)
        lang = next(d for d in r.json()["dictionaries"] if d["code"] == "language")
        self.assertEqual([e["value"] for e in lang["entries"]], ["English", "Tagalog", "Russian"])
        self.assertEqual(lang["source"], "organization")
        self.assertTrue(r.json()["can_edit"])
        seen = self.as_user(self.registrar).get(DICT_URL).json()
        self.assertEqual(next(d for d in seen["dictionaries"] if d["code"] == "language")["entries"][2]["active"], False)

    def test_other_dictionaries_stay_default(self):
        self.as_user(self.admin).put(DICT_URL, {"code": "language", "entries": entries("English")}, format="json")
        data = self.as_user(self.admin).get(DICT_URL).json()
        rel = next(d for d in data["dictionaries"] if d["code"] == "relationship")
        self.assertEqual(rel["source"], "default")

    def test_registrar_cannot_save(self):
        r = self.as_user(self.registrar).put(DICT_URL, {"code": "language", "entries": entries("English")}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(RegistrationDictionary.objects.count(), 0)

    def test_rules(self):
        c = self.as_user(self.admin)
        cases = [
            ({"code": "nope", "entries": entries("a")}, "Unknown dictionary"),
            ({"code": "language", "entries": "x"}, "must be a list"),
            ({"code": "language", "entries": entries("English", "english")}, "twice"),
            ({"code": "language", "entries": [{"value": "  "}]}, "no value"),
            ({"code": "language", "entries": [{"value": "x", "abbr": "TOOLONG"}]}, "5 characters"),
            ({"code": "language", "entries": [{"value": "x" * 81}]}, "longer than"),
            ({"code": "language", "entries": entries("English", off=("English",))}, "at least one active"),
            ({"code": "language", "entries": []}, "at least one active"),
        ]
        for body, text in cases:
            r = c.put(DICT_URL, body, format="json")
            self.assertEqual(r.status_code, 400, body)
            self.assertIn(text, r.json()["detail"])
        self.assertEqual(RegistrationDictionary.objects.count(), 0)

    def test_values_are_trimmed(self):
        r = self.as_user(self.admin).put(DICT_URL, {"code": "payer", "entries": [{"value": "  Aetna  "}]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(RegistrationDictionary.objects.get().entries, [{"value": "Aetna", "abbr": "", "active": True}])

    def test_reset_goes_back_to_default(self):
        c = self.as_user(self.admin)
        c.put(DICT_URL, {"code": "language", "entries": entries("English")}, format="json")
        r = c.delete(DICT_URL + "?code=language")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(RegistrationDictionary.objects.count(), 0)
        self.assertEqual(c.delete(DICT_URL + "?code=zzz").status_code, 400)

    def test_clinics_are_separate(self):
        self.as_user(self.admin).put(DICT_URL, {"code": "language", "entries": entries("English")}, format="json")
        mine = self.as_user(self.admin).get(DICT_URL).json()
        theirs = self.as_user(self.outsider).get(DICT_URL).json()
        self.assertEqual(next(d for d in mine["dictionaries"] if d["code"] == "language")["source"], "organization")
        self.assertEqual(next(d for d in theirs["dictionaries"] if d["code"] == "language")["source"], "default")

    def test_every_default_list_passes_the_rules(self):
        for code in rc.DICTIONARIES:
            cleaned, error = rc.clean_entries(rc.default_entries(code))
            self.assertIsNone(error, code)
            self.assertTrue(cleaned)


class FieldSettingTests(Base):
    def get_window(self, user, key):
        data = self.as_user(user).get(FIELD_URL).json()
        return next(w for w in data["windows"] if w["key"] == key)

    def test_defaults(self):
        data = self.as_user(self.registrar).get(FIELD_URL).json()
        self.assertEqual([w["key"] for w in data["windows"]], list(rc.WINDOWS))
        ident = next(w for w in data["windows"] if w["key"] == "identity")
        self.assertEqual(ident["source"], "default")
        addr = next(f for f in ident["fields"] if f["key"] == "address")
        self.assertEqual((addr["label"], addr["default_label"], addr["mode"], addr["locked"]), ("Address", "Address", "opt", False))
        self.assertTrue(next(f for f in ident["fields"] if f["key"] == "date_of_birth")["locked"])
        self.assertEqual([m["key"] for m in data["modes"]], ["opt", "req", "view", "hid"])

    def test_admin_saves_label_and_mode(self):
        body = {"window": "identity", "fields": {"address": {"label": "Home address", "mode": "req"}, "email": {"mode": "hid"}, "phone_number": {"label": "Phone Number", "mode": "opt"}}}
        r = self.as_user(self.admin).put(FIELD_URL, body, format="json")
        self.assertEqual(r.status_code, 200)
        ident = next(w for w in r.json()["windows"] if w["key"] == "identity")
        by = {f["key"]: f for f in ident["fields"]}
        self.assertEqual((by["address"]["label"], by["address"]["mode"]), ("Home address", "req"))
        self.assertEqual(by["email"]["mode"], "hid")
        self.assertEqual(by["phone_number"]["label"], "Phone Number")
        self.assertEqual(ident["source"], "organization")
        # only what differs from the built-in is stored
        self.assertEqual(RegistrationFieldSetting.objects.get().settings_map, {"address": {"label": "Home address", "mode": "req"}, "email": {"mode": "hid"}})
        self.assertEqual(self.get_window(self.registrar, "identity")["fields"][1]["label"], "Home address")

    def test_other_windows_are_untouched(self):
        self.as_user(self.admin).put(FIELD_URL, {"window": "identity", "fields": {"address": {"mode": "req"}}}, format="json")
        self.assertEqual(self.get_window(self.admin, "emergency")["source"], "default")

    def test_locked_fields_cannot_hide_or_go_view_only(self):
        c = self.as_user(self.admin)
        for mode in ("hid", "view"):
            r = c.put(FIELD_URL, {"window": "identity", "fields": {"date_of_birth": {"mode": mode}}}, format="json")
            self.assertEqual(r.status_code, 400)
            self.assertIn("cannot be hidden", r.json()["detail"])
        ok = c.put(FIELD_URL, {"window": "identity", "fields": {"date_of_birth": {"mode": "req", "label": "DOB"}}}, format="json")
        self.assertEqual(ok.status_code, 200)

    def test_rules(self):
        c = self.as_user(self.admin)
        cases = [
            ({"window": "zzz", "fields": {}}, "Unknown step"),
            ({"window": "identity", "fields": []}, "must be an object"),
            ({"window": "identity", "fields": {"nope": {}}}, "Unknown field"),
            ({"window": "identity", "fields": {"address": {"mode": "bad"}}}, "Unknown setting"),
            ({"window": "identity", "fields": {"address": {"label": "x" * 61}}}, "longer than"),
            ({"window": "identity", "fields": {"address": "x"}}, "must be an object"),
        ]
        for body, text in cases:
            r = c.put(FIELD_URL, body, format="json")
            self.assertEqual(r.status_code, 400, body)
            self.assertIn(text, r.json()["detail"])
        self.assertEqual(RegistrationFieldSetting.objects.count(), 0)

    def test_registrar_cannot_save(self):
        r = self.as_user(self.registrar).put(FIELD_URL, {"window": "identity", "fields": {"address": {"mode": "req"}}}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_saving_all_defaults_clears_the_row(self):
        c = self.as_user(self.admin)
        c.put(FIELD_URL, {"window": "identity", "fields": {"address": {"mode": "req"}}}, format="json")
        self.assertEqual(RegistrationFieldSetting.objects.count(), 1)
        c.put(FIELD_URL, {"window": "identity", "fields": {"address": {"label": "Address", "mode": "opt"}}}, format="json")
        self.assertEqual(RegistrationFieldSetting.objects.count(), 0)

    def test_reset(self):
        c = self.as_user(self.admin)
        c.put(FIELD_URL, {"window": "financial", "fields": {"insurance_member_id": {"mode": "req"}}}, format="json")
        r = c.delete(FIELD_URL + "?window=financial")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(RegistrationFieldSetting.objects.count(), 0)
        self.assertEqual(c.delete(FIELD_URL + "?window=zzz").status_code, 400)

    def test_clinics_are_separate(self):
        self.as_user(self.admin).put(FIELD_URL, {"window": "identity", "fields": {"address": {"mode": "req"}}}, format="json")
        self.assertEqual(self.get_window(self.outsider, "identity")["source"], "default")

    def test_every_catalog_field_is_a_real_form_field(self):
        # keys must match what the form and the patient record use
        keys = {k for _, (_t, fields) in rc.WINDOWS.items() for k, _l, _x in fields}
        self.assertIn("preferred_language", keys)
        self.assertEqual(len(keys), sum(len(f) for _t, f in rc.WINDOWS.values()))
