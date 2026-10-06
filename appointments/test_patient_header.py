from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from users.models import Organization, Patient, Registration

from . import patient_header as ph
from .models import HeaderFieldDefinition, PatientAllergy, PatientHeaderConfig

User = get_user_model()
HEADER = "/api/patient-header/{}/"
CONFIG = "/api/patient-header-config/"
FIELDS = "/api/patient-header-fields/"


def make_user(username, role, org, **extra):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org, **extra
    )


class AgeTests(SimpleTestCase):
    def test_age_text(self):
        today = date(2026, 10, 5)
        self.assertEqual(ph._age_text(date(1983, 3, 1), today), "43 y")
        self.assertEqual(ph._age_text(date(1983, 10, 6), today), "42 y")  # birthday tomorrow
        self.assertEqual(ph._age_text(date(2025, 6, 5), today), "16 m")
        self.assertEqual(ph._age_text(date(2024, 10, 5), today), "2 y")
        self.assertEqual(ph._age_text(date(2026, 6, 2), today), "4 m")
        self.assertEqual(ph._age_text(date(2026, 9, 25), today), "10 d")
        self.assertEqual(ph._age_text(None, today), "")
        self.assertEqual(ph._age_text(date(2030, 1, 1), today), "")


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside Clinic")
        self.other_org = Organization.objects.create(name="Other Clinic")
        self.doctor = make_user("doc", "doctor", self.org, first_name="Jeffrey", last_name="Lee")
        self.nurse = make_user("nurse", "nurse", self.org)
        self.registrar = make_user("reg", "registrar", self.org)
        self.admin = make_user("adm", "admin", self.org)
        self.sysadmin = make_user("sys", "system_admin", None)
        self.outsider = make_user("out", "doctor", self.other_org)
        self.patient = make_user("pat", "patient", self.org, first_name="Test", last_name="Bcs")
        self.patient.provider = self.doctor
        self.patient.save()
        # a signal creates the Patient profile with the user
        self.profile = Patient.objects.get(user=self.patient)
        self.profile.organization = self.org
        self.profile.date_of_birth = date.today() - timedelta(days=365 * 43 + 20)
        self.profile.legal_sex = "M"
        self.profile.save()
        self.other_patient = make_user("pat2", "patient", self.other_org)
        self.client = APIClient()

    def get(self, user=None, patient=None, **params):
        self.client.force_authenticate(user or self.doctor)
        return self.client.get(HEADER.format((patient or self.patient).pk), params)

    def items(self, **kw):
        response = self.get(**kw)
        self.assertEqual(response.status_code, 200, response.content)
        return {i["key"]: i for i in response.json()["items"]}


class HeaderContentTests(Base):
    def test_default_items_in_order(self):
        response = self.get()
        self.assertEqual([i["key"] for i in response.json()["items"]], ph.DEFAULT_VISIBLE)

    def test_values_without_a_visit(self):
        items = self.items()
        self.assertEqual(items["name"]["value"], "Bcs, Test")
        self.assertEqual(items["location"]["value"], "Riverside Clinic")  # no visit: the clinic's name
        self.assertEqual(items["attending"]["value"], "Dr. Jeffrey Lee")  # falls back to the patient's provider
        self.assertEqual(items["mrn"]["value"], self.profile.mrn)
        self.assertTrue(items["mrn"]["value"].startswith("MRN-"))
        self.assertEqual(items["visit_id"]["value"], "")
        self.assertTrue(items["age_sex"]["value"].startswith("43 y"))
        self.assertTrue(items["age_sex"]["value"].endswith("Male"))

    def test_latest_visit_supplies_unit_attending_and_visit_id(self):
        other_doc = make_user("doc2", "doctor", self.org, first_name="Ann", last_name="Park")
        Registration.objects.create(patient=self.profile, organization=self.org, assigned_location="OLD", admission_type="scheduled")
        newest = Registration.objects.create(
            patient=self.profile, organization=self.org, assigned_location="N43-PICU", attending_provider=other_doc,
            admission_type="direct", reason_for_visit="Chest pain",
        )
        response = self.get()
        items = {i["key"]: i for i in response.json()["items"]}
        self.assertEqual(response.json()["visit"], newest.pk)
        self.assertEqual(items["location"]["value"], "N43-PICU")
        self.assertEqual(items["attending"]["value"], "Dr. Ann Park")
        self.assertEqual(items["visit_id"]["value"], newest.visit_number)
        # an earlier visit can be asked for by id
        first = Registration.objects.get(assigned_location="OLD")
        again = {i["key"]: i for i in self.get(visit=first.pk).json()["items"]}
        self.assertEqual(again["location"]["value"], "OLD")

    def test_hidden_builtin_items_when_switched_on(self):
        Registration.objects.create(patient=self.profile, organization=self.org, admission_type="emergency", reason_for_visit="Fall")
        PatientHeaderConfig.objects.create(
            organization=self.org,
            items=[{"key": k, "visible": True} for k in ("care_setting", "reason_for_visit", "dob", "preferred_language", "arrival")],
        )
        items = self.items()
        self.assertEqual(items["care_setting"]["value"], "Emergency Care")
        self.assertEqual(items["reason_for_visit"]["value"], "Fall")
        self.assertRegex(items["dob"]["value"], r"^\d\d-\d\d-\d{4}$")
        self.assertRegex(items["arrival"]["value"], r"^\d\d-\d\d-\d{4}$")

    def test_access(self):
        for user in (self.doctor, self.nurse, self.registrar, self.admin, self.sysadmin):
            self.assertEqual(self.get(user).status_code, 200, user.role)
        self.assertEqual(self.get(self.outsider).status_code, 404)  # another clinic's patient
        self.assertEqual(self.get(self.patient).status_code, 403)
        self.assertEqual(self.get(self.doctor, patient=self.doctor).status_code, 404)  # not a patient
        self.client.logout()
        self.assertEqual(APIClient().get(HEADER.format(self.patient.pk)).status_code, 401)


class CareSettingTests(Base):
    def test_default_from_admission_type(self):
        cases = {"emergency": "emergency", "direct": "acute", "scheduled": "ambulatory", "": "ambulatory"}
        for admission, expected in cases.items():
            r = Registration.objects.create(patient=self.profile, organization=self.org, admission_type=admission)
            self.assertEqual(r.care_setting, expected, admission)
            r.refresh_from_db()
            self.assertEqual(r.care_setting, expected)

    def test_explicit_setting_is_kept(self):
        r = Registration.objects.create(patient=self.profile, organization=self.org, admission_type="scheduled", care_setting="acute")
        self.assertEqual(r.care_setting, "acute")
        self.assertTrue(r.visit_number)

    def make_patient(self, name, setting=None):
        user = make_user(name, "patient", self.org, first_name=name, last_name=name)
        user.provider = self.doctor
        user.save()
        profile = Patient.objects.get(user=user)
        profile.organization = self.org
        profile.save()
        if setting:
            Registration.objects.create(patient=profile, organization=self.org, care_setting=setting)
        return user

    def test_patients_list_filters_by_care_setting_of_latest_visit(self):
        self.make_patient("amb1", "ambulatory")
        self.make_patient("ed1", "emergency")
        self.make_patient("ed2", "emergency")
        self.make_patient("icu1", "acute")
        self.make_patient("novisit")
        moved = self.make_patient("moved", "emergency")
        Registration.objects.create(patient=moved.patient_profile, organization=self.org, care_setting="acute")  # later visit wins
        self.client.force_authenticate(self.nurse)

        def names(setting=None):
            params = {"page_size": 100}
            if setting:
                params["care_setting"] = setting
            body = self.client.get("/api/users/patients/", params).json()
            return {p["user"]["first_name"] if isinstance(p.get("user"), dict) else p.get("first_name") for p in body["results"]}

        self.assertEqual(names("emergency"), {"ed1", "ed2"})
        self.assertEqual(names("acute"), {"icu1", "moved"})
        self.assertEqual(names("ambulatory"), {"amb1", "novisit", "Test"})  # "Test" is the base patient (no visit)
        self.assertEqual(len(names()), 7)  # no filter: everyone
        self.assertEqual(names("bogus"), names())  # unknown value is ignored


class AllergyTests(Base):
    def post(self, **body):
        self.client.force_authenticate(self.nurse)
        return self.client.post(HEADER.format(self.patient.pk) + "allergies/", body, format="json")

    def test_not_documented_then_no_known_allergies(self):
        item = self.items()["allergies"]
        self.assertEqual((item["value"], item["emphasis"]), ("Not documented", "warn"))
        self.client.force_authenticate(self.nurse)
        r = self.client.put(HEADER.format(self.patient.pk) + "allergy-status/", {"no_known_allergies": True}, format="json")
        self.assertEqual(r.status_code, 200)
        item = self.items()["allergies"]
        self.assertEqual((item["value"], item["emphasis"]), ("No known allergies", "none"))

    def test_adding_an_allergy_shows_in_red_and_clears_nka(self):
        self.client.force_authenticate(self.nurse)
        self.client.put(HEADER.format(self.patient.pk) + "allergy-status/", {"no_known_allergies": True}, format="json")
        self.assertEqual(self.post(substance="Penicillin", reaction="Hives", severity="severe").status_code, 201)
        self.assertEqual(self.post(substance="Latex").status_code, 201)
        item = self.items()["allergies"]
        self.assertEqual(item["emphasis"], "alert")
        self.assertEqual(item["value"], "Latex; Penicillin (Hives, severe)")
        # "no known allergies" cannot sit beside a real allergy
        r = self.client.put(HEADER.format(self.patient.pk) + "allergy-status/", {"no_known_allergies": True}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_validation(self):
        self.assertEqual(self.post(substance=" ").status_code, 400)
        self.assertEqual(self.post(substance="Nuts", severity="deadly").status_code, 400)
        self.assertEqual(self.post(substance="Nuts").status_code, 201)
        self.assertEqual(self.post(substance="nuts").status_code, 400)  # already listed

    def test_inactive_and_delete(self):
        self.post(substance="Sulfa")
        allergy = PatientAllergy.objects.get()
        url = HEADER.format(self.patient.pk) + f"allergies/{allergy.pk}/"
        self.client.force_authenticate(self.nurse)
        r = self.client.patch(url, {"status": "inactive"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.items()["allergies"]["value"], "Not documented")  # history kept, not shown
        self.assertEqual(r.json()["records"][0]["status"], "inactive")
        self.client.patch(url, {"status": "active"}, format="json")
        self.assertEqual(self.items()["allergies"]["value"], "Sulfa")
        self.assertEqual(self.client.patch(url, {"status": "weird"}, format="json").status_code, 400)
        self.client.delete(url)
        self.assertFalse(PatientAllergy.objects.exists())

    def test_other_clinics_and_patients_cannot_touch_allergies(self):
        self.post(substance="Sulfa")
        allergy = PatientAllergy.objects.get()
        url = HEADER.format(self.patient.pk) + f"allergies/{allergy.pk}/"
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertEqual(self.client.post(HEADER.format(self.patient.pk) + "allergies/", {"substance": "x"}, format="json").status_code, 404)
        self.client.force_authenticate(self.patient)
        self.assertEqual(self.client.post(HEADER.format(self.patient.pk) + "allergies/", {"substance": "x"}, format="json").status_code, 403)
        # an allergy id from another patient is not found under this one
        other = PatientAllergy.objects.create(patient=self.other_patient, substance="Dust")
        self.client.force_authenticate(self.nurse)
        self.assertEqual(self.client.delete(HEADER.format(self.patient.pk) + f"allergies/{other.pk}/").status_code, 404)


class ConfigTests(Base):
    def put(self, items, user=None, **extra):
        self.client.force_authenticate(user or self.admin)
        return self.client.put(CONFIG, {"items": items, **extra}, format="json")

    def test_get_lists_everything_visible_ones_first(self):
        self.client.force_authenticate(self.nurse)
        body = self.client.get(CONFIG).json()
        keys = [i["key"] for i in body["items"]]
        self.assertEqual(keys[: len(ph.DEFAULT_VISIBLE)], ph.DEFAULT_VISIBLE)
        self.assertEqual(set(keys), set(ph.BUILTIN_KEYS))
        self.assertTrue(all(i["visible"] for i in body["items"][: len(ph.DEFAULT_VISIBLE)]))
        self.assertFalse(any(i["visible"] for i in body["items"][len(ph.DEFAULT_VISIBLE):]))
        self.assertFalse(body["can_edit"])

    def test_admin_reorders_hides_and_adds(self):
        r = self.put([
            {"key": "mrn", "visible": True},
            {"key": "name", "visible": True},
            {"key": "allergies", "visible": False},
            {"key": "care_setting", "visible": True},
        ])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["can_edit"])
        self.assertEqual(list(self.items()), ["mrn", "name", "care_setting"])
        # items left out of a save come back hidden, so nothing is ever lost
        keys = [i["key"] for i in r.json()["items"]]
        self.assertEqual(set(keys), set(ph.BUILTIN_KEYS))

    def test_only_admins_save(self):
        for user in (self.doctor, self.nurse, self.registrar):
            self.assertEqual(self.put([{"key": "name", "visible": True}], user=user).status_code, 403, user.role)
        self.assertFalse(PatientHeaderConfig.objects.exists())

    def test_rejects_bad_layouts(self):
        self.assertEqual(self.put([{"key": "nope", "visible": True}]).status_code, 400)
        self.assertEqual(self.put([{"key": "name", "visible": True}, {"key": "name", "visible": True}]).status_code, 400)
        self.assertEqual(self.put([{"key": "name", "visible": False}]).status_code, 400)  # nothing shown
        self.assertEqual(self.put("name").status_code, 400)

    def test_each_clinic_has_its_own_layout(self):
        self.put([{"key": "mrn", "visible": True}])
        self.client.force_authenticate(self.outsider)
        keys = [i["key"] for i in self.client.get(CONFIG).json()["items"] if i["visible"]]
        self.assertEqual(keys, ph.DEFAULT_VISIBLE)

    def test_system_admin_chooses_the_clinic(self):
        self.client.force_authenticate(self.sysadmin)
        self.assertEqual(self.client.get(CONFIG).status_code, 400)
        r = self.client.put(CONFIG, {"organization": self.org.pk, "items": [{"key": "mrn", "visible": True}]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(list(self.items(user=self.doctor)), ["mrn"])


class CustomFieldTests(Base):
    def create(self, label="Code status", user=None, **extra):
        self.client.force_authenticate(user or self.admin)
        return self.client.post(FIELDS, {"label": label, **extra}, format="json")

    def show(self, *keys):
        self.client.force_authenticate(self.admin)
        items = [{"key": k, "visible": True} for k in keys]
        r = self.client.put(CONFIG, {"items": items}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def set_value(self, key, value, user=None):
        self.client.force_authenticate(user or self.nurse)
        return self.client.put(HEADER.format(self.patient.pk) + "values/", {"values": {key: value}}, format="json")

    def test_create_and_it_appears_hidden_in_the_config(self):
        r = self.create(field_type="text")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["item_key"], "custom:code-status")
        self.client.force_authenticate(self.nurse)
        item = next(i for i in self.client.get(CONFIG).json()["items"] if i["key"] == "custom:code-status")
        self.assertEqual((item["kind"], item["visible"], item["label"]), ("custom", False, "Code status"))

    def test_only_admins_manage_but_staff_can_list(self):
        for user in (self.doctor, self.nurse, self.registrar):
            self.assertEqual(self.create(user=user).status_code, 403, user.role)
        self.create()
        self.client.force_authenticate(self.nurse)
        self.assertEqual(len(self.client.get(FIELDS).json()), 1)
        self.assertEqual(self.client.patch(f"{FIELDS}{HeaderFieldDefinition.objects.get().pk}/", {"label": "x"}, format="json").status_code, 403)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(FIELDS).json(), [])  # another clinic's items are invisible

    def test_validation(self):
        self.assertEqual(self.create(label="").status_code, 400)
        self.assertEqual(self.create(label="x" * 61).status_code, 400)
        self.assertEqual(self.create(field_type="number").status_code, 400)
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.create(label="code STATUS").status_code, 400)
        # a name that slugs the same gets its own key
        self.assertEqual(self.create(label="Code-status!").json()["key"], "code-status-2")

    def test_limit(self):
        for i in range(ph.MAX_CUSTOM_FIELDS):
            self.assertEqual(self.create(label=f"Item {i}").status_code, 201)
        self.assertEqual(self.create(label="One more").status_code, 400)

    def test_filling_in_a_value_shows_it_in_the_header(self):
        self.create()
        self.show("name", "custom:code-status")
        self.assertEqual(self.items()["custom:code-status"]["value"], "")
        self.assertEqual(self.set_value("custom:code-status", "Full code").status_code, 200)
        self.assertEqual(self.items()["custom:code-status"]["value"], "Full code")
        self.assertEqual(self.set_value("custom:code-status", "  ").status_code, 200)  # blank clears it
        self.assertEqual(self.items()["custom:code-status"]["value"], "")

    def test_alert_items_show_red_only_when_filled(self):
        self.create(label="Isolation", alert=True)
        self.create(label="Fall risk", field_type="yes_no", alert=True)
        self.show("custom:isolation", "custom:fall-risk")
        self.assertEqual(self.items()["custom:isolation"]["emphasis"], "none")
        self.set_value("custom:isolation", "Contact")
        self.assertEqual(self.items()["custom:isolation"]["emphasis"], "alert")
        self.set_value("custom:fall-risk", "no")
        self.assertEqual((self.items()["custom:fall-risk"]["value"], self.items()["custom:fall-risk"]["emphasis"]), ("No", "none"))
        self.set_value("custom:fall-risk", "yes")
        self.assertEqual((self.items()["custom:fall-risk"]["value"], self.items()["custom:fall-risk"]["emphasis"]), ("Yes", "alert"))

    def test_value_checks(self):
        self.create(label="Flag", field_type="yes_no")
        self.create(label="Last fall", field_type="date")
        self.assertEqual(self.set_value("custom:flag", "maybe").status_code, 400)
        self.assertEqual(self.set_value("custom:last-fall", "yesterday").status_code, 400)
        self.assertEqual(self.set_value("custom:last-fall", "2026-02-30").status_code, 400)
        self.assertEqual(self.set_value("custom:last-fall", "2026-03-04").status_code, 200)
        self.show("custom:last-fall")
        self.assertEqual(self.items()["custom:last-fall"]["value"], "03-04-2026")
        self.assertEqual(self.set_value("custom:nope", "x").status_code, 400)
        self.assertEqual(self.set_value("custom:flag", "yes", user=self.patient).status_code, 403)
        self.assertEqual(self.set_value("custom:flag", "yes", user=self.outsider).status_code, 404)

    def test_other_clinics_item_cannot_be_used(self):
        other = HeaderFieldDefinition.objects.create(organization=self.other_org, key="secret", label="Secret")
        self.assertEqual(self.set_value("custom:secret", "x").status_code, 400)
        self.client.force_authenticate(self.admin)
        r = self.client.put(CONFIG, {"items": [{"key": "custom:secret", "visible": True}]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertTrue(HeaderFieldDefinition.objects.filter(pk=other.pk).exists())

    def test_rename_keeps_values(self):
        pk = self.create().json()["id"]
        self.show("custom:code-status")
        self.set_value("custom:code-status", "DNR")
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(f"{FIELDS}{pk}/", {"label": "Resuscitation status"}, format="json").status_code, 200)
        item = self.items()["custom:code-status"]
        self.assertEqual((item["label"], item["value"]), ("Resuscitation status", "DNR"))

    def test_delete_removes_item_values_and_layout_entry(self):
        pk = self.create().json()["id"]
        self.show("name", "custom:code-status")
        self.set_value("custom:code-status", "DNR")
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f"{FIELDS}{pk}/").status_code, 204)
        self.assertEqual(list(self.items()), ["name"])
        self.assertFalse(HeaderFieldDefinition.objects.exists())
        self.assertEqual([i["key"] for i in PatientHeaderConfig.objects.get().items], ["name"])
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.delete(f"{FIELDS}{pk}/").status_code, 403)

    def test_edit_dialog_data_lists_custom_fields_with_values(self):
        self.create(label="Isolation")
        self.set_value("custom:isolation", "Droplet")
        self.client.force_authenticate(self.nurse)
        fields = self.client.get(HEADER.format(self.patient.pk)).json()["custom_fields"]
        self.assertEqual(fields, [{"key": "custom:isolation", "label": "Isolation", "field_type": "text", "value": "Droplet"}])
