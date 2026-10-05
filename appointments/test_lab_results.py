"""Lab results: reading values/ranges/flags, entering and changing a report,
who may view / enter / review, review reset on change, and the org add-on switch."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Organization
from users.rights import user_has_right

from . import lab_results as lr
from .models import Appointment, LabReport, Order, Orderable
from . import orders_workflow as ow

User = get_user_model()
URL = "/api/lab-reports/"


def make_user(username, role, org):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password="pw-12345-xyz", role=role, organization=org
    )


class ParsingTests(SimpleTestCase):
    def test_numbers(self):
        self.assertEqual(lr.parse_number("5.4"), Decimal("5.4"))
        self.assertEqual(lr.parse_number(" 1,200 "), Decimal("1200"))
        self.assertEqual(lr.parse_number("-3"), Decimal("-3"))
        for text in ("<5", "Negative", "", None, "5.4 mg", "1.2.3"):
            self.assertIsNone(lr.parse_number(text), text)

    def test_ranges(self):
        d = Decimal
        self.assertEqual(lr.parse_reference_range("3.5-5.0"), (d("3.5"), d("5.0")))
        self.assertEqual(lr.parse_reference_range("3.5 - 5.0"), (d("3.5"), d("5.0")))
        self.assertEqual(lr.parse_reference_range("70 to 99"), (d("70"), d("99")))
        self.assertEqual(lr.parse_reference_range("<5.7"), (None, d("5.7")))
        self.assertEqual(lr.parse_reference_range("<= 200"), (None, d("200")))
        self.assertEqual(lr.parse_reference_range("≤ 200"), (None, d("200")))
        self.assertEqual(lr.parse_reference_range(">40"), (d("40"), None))
        self.assertEqual(lr.parse_reference_range("≥ 40"), (d("40"), None))
        self.assertEqual(lr.parse_reference_range("1,000-2,000"), (d("1000"), d("2000")))
        for text in ("Negative", "See comment", "", None, "10-5"):
            self.assertEqual(lr.parse_reference_range(text), (None, None), text)

    def test_flag_aliases(self):
        self.assertEqual(lr.normalize_flag("high"), "H")
        self.assertEqual(lr.normalize_flag(" Critical Low "), "LL")
        self.assertEqual(lr.normalize_flag("N"), "")
        self.assertEqual(lr.normalize_flag(None), "")
        self.assertIsNone(lr.normalize_flag("banana"))

    def test_flag_is_worked_out_from_the_range(self):
        d = Decimal
        self.assertEqual(lr.derive_flag(d("2.9"), d("3.5"), d("5.0")), "L")
        self.assertEqual(lr.derive_flag(d("5.1"), d("3.5"), d("5.0")), "H")
        self.assertEqual(lr.derive_flag(d("3.5"), d("3.5"), d("5.0")), "")
        self.assertEqual(lr.derive_flag(d("5.0"), d("3.5"), d("5.0")), "")
        self.assertEqual(lr.derive_flag(d("6"), None, d("5.7")), "H")
        self.assertEqual(lr.derive_flag(d("30"), d("40"), None), "L")
        self.assertEqual(lr.derive_flag(None, d("1"), d("2")), "")
        # a flag that was given wins, and critical is never guessed
        self.assertEqual(lr.derive_flag(d("4"), d("3.5"), d("5.0"), "A"), "A")
        self.assertEqual(lr.derive_flag(d("999"), d("3.5"), d("5.0")), "H")

    def test_prepare_item(self):
        item = lr.prepare_item({"test_name": "Potassium", "value": "5.4", "units": "mmol/L", "reference_range": "3.5-5.0"})
        self.assertEqual(item["abnormal_flag"], "H")
        self.assertEqual(item["value_numeric"], Decimal("5.4"))
        self.assertEqual((item["ref_low"], item["ref_high"]), (Decimal("3.5"), Decimal("5.0")))

    def test_text_values_have_no_number_and_no_computed_flag(self):
        item = lr.prepare_item({"test_name": "Urine nitrite", "value": "Positive", "reference_range": "Negative"})
        self.assertIsNone(item["value_numeric"])
        self.assertEqual(item["abnormal_flag"], "")
        flagged = lr.prepare_item({"test_name": "Urine nitrite", "value": "Positive", "abnormal_flag": "A"})
        self.assertEqual(flagged["abnormal_flag"], "A")

    def test_prepare_item_rejects_bad_lines(self):
        for bad in (
            {"value": "5"},
            {"test_name": "Na"},
            {"test_name": "Na", "value": "  "},
            {"test_name": "Na", "value": "5", "abnormal_flag": "zzz"},
        ):
            with self.assertRaises(lr.LabResultError):
                lr.prepare_item(bad)

    def test_prepare_items_limits(self):
        with self.assertRaises(lr.LabResultError):
            lr.prepare_items([])
        with self.assertRaises(lr.LabResultError):
            lr.prepare_items([{"test_name": "x", "value": "1"}] * (lr.MAX_ITEMS + 1))


class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other_org = Organization.objects.create(name="Clinic B")
        self.doctor = make_user("doc", "doctor", self.org)
        self.doctor2 = make_user("doc2", "doctor", self.org)
        self.nurse = make_user("nurse", "nurse", self.org)
        self.admin = make_user("adm", "admin", self.org)
        self.registrar = make_user("reg", "registrar", self.org)
        self.patient = make_user("pat", "patient", self.org)
        self.outsider = make_user("out", "doctor", self.other_org)
        self.other_patient = make_user("pat2", "patient", self.other_org)
        self.sysadmin = make_user("sys", "system_admin", None)
        self.client = APIClient()

    def body(self, **extra):
        data = {
            "patient": self.patient.pk,
            "title": "Basic metabolic panel",
            "performing_lab": "Quest Diagnostics",
            "items": [
                {"test_name": "Potassium", "value": "5.4", "units": "mmol/L", "reference_range": "3.5-5.0"},
                {"test_name": "Sodium", "value": "140", "units": "mmol/L", "reference_range": "135-145"},
            ],
        }
        data.update(extra)
        return data

    def enter(self, user=None, **extra):
        self.client.force_authenticate(user or self.doctor)
        response = self.client.post(URL, self.body(**extra), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()


class RightsTests(Base):
    def test_default_rights_by_role(self):
        for user in (self.doctor, self.nurse):
            for code in ("lab_results.view", "lab_results.enter", "lab_results.review"):
                self.assertTrue(user_has_right(user, code), (user.role, code))
        self.assertTrue(user_has_right(self.admin, "lab_results.view"))
        self.assertTrue(user_has_right(self.admin, "lab_results.enter"))
        self.assertFalse(user_has_right(self.admin, "lab_results.review"))
        for code in ("lab_results.view", "lab_results.enter", "lab_results.review"):
            self.assertFalse(user_has_right(self.registrar, code))
            self.assertFalse(user_has_right(self.patient, code))
            self.assertTrue(user_has_right(self.sysadmin, code))


class EnterTests(Base):
    def test_enter_report_with_computed_flags(self):
        data = self.enter()
        self.assertEqual(data["review_status"], "unreviewed")
        self.assertEqual(data["status"], "final")
        self.assertEqual(data["source"], "manual")
        self.assertTrue(data["has_abnormal"])
        self.assertFalse(data["has_critical"])
        flags = {i["test_name"]: i["abnormal_flag"] for i in data["items"]}
        self.assertEqual(flags, {"Potassium": "H", "Sodium": ""})
        self.assertEqual(data["organization"], self.org.pk)
        self.assertEqual(data["entered_by"], self.doctor.pk)
        self.assertEqual([e["event_type"] for e in data["events"]], ["entered"])
        self.assertIsNotNone(data["resulted_at"])

    def test_critical_flag_is_kept_and_reported(self):
        data = self.enter(items=[{"test_name": "Potassium", "value": "6.9", "reference_range": "3.5-5.0", "abnormal_flag": "HH"}])
        self.assertTrue(data["has_critical"])
        self.assertEqual(data["items"][0]["abnormal_flag"], "HH")

    def test_nurse_and_admin_can_enter(self):
        self.enter(self.nurse)
        self.enter(self.admin)

    def test_registrar_and_patient_cannot_see_or_enter(self):
        for user in (self.registrar, self.patient):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(URL, self.body(), format="json").status_code, 403)
            self.assertEqual(self.client.get(URL).status_code, 403)

    def test_login_required(self):
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def test_validation_messages(self):
        self.client.force_authenticate(self.doctor)
        bad = [
            self.body(items=[]),
            self.body(title=""),
            self.body(items=[{"test_name": "Na", "value": ""}]),
            self.body(items=[{"test_name": "Na", "value": "1", "abnormal_flag": "zzz"}]),
            self.body(status="entered_in_error"),
        ]
        for payload in bad:
            self.assertEqual(self.client.post(URL, payload, format="json").status_code, 400, payload)
        no_patient = self.body()
        del no_patient["patient"]
        self.assertEqual(self.client.post(URL, no_patient, format="json").status_code, 400)

    def test_cannot_enter_for_another_organizations_patient(self):
        self.client.force_authenticate(self.doctor)
        response = self.client.post(URL, self.body(patient=self.other_patient.pk), format="json")
        self.assertEqual(response.status_code, 404)

    def test_patient_must_be_a_patient(self):
        self.client.force_authenticate(self.doctor)
        response = self.client.post(URL, self.body(patient=self.nurse.pk), format="json")
        self.assertEqual(response.status_code, 404)

    def test_system_admin_can_enter_for_any_organization(self):
        self.client.force_authenticate(self.sysadmin)
        response = self.client.post(URL, self.body(patient=self.other_patient.pk), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["organization"], self.other_org.pk)

    def test_can_attach_to_an_order_of_the_same_patient(self):
        appt = Appointment.objects.create(
            organization=self.org,
            patient=self.patient,
            provider=self.doctor,
            title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        cbc = Orderable.objects.create(code="bmp", name="BMP", category="laboratory")
        order = ow.create_draft_order(self.doctor, appt, cbc)
        data = self.enter(order=order.pk)
        self.assertEqual(data["order"], order.pk)
        self.assertEqual(data["order_name"], "BMP")
        self.assertEqual(data["placer_order_number"], order.placer_order_number)
        self.client.force_authenticate(self.doctor)
        listed = self.client.get(URL, {"order": order.pk}).json()
        self.assertEqual([r["id"] for r in listed], [data["id"]])

    def test_order_of_a_different_patient_is_refused(self):
        other = make_user("pat3", "patient", self.org)
        appt = Appointment.objects.create(
            organization=self.org,
            patient=other,
            provider=self.doctor,
            title="Visit",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        cbc = Orderable.objects.create(code="bmp", name="BMP", category="laboratory")
        order = ow.create_draft_order(self.doctor, appt, cbc)
        self.client.force_authenticate(self.doctor)
        self.assertEqual(self.client.post(URL, self.body(order=order.pk), format="json").status_code, 404)


class ListTests(Base):
    def test_scoped_to_organization_and_filterable(self):
        mine = self.enter()
        self.enter(items=[{"test_name": "Sodium", "value": "140", "reference_range": "135-145"}], title="Sodium")
        self.client.force_authenticate(self.outsider)
        other = self.client.post(URL, self.body(patient=self.other_patient.pk), format="json")
        self.assertEqual(other.status_code, 201)

        self.client.force_authenticate(self.doctor)
        everything = self.client.get(URL).json()
        self.assertEqual(len(everything), 2)
        self.assertNotIn(other.json()["id"], [r["id"] for r in everything])
        self.assertEqual(len(self.client.get(URL, {"patient": self.patient.pk}).json()), 2)
        abnormal = self.client.get(URL, {"abnormal": "1"}).json()
        self.assertEqual([r["id"] for r in abnormal], [mine["id"]])
        self.assertEqual(len(self.client.get(URL, {"review_status": "unreviewed"}).json()), 2)
        self.assertEqual(len(self.client.get(URL, {"review_status": "reviewed"}).json()), 0)
        # another clinic's report can't be fetched by id either
        self.assertEqual(self.client.get(f"{URL}{other.json()['id']}/").status_code, 404)

    def test_system_admin_sees_every_organization(self):
        self.enter()
        self.client.force_authenticate(self.outsider)
        self.client.post(URL, self.body(patient=self.other_patient.pk), format="json")
        self.client.force_authenticate(self.sysadmin)
        self.assertEqual(len(self.client.get(URL).json()), 2)


class ReviewTests(Base):
    def review(self, user, report_id, comment=""):
        self.client.force_authenticate(user)
        return self.client.post(f"{URL}{report_id}/review/", {"comment": comment}, format="json")

    def test_any_clinician_can_review_not_only_the_one_who_entered_it(self):
        data = self.enter(self.doctor)
        for reviewer in (self.doctor2, self.nurse):
            report = self.enter(self.doctor)
            response = self.review(reviewer, report["id"], "Called patient")
            self.assertEqual(response.status_code, 200, response.content)
            body = response.json()
            self.assertEqual(body["review_status"], "reviewed")
            self.assertEqual(body["reviewed_by"], reviewer.pk)
            self.assertEqual(body["review_comment"], "Called patient")
            self.assertIsNotNone(body["reviewed_at"])
            self.assertIn("reviewed", [e["event_type"] for e in body["events"]])
        self.assertEqual(self.review(self.doctor, data["id"]).status_code, 200)

    def test_admin_registrar_and_patient_cannot_review(self):
        data = self.enter()
        for user in (self.admin, self.registrar, self.patient):
            self.assertEqual(self.review(user, data["id"]).status_code, 403, user.role)
        self.assertEqual(LabReport.objects.get(pk=data["id"]).review_status, "unreviewed")

    def test_other_clinics_report_is_not_reviewable(self):
        data = self.enter()
        self.assertEqual(self.review(self.outsider, data["id"]).status_code, 404)

    def test_reviewing_twice_changes_nothing(self):
        data = self.enter()
        self.review(self.doctor, data["id"], "first")
        again = self.review(self.nurse, data["id"], "second").json()
        self.assertEqual(again["reviewed_by"], self.doctor.pk)
        self.assertEqual(again["review_comment"], "first")
        self.assertEqual(len([e for e in again["events"] if e["event_type"] == "reviewed"]), 1)

    def test_changing_results_sends_a_reviewed_report_back_to_unreviewed(self):
        data = self.enter()
        self.review(self.doctor, data["id"])
        self.client.force_authenticate(self.doctor)
        response = self.client.patch(
            f"{URL}{data['id']}/",
            {"items": [{"test_name": "Potassium", "value": "4.1", "reference_range": "3.5-5.0"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["review_status"], "unreviewed")
        self.assertIsNone(body["reviewed_by"])
        self.assertEqual(body["status"], "corrected")
        self.assertFalse(body["has_abnormal"])
        types = [e["event_type"] for e in body["events"]]
        self.assertIn("updated", types)
        self.assertIn("review_reset", types)

    def test_resending_identical_results_is_not_a_change(self):
        data = self.enter()
        self.review(self.doctor, data["id"])
        self.client.force_authenticate(self.doctor)
        same = [
            {k: i[k] for k in ("test_name", "value", "units", "reference_range", "abnormal_flag", "loinc_code")}
            for i in data["items"]
        ]
        body = self.client.patch(f"{URL}{data['id']}/", {"items": same, "comment": "Fasting"}, format="json").json()
        self.assertEqual(body["review_status"], "reviewed")
        self.assertEqual(body["status"], "final")
        self.assertEqual(len(body["items"]), 2)

    def test_editing_only_a_comment_keeps_the_review(self):
        data = self.enter()
        self.review(self.doctor, data["id"])
        self.client.force_authenticate(self.doctor)
        body = self.client.patch(f"{URL}{data['id']}/", {"performing_lab": "Labcorp", "comment": "Fasting"}, format="json").json()
        self.assertEqual(body["review_status"], "reviewed")
        self.assertEqual(body["status"], "final")
        self.assertEqual((body["performing_lab"], body["comment"]), ("Labcorp", "Fasting"))


class UpdateAndErrorTests(Base):
    def test_a_preliminary_report_can_become_final_with_new_values(self):
        data = self.enter(status="preliminary")
        self.client.force_authenticate(self.nurse)
        body = self.client.patch(
            f"{URL}{data['id']}/",
            {"status": "final", "items": [{"test_name": "Potassium", "value": "4.0", "reference_range": "3.5-5.0"}]},
            format="json",
        ).json()
        self.assertEqual(body["status"], "final")
        self.assertEqual(len(body["items"]), 1)

    def test_patch_cannot_move_a_report_to_another_patient(self):
        data = self.enter()
        self.client.force_authenticate(self.doctor)
        other = make_user("pat4", "patient", self.org)
        body = self.client.patch(f"{URL}{data['id']}/", {"patient": other.pk, "comment": "x"}, format="json").json()
        self.assertEqual(body["patient"], self.patient.pk)

    def test_no_delete_and_no_put(self):
        data = self.enter()
        self.assertEqual(self.client.delete(f"{URL}{data['id']}/").status_code, 405)
        self.assertEqual(self.client.put(f"{URL}{data['id']}/", self.body(), format="json").status_code, 405)

    def test_mark_entered_in_error_needs_a_reason_and_locks_the_report(self):
        data = self.enter()
        self.client.force_authenticate(self.doctor)
        url = f"{URL}{data['id']}/mark-error/"
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        body = self.client.post(url, {"reason": "Wrong patient"}, format="json").json()
        self.assertEqual(body["status"], "entered_in_error")
        self.assertEqual(body["error_reason"], "Wrong patient")
        self.assertIn("entered_in_error", [e["event_type"] for e in body["events"]])
        self.assertEqual(self.client.patch(f"{URL}{data['id']}/", {"comment": "x"}, format="json").status_code, 409)
        self.assertEqual(self.client.post(f"{URL}{data['id']}/review/", {}, format="json").status_code, 409)
        # still there: nothing is ever deleted
        self.assertTrue(LabReport.objects.filter(pk=data["id"]).exists())

    def test_reviewer_without_enter_right_cannot_mark_error(self):
        data = self.enter()
        self.client.force_authenticate(self.registrar)
        self.assertEqual(self.client.post(f"{URL}{data['id']}/mark-error/", {"reason": "x"}, format="json").status_code, 403)


class OrganizationSwitchTests(Base):
    def test_lab_add_on_is_off_by_default_and_only_system_admin_can_change_it(self):
        self.assertFalse(self.org.lab_interface_enabled)
        # a clinic admin editing their own organization can't turn the paid add-on on
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f"/api/users/organizations/{self.org.pk}/", {"lab_interface_enabled": True, "city": "Brooklyn"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.org.refresh_from_db()
        self.assertFalse(self.org.lab_interface_enabled)
        self.assertEqual(self.org.city, "Brooklyn")
        self.assertIn("lab_interface_enabled", response.json())

        self.client.force_authenticate(self.sysadmin)
        response = self.client.patch(f"/api/users/organizations/{self.org.pk}/", {"lab_interface_enabled": True}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.org.refresh_from_db()
        self.assertTrue(self.org.lab_interface_enabled)
