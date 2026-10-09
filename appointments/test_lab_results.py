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


# ---------------------------------------------------------------------------
# Scanned documents
# ---------------------------------------------------------------------------

from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile

from .models import LabReportFileData

UPLOAD = "/api/lab-reports/upload/"
PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def pdf(name="scan.pdf", content=PDF):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


class FileTypeTests(SimpleTestCase):
    def test_type_comes_from_the_bytes_not_the_name(self):
        self.assertEqual(lr.sniff_content_type(PDF[:16]), "application/pdf")
        self.assertEqual(lr.sniff_content_type(JPEG[:16]), "image/jpeg")
        self.assertEqual(lr.sniff_content_type(PNG[:16]), "image/png")
        self.assertIsNone(lr.sniff_content_type(b"MZ\x90\x00 not a pdf"))
        self.assertIsNone(lr.sniff_content_type(b"<html><script>"))
        self.assertIsNone(lr.sniff_content_type(b""))

    def test_filenames_are_just_a_name(self):
        self.assertEqual(lr.safe_filename("../../etc/passwd"), "passwd")
        self.assertEqual(lr.safe_filename("C:\\scans\\bmp 1.pdf"), "bmp 1.pdf")
        self.assertEqual(lr.safe_filename('a"b<c>.pdf'), "abc.pdf")
        self.assertEqual(lr.safe_filename(""), "scan")
        self.assertLessEqual(len(lr.safe_filename("x" * 500 + ".pdf")), 150)


class UploadTests(Base):
    def upload(self, user=None, file=None, **fields):
        self.client.force_authenticate(user or self.registrar)
        data = {"patient": self.patient.pk, **fields}
        if file is not False:
            data["file"] = file or pdf()
        return self.client.post(UPLOAD, data, format="multipart")

    def test_front_desk_can_upload_but_not_read_results_back(self):
        response = self.upload(self.registrar, title="Quest BMP 10/1")
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["title"], "Quest BMP 10/1")
        self.assertNotIn("items", body)  # a confirmation only
        report = LabReport.objects.get(pk=body["id"])
        self.assertEqual((report.source, report.review_status, report.status), ("scan", "unreviewed", "final"))
        self.assertEqual(report.entered_by, self.registrar)
        self.assertEqual(report.file_content_type, "application/pdf")
        self.assertEqual(report.file_size, len(PDF))
        self.assertEqual(bytes(LabReportFileData.objects.get(report=report).data), PDF)
        # ...and cannot list, open or download
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.client.get(f"{URL}{report.pk}/file/").status_code, 403)

    def test_receptionist_can_upload_too(self):
        reception = make_user("rec", "receptionist", self.org)
        self.assertEqual(self.upload(reception).status_code, 201)

    def test_clinician_gets_the_full_report_back_and_it_waits_for_review(self):
        body = self.upload(self.doctor).json()
        self.assertEqual(body["source"], "scan")
        self.assertEqual(body["review_status"], "unreviewed")
        self.assertTrue(body["has_file"])
        self.assertEqual(body["file_name"], "scan.pdf")
        self.assertEqual(body["items"], [])
        self.assertEqual([e["event_type"] for e in body["events"]], ["uploaded"])
        self.assertNotIn("data", body)

    def test_title_defaults_to_the_file_name(self):
        self.assertEqual(self.upload(file=pdf("Quest results.pdf")).json()["title"], "Quest results")

    def test_jpeg_and_png_are_accepted(self):
        self.assertEqual(self.upload(file=SimpleUploadedFile("a.jpg", JPEG)).status_code, 201)
        self.assertEqual(self.upload(file=SimpleUploadedFile("b.png", PNG)).status_code, 201)

    def test_wrong_kinds_of_file_are_refused_whatever_they_are_called(self):
        for name, content in (("evil.pdf", b"MZ\x90\x00 program"), ("page.pdf", b"<html><script>x</script>"), ("x.exe", b"MZ")):
            response = self.upload(file=SimpleUploadedFile(name, content, content_type="application/pdf"))
            self.assertEqual(response.status_code, 400, name)
            self.assertIn("PDF, JPEG or PNG", response.json()["detail"])
        self.assertEqual(self.upload(file=SimpleUploadedFile("empty.pdf", b"")).status_code, 400)
        self.assertEqual(LabReport.objects.count(), 0)

    def test_too_large_is_refused(self):
        with mock.patch.object(lr, "MAX_FILE_BYTES", 10):
            response = self.upload()
        self.assertEqual(response.status_code, 400)
        self.assertIn("too large", response.json()["detail"])

    def test_file_and_patient_are_required(self):
        self.assertEqual(self.upload(file=False).status_code, 400)
        self.client.force_authenticate(self.registrar)
        self.assertEqual(self.client.post(UPLOAD, {"file": pdf()}, format="multipart").status_code, 400)

    def test_cannot_upload_for_another_organizations_patient(self):
        response = self.upload(patient=self.other_patient.pk)
        self.assertEqual(response.status_code, 404)

    def test_patients_and_anonymous_cannot_upload(self):
        self.assertEqual(self.upload(self.patient).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(UPLOAD, {"patient": self.patient.pk, "file": pdf()}, format="multipart").status_code, (401, 403))

    def test_same_file_twice_is_a_conflict_unless_allowed(self):
        first = self.upload().json()
        again = self.upload()
        self.assertEqual(again.status_code, 409)
        body = again.json()
        self.assertEqual(body["errors"][0]["duplicate_of"], first["id"])
        self.assertEqual(LabReport.objects.count(), 1)
        allowed = self.upload(allow_duplicate="true")
        self.assertEqual(allowed.status_code, 201)
        self.assertEqual(LabReport.objects.count(), 2)

    def test_same_file_for_a_different_patient_is_not_a_duplicate(self):
        other = make_user("pat5", "patient", self.org)
        self.upload()
        self.assertEqual(self.upload(patient=other.pk).status_code, 201)

    def test_a_file_marked_in_error_can_be_uploaded_again(self):
        first = self.upload().json()
        self.client.force_authenticate(self.doctor)
        self.client.post(f"{URL}{first['id']}/mark-error/", {"reason": "Wrong patient"}, format="json")
        self.assertEqual(self.upload().status_code, 201)

    def test_can_link_to_an_order_and_record_the_lab(self):
        appt = Appointment.objects.create(
            organization=self.org, patient=self.patient, provider=self.doctor, title="V",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        order = ow.create_draft_order(self.doctor, appt, Orderable.objects.create(code="bmp", name="BMP", category="laboratory"))
        body = self.upload(self.doctor, order=str(order.pk), performing_lab="Labcorp", collected_at="2026-10-01T09:30:00Z").json()
        self.assertEqual((body["order"], body["performing_lab"]), (order.pk, "Labcorp"))
        from datetime import datetime, timezone as dt_timezone

        self.assertEqual(
            datetime.fromisoformat(body["collected_at"].replace("Z", "+00:00")),
            datetime(2026, 10, 1, 9, 30, tzinfo=dt_timezone.utc),
        )

    def test_bad_collected_date_is_a_clear_error(self):
        self.assertEqual(self.upload(collected_at="yesterday-ish").status_code, 400)


class FileViewingTests(Base):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.registrar)
        self.report_id = self.client.post(UPLOAD, {"patient": self.patient.pk, "file": pdf("a.pdf")}, format="multipart").json()["id"]

    def test_clinician_downloads_the_exact_file_with_safe_headers(self):
        self.client.force_authenticate(self.nurse)
        response = self.client.get(f"{URL}{self.report_id}/file/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, PDF)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertIn("sandbox", response["Content-Security-Policy"])
        self.assertIn('filename="a.pdf"', response["Content-Disposition"])

    def test_every_opening_is_recorded_with_who_and_when(self):
        self.client.force_authenticate(self.nurse)
        self.client.get(f"{URL}{self.report_id}/file/")
        self.client.force_authenticate(self.doctor)
        self.client.get(f"{URL}{self.report_id}/file/")
        events = self.client.get(f"{URL}{self.report_id}/").json()["events"]
        opened = [e for e in events if e["event_type"] == "file_viewed"]
        self.assertEqual([e["user"] for e in opened], [self.nurse.pk, self.doctor.pk])

    def test_another_clinics_staff_cannot_download(self):
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(f"{URL}{self.report_id}/file/").status_code, 404)

    def test_typed_report_has_no_file(self):
        data = self.enter(self.doctor)
        self.assertFalse(data["has_file"])
        self.assertEqual(self.client.get(f"{URL}{data['id']}/file/").status_code, 404)

    def test_listing_does_not_carry_the_file_bytes(self):
        self.client.force_authenticate(self.doctor)
        row = self.client.get(URL).json()[0]
        self.assertTrue(row["has_file"])
        self.assertNotIn("data", row)
        self.assertLess(len(str(row)), 5000)


class ScanReviewTests(Base):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.registrar)
        self.report_id = self.client.post(UPLOAD, {"patient": self.patient.pk, "file": pdf()}, format="multipart").json()["id"]

    def test_a_scan_is_reviewed_like_any_result(self):
        self.client.force_authenticate(self.nurse)
        body = self.client.post(f"{URL}{self.report_id}/review/", {"comment": "Normal"}, format="json").json()
        self.assertEqual((body["review_status"], body["reviewed_by"]), ("reviewed", self.nurse.pk))
        listed = self.client.get(URL, {"review_status": "unreviewed", "source": "scan"}).json()
        self.assertEqual(listed, [])

    def test_typing_values_in_from_the_scan_is_not_a_correction_but_does_need_review_again(self):
        self.client.force_authenticate(self.nurse)
        self.client.post(f"{URL}{self.report_id}/review/", {}, format="json")
        body = self.client.patch(
            f"{URL}{self.report_id}/",
            {"items": [{"test_name": "Potassium", "value": "5.4", "reference_range": "3.5-5.0"}]},
            format="json",
        ).json()
        self.assertEqual(body["status"], "final")  # the first values are not a "correction"
        self.assertEqual(body["review_status"], "unreviewed")
        self.assertTrue(body["has_abnormal"])
        self.assertTrue(body["has_file"])
        # a later change to those typed values IS a correction
        again = self.client.patch(f"{URL}{self.report_id}/", {"items": [{"test_name": "Potassium", "value": "4.0", "reference_range": "3.5-5.0"}]}, format="json").json()
        self.assertEqual(again["status"], "corrected")

    def test_editing_the_header_of_a_scan_without_values_works(self):
        self.client.force_authenticate(self.nurse)
        body = self.client.patch(f"{URL}{self.report_id}/", {"title": "Quest BMP", "performing_lab": "Quest Diagnostics"}, format="json").json()
        self.assertEqual((body["title"], body["performing_lab"], body["items"]), ("Quest BMP", "Quest Diagnostics", []))


class InboxTests(Base):
    INBOX = "/api/lab-reports/inbox/"

    def make(self, title, *, items=None, user=None, resulted_at=None, **extra):
        data = self.enter(user or self.doctor, title=title, items=items or [{"test_name": "Na", "value": "140", "reference_range": "135-145"}], **extra)
        if resulted_at:
            LabReport.objects.filter(pk=data["id"]).update(resulted_at=resulted_at)
        return data["id"]

    def test_most_urgent_first_critical_then_abnormal_then_oldest(self):
        now = timezone.now()
        old_normal = self.make("old normal", resulted_at=now - timedelta(days=3))
        new_normal = self.make("new normal", resulted_at=now - timedelta(days=1))
        abnormal = self.make("abnormal", items=[{"test_name": "K", "value": "5.4", "reference_range": "3.5-5.0"}], resulted_at=now - timedelta(days=2))
        critical = self.make("critical", items=[{"test_name": "K", "value": "7", "abnormal_flag": "HH"}], resulted_at=now - timedelta(hours=1))
        self.client.force_authenticate(self.nurse)
        body = self.client.get(self.INBOX).json()
        self.assertEqual([r["id"] for r in body["results"]], [critical, abnormal, old_normal, new_normal])
        self.assertEqual((body["count"], body["critical"], body["truncated"]), (4, 1, False))

    def test_summary_returns_counts_only_for_the_menu_badge(self):
        self.make("normal")
        self.make("critical", items=[{"test_name": "K", "value": "7", "abnormal_flag": "HH"}])
        self.client.force_authenticate(self.nurse)
        body = self.client.get(self.INBOX, {"summary": "1"}).json()
        self.assertEqual(body, {"unmatched": body["unmatched"], "count": 2, "critical": 1})
        self.assertNotIn("results", body)
        # same access rules as the full inbox
        self.client.force_authenticate(self.registrar)
        self.assertEqual(self.client.get(self.INBOX, {"summary": "1"}).status_code, 403)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(self.INBOX, {"summary": "1"}).json()["count"], 0)

    def test_patient_filter_narrows_the_inbox_and_its_counts(self):
        second = make_user("pat3", "patient", self.org)
        mine = self.make("for first", items=[{"test_name": "K", "value": "7", "abnormal_flag": "HH"}])
        theirs = self.make("for second", patient=second.pk)
        self.client.force_authenticate(self.nurse)
        both = self.client.get(self.INBOX).json()
        self.assertEqual({r["id"] for r in both["results"]}, {mine, theirs})
        one = self.client.get(self.INBOX, {"patient": self.patient.pk}).json()
        self.assertEqual([r["id"] for r in one["results"]], [mine])
        self.assertEqual((one["count"], one["critical"]), (1, 1))
        other = self.client.get(self.INBOX, {"patient": second.pk}).json()
        self.assertEqual([r["id"] for r in other["results"]], [theirs])
        self.assertEqual((other["count"], other["critical"]), (1, 0))
        # the menu badge (summary) is not narrowed unless asked
        self.assertEqual(self.client.get(self.INBOX, {"summary": "1"}).json()["count"], 2)

    def test_reviewed_and_in_error_reports_leave_the_inbox(self):
        a, b, c = self.make("a"), self.make("b"), self.make("c")
        self.client.force_authenticate(self.doctor)
        self.client.post(f"{URL}{a}/review/", {}, format="json")
        self.client.post(f"{URL}{b}/mark-error/", {"reason": "wrong"}, format="json")
        self.assertEqual([r["id"] for r in self.client.get(self.INBOX).json()["results"]], [c])

    def test_any_reviewer_sees_everything_and_mine_narrows_to_my_orders(self):
        appt = Appointment.objects.create(
            organization=self.org, patient=self.patient, provider=self.doctor, title="V",
            appointment_datetime=timezone.now() + timedelta(days=1),
        )
        cbc = Orderable.objects.create(code="bmp", name="BMP", category="laboratory")
        mine = ow.create_draft_order(self.doctor, appt, cbc)
        theirs = ow.create_draft_order(self.doctor2, appt, cbc)
        linked = self.make("for doc", order=mine.pk)
        other = self.make("for doc2", order=theirs.pk)
        loose = self.make("no order")
        self.client.force_authenticate(self.doctor)
        everything = {r["id"] for r in self.client.get(self.INBOX).json()["results"]}
        self.assertEqual(everything, {linked, other, loose})
        only_mine = [r["id"] for r in self.client.get(self.INBOX, {"mine": "1"}).json()["results"]]
        self.assertEqual(only_mine, [linked])
        # a covering provider and a nurse see the same full list
        for covering in (self.doctor2, self.nurse):
            self.client.force_authenticate(covering)
            self.assertEqual({r["id"] for r in self.client.get(self.INBOX).json()["results"]}, everything)

    def test_only_reviewers_in_their_own_organization(self):
        self.make("x")
        for user in (self.admin, self.registrar, self.patient):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.INBOX).status_code, 403, user.role)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(self.INBOX).json()["count"], 0)

    def test_long_inboxes_are_capped_but_counted(self):
        for i in range(3):
            self.make(f"r{i}")
        self.client.force_authenticate(self.doctor)
        with mock.patch("appointments.lab_views.LabReportViewSet.INBOX_LIMIT", 2):
            body = self.client.get(self.INBOX).json()
        self.assertEqual((body["count"], len(body["results"]), body["truncated"]), (3, 2, True))
