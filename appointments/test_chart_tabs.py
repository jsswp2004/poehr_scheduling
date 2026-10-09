from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Organization

from .chart_tabs import KEYS

User = get_user_model()
ALL = "/api/chart-tabs/"
MINE = "/api/chart-tabs/mine/"
DEFAULTS = "/api/chart-tabs/defaults/"


def make_user(username, role, org):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org)


def items(*pairs):
    return [{"key": k, "visible": v} for k, v in pairs]


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Riverside Clinic")
        self.other = Organization.objects.create(name="Other Clinic")
        self.admin = make_user("adm", "admin", self.org)
        self.doctor = make_user("doc", "doctor", self.org)
        self.doctor2 = make_user("doc2", "doctor", self.org)
        self.registrar = make_user("reg", "registrar", self.org)
        self.outsider = make_user("out", "doctor", self.other)
        self.patient = make_user("pat", "patient", self.org)
        self.client = APIClient()

    def layout(self, user, care="emergency"):
        self.client.force_authenticate(user)
        response = self.client.get(ALL)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["settings"][care]

    def set_default(self, tabs, default_tab="", care="emergency", user=None):
        self.client.force_authenticate(user or self.admin)
        return self.client.put(DEFAULTS, {"care_setting": care, "items": tabs, "default_tab": default_tab}, format="json")

    def set_mine(self, user, tabs, default_tab="", care="emergency"):
        self.client.force_authenticate(user)
        return self.client.put(MINE, {"care_setting": care, "items": tabs, "default_tab": default_tab}, format="json")


class BuiltInTests(Base):
    def test_everyone_gets_every_tab_by_default(self):
        out = self.layout(self.doctor)
        self.assertEqual(out["tabs"], KEYS)
        self.assertEqual(out["default_tab"], "patient_list")
        self.assertFalse(out["customized"])
        self.assertEqual([i["key"] for i in out["items"]], KEYS)

    def test_non_clinical_roles_never_get_clinical_tabs(self):
        out = self.layout(self.registrar)
        self.assertEqual(out["tabs"], ["patient_list", "patient_info", "my_schedule", "referral_list", "messages"])

    def test_patients_are_refused_and_anonymous_too(self):
        self.client.force_authenticate(self.patient)
        self.assertEqual(self.client.get(ALL).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(ALL).status_code, (401, 403))

    def test_catalog_and_edit_flag(self):
        self.client.force_authenticate(self.admin)
        body = self.client.get(ALL).json()
        self.assertTrue(body["can_edit_defaults"])
        self.assertEqual([c["key"] for c in body["catalog"]], KEYS)
        self.client.force_authenticate(self.doctor)
        self.assertFalse(self.client.get(ALL).json()["can_edit_defaults"])


class ClinicDefaultTests(Base):
    def test_admin_sets_tabs_order_and_opening_tab_per_module(self):
        tabs = items(("patient_list", True), ("documents", True), ("orders", True), ("results", True), ("flowsheets", False))
        response = self.set_default(tabs, "orders", care="acute")
        self.assertEqual(response.status_code, 200, response.content)
        acute = self.layout(self.doctor, "acute")
        self.assertEqual(acute["tabs"], ["patient_list", "documents", "orders", "results"])
        self.assertEqual(acute["default_tab"], "orders")
        # the other modules are untouched
        self.assertEqual(self.layout(self.doctor, "emergency")["tabs"], KEYS)

    def test_tabs_left_out_are_hidden_not_lost(self):
        self.set_default(items(("patient_list", True), ("orders", True)))
        out = self.client.get(DEFAULTS).json()["settings"]["emergency"]
        self.assertEqual([i["key"] for i in out["items"]], ["patient_list", "orders"] + [k for k in KEYS if k not in ("patient_list", "orders")])
        self.assertEqual([i["key"] for i in out["items"] if i["visible"]], ["patient_list", "orders"])

    def test_patient_list_cannot_be_hidden(self):
        response = self.set_default(items(("patient_list", False), ("orders", True)))
        self.assertEqual(response.status_code, 200)
        self.assertIn("patient_list", self.layout(self.doctor)["tabs"])

    def test_only_admins_can_change_defaults(self):
        for user in (self.doctor, self.registrar):
            self.assertEqual(self.set_default(items(("patient_list", True)), user=user).status_code, 403)
        self.client.force_authenticate(self.doctor)
        self.assertEqual(self.client.get(DEFAULTS).status_code, 403)
        self.assertEqual(self.client.delete(DEFAULTS + "?care_setting=emergency").status_code, 403)

    def test_bad_input_is_refused(self):
        cases = [
            ({"care_setting": "icu", "items": items(("orders", True))}, "care_setting"),
            ({"care_setting": "acute", "items": "nope"}, "list"),
            ({"care_setting": "acute", "items": items(("bogus", True))}, "Unknown tab"),
            ({"care_setting": "acute", "items": items(("orders", True), ("orders", True))}, "twice"),
            ({"care_setting": "acute", "items": items(("orders", False))}, None),  # patient list is forced on, so this is fine
            ({"care_setting": "acute", "items": items(("orders", True)), "default_tab": "results"}, "opening tab"),
        ]
        self.client.force_authenticate(self.admin)
        for payload, text in cases:
            response = self.client.put(DEFAULTS, payload, format="json")
            if text is None:
                self.assertEqual(response.status_code, 200)
            else:
                self.assertEqual(response.status_code, 400, payload)
                self.assertIn(text, response.json()["detail"])

    def test_default_is_per_clinic(self):
        self.set_default(items(("patient_list", True), ("orders", True)))
        self.assertEqual(self.layout(self.outsider)["tabs"], KEYS)

    def test_reset_returns_to_built_in(self):
        self.set_default(items(("patient_list", True), ("orders", True)))
        response = self.client.delete(DEFAULTS + "?care_setting=emergency")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.layout(self.doctor)["tabs"], KEYS)

    def test_opening_tab_falls_back_when_not_visible_to_the_role(self):
        self.set_default(items(("patient_list", True), ("orders", True), ("patient_info", True)), "orders")
        self.assertEqual(self.layout(self.doctor)["default_tab"], "orders")
        reg = self.layout(self.registrar)
        self.assertEqual(reg["tabs"], ["patient_list", "patient_info"])
        self.assertEqual(reg["default_tab"], "patient_list")


class PersonalTabTests(Base):
    def test_a_person_can_reorder_hide_and_pick_the_opening_tab(self):
        mine = items(("patient_list", True), ("flowsheets", True), ("orders", True), ("results", False))
        response = self.set_mine(self.doctor, mine, "flowsheets")
        self.assertEqual(response.status_code, 200, response.content)
        out = self.layout(self.doctor)
        self.assertEqual(out["tabs"][:3], ["patient_list", "flowsheets", "orders"])
        self.assertNotIn("results", out["tabs"])
        self.assertEqual(out["default_tab"], "flowsheets")
        self.assertTrue(out["customized"])
        # everything the person did not mention is still there, at the end
        self.assertEqual(set(out["tabs"]), set(KEYS) - {"results"})

    def test_it_changes_only_that_person(self):
        self.set_mine(self.doctor, items(("patient_list", True), ("orders", True)))
        self.assertEqual(self.layout(self.doctor2)["tabs"], KEYS)
        self.assertFalse(self.layout(self.doctor2)["customized"])

    def test_it_only_changes_that_module(self):
        self.set_mine(self.doctor, items(("patient_list", True), ("orders", False)), care="acute")
        self.assertIn("orders", self.layout(self.doctor, "emergency")["tabs"])
        self.assertNotIn("orders", self.layout(self.doctor, "acute")["tabs"])

    def test_cannot_turn_on_a_tab_the_clinic_turned_off(self):
        self.set_default(items(("patient_list", True), ("orders", True)))
        response = self.set_mine(self.doctor, items(("patient_list", True), ("orders", True), ("results", True)))
        self.assertEqual(response.status_code, 400)
        self.assertIn("not available", response.json()["detail"])

    def test_clinic_turning_a_tab_off_removes_it_for_everyone(self):
        self.set_mine(self.doctor, items(("patient_list", True), ("orders", True), ("results", True)), "results")
        self.set_default(items(("patient_list", True), ("orders", True)))
        out = self.layout(self.doctor)
        self.assertEqual(out["tabs"], ["patient_list", "orders"])
        self.assertEqual(out["default_tab"], "patient_list")  # their choice is gone, so it falls back

    def test_clinic_adding_a_tab_later_shows_up_for_a_customized_person(self):
        self.set_default(items(("patient_list", True), ("orders", True)))
        self.set_mine(self.doctor, items(("orders", True), ("patient_list", True)))
        self.set_default(items(("patient_list", True), ("orders", True), ("results", True)))
        self.assertEqual(self.layout(self.doctor)["tabs"], ["orders", "patient_list", "results"])

    def test_person_without_a_choice_follows_the_clinic_opening_tab(self):
        self.set_default(items(("patient_list", True), ("orders", True)), "orders")
        self.assertEqual(self.layout(self.doctor)["default_tab"], "orders")
        self.set_mine(self.doctor, items(("patient_list", True), ("orders", True)), "")
        self.assertEqual(self.layout(self.doctor)["default_tab"], "orders")
        self.set_mine(self.doctor, items(("patient_list", True), ("orders", True)), "patient_list")
        self.assertEqual(self.layout(self.doctor)["default_tab"], "patient_list")
        self.assertEqual(self.layout(self.doctor)["my_default_tab"], "patient_list")

    def test_reset_my_tabs(self):
        self.set_mine(self.doctor, items(("patient_list", True), ("orders", False)))
        self.client.force_authenticate(self.doctor)
        response = self.client.delete(MINE + "?care_setting=emergency")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["customized"])
        self.assertEqual(self.layout(self.doctor)["tabs"], KEYS)

    def test_saving_twice_updates_in_place(self):
        self.set_mine(self.doctor, items(("patient_list", True), ("orders", True)))
        self.set_mine(self.doctor, items(("patient_list", True), ("results", True)))
        from .models import ChartTabLayout

        self.assertEqual(ChartTabLayout.objects.filter(user=self.doctor, care_setting="emergency").count(), 1)

    def test_bad_input_and_patients_refused(self):
        self.client.force_authenticate(self.doctor)
        self.assertEqual(self.client.put(MINE, {"care_setting": "x", "items": []}, format="json").status_code, 400)
        self.assertEqual(self.client.put(MINE, {"care_setting": "acute", "items": items(("bogus", True))}, format="json").status_code, 400)
        self.assertEqual(self.client.put(MINE, {"care_setting": "acute", "items": items(("orders", True)), "default_tab": "results"}, format="json").status_code, 400)
        self.client.force_authenticate(self.patient)
        self.assertEqual(self.client.put(MINE, {"care_setting": "acute", "items": items(("orders", True))}, format="json").status_code, 403)

    def test_registrar_can_personalize_non_clinical_tabs(self):
        response = self.set_mine(self.registrar, items(("patient_info", True), ("patient_list", True)))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.layout(self.registrar)["tabs"][:2], ["patient_info", "patient_list"])
