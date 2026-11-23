"""POWER Lab Portal: isolation, registration and approval, sending orders, claiming, the lab's steps, results and release
rules (critical calls, PH pathologist, PDF), notifications (lab / provider / patient SMS), reminders and expiry."""

from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from appointments import orders_workflow as ow
from appointments.models import Appointment, InboxAlert, LabReport, LabReportFileData, Order, Orderable
from users.models import Organization

from . import services as s
from .models import ClinicLab, LabPortalAccessLog, LabRequest, LabRequestFile, PartnerLab, PartnerLabStaff

User = get_user_model()
NEXT_YEAR = date.today() + timedelta(days=365)
BIRTHDATE = date(1972, 3, 14)
SEND = "communicator.utils.send_sms"
PDF = b"%PDF-1.4\n% signed report\n%%EOF"


def mk(username, role, org=None, **kw):
    return User.objects.create_user(username=username, email=f"{username}@example.ph", password="pw-12345-xyz", role=role,
                                    organization=org, **kw)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Klinika POWER", country="PH")
        self.other_org = Organization.objects.create(name="Other Clinic", country="PH")
        self.doctor = mk("doc", "doctor", self.org, first_name="Ana", last_name="Cruz", phone_number="+639185550123")
        self.nurse = mk("nurse", "nurse", self.org)
        self.admin = mk("clinicadmin", "admin", self.org)
        self.sysadmin = mk("sys", "system_admin")
        self.patient = mk("pat", "patient", self.org, first_name="Maria", last_name="Santos")
        prof = self.patient.patient_profile
        prof.date_of_birth, prof.organization, prof.phone_number = BIRTHDATE, self.org, "09175550199"
        prof.save()
        self.cbc = Orderable.objects.create(code="cbc", name="Complete blood count", category="laboratory")
        self.lipid = Orderable.objects.create(code="lipid", name="Lipid panel", category="laboratory")
        self.xray = Orderable.objects.create(code="cxr", name="Chest x-ray", category="imaging")
        self.bayanihan = self.partner("Bayanihan Diagnostic Laboratory")
        self.rizal = self.partner("Rizal Clinical Lab")
        self.rmt = self.staff(self.bayanihan, "rmt", "ext_lab_tech", "Liza Aquino", "0098765", mobile="+639175550110")
        self.path = self.staff(self.bayanihan, "patho", "ext_lab_pathologist", "Rene Villanueva", "0076543", pathologist=True)
        self.labadmin = self.staff(self.bayanihan, "labadmin", "ext_lab_admin", "Nena Dizon", "", admin=True, release=False)
        self.rmt_r = self.staff(self.rizal, "rmtr", "ext_lab_tech", "Paolo Mercado", "0011223")
        self.entry = ClinicLab.objects.create(organization=self.org, name="Bayanihan", partner=self.bayanihan, accepts_inpatient=True)
        self.client_ = APIClient()

    def partner(self, name, status="approved", expiry=NEXT_YEAR, country="PH", **kw):
        return PartnerLab.objects.create(name=name, license_number="13-0456", license_expiry=expiry, status=status, country=country,
                                         city="Quezon City", address="18 Scout Tobias St", hours="Mon-Sat 6am-6pm", **kw)

    def staff(self, partner, username, role, full_name, license_number, pathologist=False, admin=False, release=True, mobile=""):
        u = mk(username, role)
        PartnerLabStaff.objects.create(partner=partner, user=u, full_name=full_name, license_number=license_number,
                                       is_pathologist=pathologist, is_admin=admin, can_release=release, mobile=mobile)
        return u

    def api(self, user=None):
        c = APIClient()
        if user is not None:
            c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def order(self, orderable=None, sign=True):
        appt = Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="Visit",
                                          appointment_datetime=timezone.now() + timedelta(days=1))
        o = ow.create_draft_order(self.doctor, appt, orderable or self.cbc)
        if sign:
            ow.sign_order(o, self.doctor)
            o.refresh_from_db()
        return o

    def send(self, orders, user=None, **extra):
        body = {"orders": [o.pk for o in orders], "clinic_lab": self.entry.pk, **extra}
        with mock.patch(SEND) as sms, self.captureOnCommitCallbacks(execute=True):
            res = self.api(user or self.doctor).post("/api/lab-requests/", body, format="json")
        return res, sms

    def one(self, **extra):
        res, _ = self.send([self.order()], **extra)
        self.assertEqual(res.status_code, 201, res.content)
        return LabRequest.objects.get(pk=res.json()[0]["id"])

    def do(self, user, req, action, **body):
        return self.api(user).post(f"/api/lab-portal/requests/{req.pk}/action/", {"action": action, **body}, format="json")

    def results(self, user, req, rows):
        items = list(req.items.all())
        payload = {"items": [{"item": items[i].pk, "results": r} for i, r in enumerate(rows)]}
        return self.api(user).post(f"/api/lab-portal/requests/{req.pk}/results/", payload, format="json")

    def upload(self, user, req, content=PDF, name="signed.pdf"):
        return self.api(user).post(f"/api/lab-portal/requests/{req.pk}/report-file/",
                                   {"file": SimpleUploadedFile(name, content, content_type="application/pdf")}, format="multipart")

    def release(self, user, req, status="final"):
        with mock.patch(SEND) as sms, self.captureOnCommitCallbacks(execute=True):
            res = self.api(user).post(f"/api/lab-portal/requests/{req.pk}/release/", {"status": status}, format="json")
        return res, sms

    def collected(self, req, user=None):
        self.assertEqual(self.do(user or self.rmt, req, "accept").status_code, 200)
        self.assertEqual(self.do(user or self.rmt, req, "collect", accession_number="BDL-1").status_code, 200)
        req.refresh_from_db()
        return req


NORMAL = [{"test_name": "WBC", "value": "7.2", "units": "x10^9/L", "reference_range": "4.0-10.0"}]
CRITICAL = [{"test_name": "Platelets", "value": "18", "units": "x10^9/L", "reference_range": "150-400", "abnormal_flag": "LL"}]


class IsolationTests(Base):
    def test_lab_logins_reach_only_the_lab_portal(self):
        self.assertEqual(self.api(self.rmt).get("/api/lab-portal/me/").status_code, 200)
        self.assertEqual(self.api(self.rmt).get("/api/lab-requests/").status_code, 403)
        self.assertEqual(self.api(self.rmt).get("/api/pharmacy-portal/me/").status_code, 403)
        self.assertEqual(self.api(self.rmt).get("/api/lab-reports/").status_code, 403)

    def test_clinic_users_cannot_use_the_lab_portal(self):
        self.assertEqual(self.api(self.doctor).get("/api/lab-portal/requests/").status_code, 403)

    def test_a_lab_sees_only_its_own_requests(self):
        req = self.one()
        self.assertEqual(self.api(self.rmt_r).get(f"/api/lab-portal/requests/{req.pk}/").status_code, 404)
        self.assertEqual(self.do(self.rmt_r, req, "accept").status_code, 404)
        self.assertEqual(self.api(self.rmt).get(f"/api/lab-portal/requests/{req.pk}/").status_code, 200)

    def test_views_and_actions_are_logged(self):
        req = self.one()
        self.api(self.rmt).get(f"/api/lab-portal/requests/{req.pk}/")
        self.do(self.rmt, req, "accept")
        self.assertEqual(set(LabPortalAccessLog.objects.filter(user=self.rmt).values_list("action", flat=True)), {"view", "accept"})

    def test_minimum_patient_data(self):
        req = self.one()
        data = self.api(self.rmt).get(f"/api/lab-portal/requests/{req.pk}/").json()
        self.assertEqual(data["patient"]["name"], "Santos, Maria")
        self.assertEqual(data["patient"]["birthdate"], "1972-03-14")
        for leaked in ("address", "mrn", "phone", "mobile", "email"):
            self.assertNotIn(leaked, data["patient"])


class RegistrationTests(Base):
    def body(self, **kw):
        return {"name": "Mabuhay Lab", "country": "PH", "license_number": "13-0999", "license_expiry": NEXT_YEAR.isoformat(),
                "username": "mabuhay_admin", "password": "Sampaguita-2026!", "email": "lab@example.ph", "sms_mobile": "0917 555 0101",
                "admin_license": "0012345", "first_name": "Rosa", "last_name": "Diaz", **kw}

    def test_register_pending_until_approved(self):
        res = self.api().post("/api/lab-portal/register/", self.body(), format="json")
        self.assertEqual(res.status_code, 201, res.content)
        lab = PartnerLab.objects.get(name="Mabuhay Lab")
        self.assertEqual((lab.status, lab.sms_mobile), ("pending", "+639175550101"))
        user = User.objects.get(username="mabuhay_admin")
        self.assertEqual(user.role, "ext_lab_tech")
        self.assertEqual(self.api(user).get("/api/lab-portal/requests/").status_code, 403)
        self.assertEqual(self.api(self.doctor).post(f"/api/lab-requests/admin/partners/{lab.pk}/status/", {"action": "approve"}).status_code, 403)
        self.assertEqual(self.api(self.sysadmin).post(f"/api/lab-requests/admin/partners/{lab.pk}/status/", {"action": "approve"}).status_code, 200)
        self.assertEqual(self.api(user).get("/api/lab-portal/requests/").status_code, 200)

    def test_us_lab_uses_clia_and_us_mobile(self):
        res = self.api().post("/api/lab-portal/register/", self.body(country="US", sms_mobile="(718) 555-0110", license_number="33D2145678"), format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(PartnerLab.objects.get(name="Mabuhay Lab").sms_mobile, "+17185550110")

    def test_expired_license_is_refused_and_blocks_work(self):
        self.assertEqual(self.api().post("/api/lab-portal/register/", self.body(license_expiry="2020-01-01"), format="json").status_code, 400)
        self.bayanihan.license_expiry = date.today() - timedelta(days=1)
        self.bayanihan.save()
        res = self.api(self.rmt).get("/api/lab-portal/requests/")
        self.assertEqual(res.status_code, 403)
        self.assertIn("expired", res.json()["detail"])


class SendingTests(Base):
    def test_one_request_per_test_by_default(self):
        res, sms = self.send([self.order(), self.order(self.lipid)], fasting_required=True)
        self.assertEqual(res.status_code, 201, res.content)
        reqs = LabRequest.objects.order_by("id")
        self.assertEqual(reqs.count(), 2)
        self.assertEqual({r.items.count() for r in reqs}, {1})
        self.assertTrue(reqs[0].group_key and reqs[0].group_key == reqs[1].group_key)
        self.assertEqual({r.status for r in reqs}, {"new"})
        # the HL7 interface will never send these orders too
        self.assertEqual(set(Order.objects.values_list("interface_status", flat=True)), {"sent"})
        # one text to the lab for the batch, one to the patient; no names or tests in either
        texts = [c.args for c in sms.call_args_list]
        self.assertEqual(len(texts), 2)
        lab_text = [t for t in texts if t[0] == "+639175550110"][0][1]
        self.assertIn(reqs[0].number, lab_text)
        self.assertNotIn("Santos", lab_text)
        self.assertNotIn("blood", lab_text.lower())
        patient_text = [t for t in texts if t[0] == "09175550199"][0][1]
        self.assertIn(reqs[0].claim_code, patient_text)
        self.assertIn(reqs[1].claim_code, patient_text)
        self.assertIn("Fast", patient_text)

    def test_combine_puts_all_tests_on_one_request(self):
        res, _ = self.send([self.order(), self.order(self.lipid)], combine=True)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(LabRequest.objects.get().items.count(), 2)

    def test_rules(self):
        draft = self.order(sign=False)
        self.assertEqual(self.send([draft])[0].status_code, 409)
        self.assertEqual(self.send([self.order(self.xray)])[0].status_code, 400)
        o = self.order()
        self.assertEqual(self.send([o])[0].status_code, 201)
        self.assertEqual(self.send([o])[0].status_code, 409)  # already sent
        other_entry = ClinicLab.objects.create(organization=self.other_org, name="X", partner=self.rizal)
        self.assertEqual(self.send([self.order()], clinic_lab=other_entry.pk)[0].status_code, 400)
        self.bayanihan.status = "suspended"
        self.bayanihan.save()
        self.assertEqual(self.send([self.order()])[0].status_code, 409)
        self.assertEqual(self.send([self.order()], user=self.patient)[0].status_code, 403)

    def test_patient_chooses(self):
        res, sms = self.send([self.order()], clinic_lab="")
        req = LabRequest.objects.get()
        self.assertEqual((req.status, req.partner_id), ("unclaimed", None))
        self.assertEqual(len(sms.call_args_list), 1)  # only the patient
        self.assertIn("any POWER partner lab", sms.call_args_list[0].args[1])

    def test_cancel_tells_the_lab_and_frees_the_order(self):
        req = self.one()
        with mock.patch(SEND) as sms, self.captureOnCommitCallbacks(execute=True):
            res = self.api(self.doctor).post(f"/api/lab-requests/{req.pk}/cancel/", {"reason": "Wrong test"}, format="json")
        self.assertEqual(res.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, "cancelled")
        self.assertEqual(Order.objects.get().interface_status, "not_sent")
        self.assertTrue(any("cancelled" in c.args[1] for c in sms.call_args_list))
        self.assertEqual(self.do(self.rmt, req, "accept").status_code, 409)


class ClaimTests(Base):
    def setUp(self):
        super().setUp()
        res, _ = self.send([self.order(), self.order(self.lipid)], clinic_lab="")
        self.reqs = list(LabRequest.objects.order_by("id"))

    def claim(self, user, code, birthdate="1972-03-14", last4="0199"):
        return self.api(user).post("/api/lab-portal/claim/", {"code": code, "birthdate": birthdate, "mobile_last4": last4}, format="json")

    def test_claim_locks_the_whole_group_to_the_lab(self):
        res = self.claim(self.rmt, self.reqs[0].claim_code.lower())
        self.assertEqual(res.status_code, 200, res.content)
        for r in self.reqs:
            r.refresh_from_db()
            self.assertEqual((r.partner_id, r.status, r.how), (self.bayanihan.pk, "accepted", "claimed"))
        self.assertEqual(self.claim(self.rmt_r, self.reqs[0].claim_code).status_code, 409)
        self.assertTrue(InboxAlert.objects.filter(recipient=self.doctor, source_type="lab_request_claimed").exists())

    def test_wrong_details_and_lock(self):
        self.assertEqual(self.claim(self.rmt, self.reqs[0].claim_code, birthdate="1970-01-01").status_code, 404)
        self.assertEqual(self.claim(self.rmt, self.reqs[0].claim_code, last4="0000").status_code, 404)
        for _ in range(3):
            self.claim(self.rmt, "NOPE1234")
        self.assertEqual(self.claim(self.rmt, self.reqs[0].claim_code).status_code, 429)

    def test_only_technologists_or_pathologists_claim(self):
        self.assertEqual(self.claim(self.labadmin, self.reqs[0].claim_code).status_code, 403)


class LabWorkflowTests(Base):
    def test_accept_collect_results_release_final(self):
        req = self.collected(self.one())
        self.assertEqual(req.status, "collected")
        self.assertEqual(req.collected_by_name, "Liza Aquino")
        self.assertEqual(self.results(self.rmt, req, [NORMAL]).status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, "in_process")
        tabs = self.api(self.rmt).get("/api/lab-portal/requests/?tab=to_release").json()
        self.assertEqual([r["id"] for r in tabs["results"]], [req.pk])
        res, _ = self.release(self.rmt, req)
        self.assertEqual(res.status_code, 400)  # the signed PDF first
        self.assertIn("PDF", res.json()["detail"])
        self.assertEqual(self.upload(self.rmt, req, content=b"not a pdf", name="x.pdf").status_code, 400)
        self.assertEqual(self.upload(self.rmt, req).status_code, 200)
        res, sms = self.release(self.rmt, req)
        self.assertEqual(res.status_code, 200, res.content)
        req.refresh_from_db()
        self.assertEqual(req.status, "final")
        report = LabReport.objects.get()
        self.assertEqual((report.source, report.status, report.patient_id, report.order_id),
                         ("partner_lab", "final", self.patient.pk, req.items.get().order_id))
        self.assertEqual(report.performing_lab, "Bayanihan Diagnostic Laboratory")
        self.assertIn("Liza Aquino (0098765)", report.comment)
        self.assertEqual(bytes(LabReportFileData.objects.get(report=report).data), PDF)
        self.assertEqual(Order.objects.get().status, "completed")
        self.assertTrue(InboxAlert.objects.filter(recipient=self.doctor, source_type="lab_report", source_id=report.pk).exists())
        numbers = [c.args[0] for c in sms.call_args_list]
        self.assertIn("+639185550123", numbers)  # provider: new results
        self.assertIn("09175550199", numbers)  # patient: results are with your doctor
        patient_text = [c.args[1] for c in sms.call_args_list if c.args[0] == "09175550199"][0]
        self.assertNotIn("7.2", patient_text)
        self.assertIsNotNone(req.patient_told_at)

    def test_preliminary_then_final(self):
        res, _ = self.send([self.order(), self.order(self.lipid)], combine=True)
        req = self.collected(LabRequest.objects.get())
        items = list(req.items.all())
        payload = {"items": [{"item": items[0].pk, "results": NORMAL}]}
        self.assertEqual(self.api(self.rmt).post(f"/api/lab-portal/requests/{req.pk}/results/", payload, format="json").status_code, 200)
        self.assertEqual(self.release(self.rmt, req, "final")[0].status_code, 400)  # lipid has no results yet
        res, sms = self.release(self.rmt, req, "preliminary")
        self.assertEqual(res.status_code, 200, res.content)
        req.refresh_from_db()
        self.assertEqual(req.status, "preliminary")
        self.assertEqual(LabReport.objects.get().status, "preliminary")
        self.assertFalse(any(c.args[0] == "09175550199" for c in sms.call_args_list))  # patient told only when final
        self.upload(self.rmt, req)
        self.assertEqual(self.results(self.rmt, req, [NORMAL, NORMAL]).status_code, 200)
        res, _ = self.release(self.rmt, req, "final")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(sorted(LabReport.objects.values_list("status", flat=True)), ["final", "final"])

    def test_critical_needs_a_call_and_in_ph_the_pathologist(self):
        req = self.collected(self.one())
        self.results(self.rmt, req, [CRITICAL])
        self.upload(self.rmt, req)
        res, _ = self.release(self.rmt, req)
        self.assertEqual(res.status_code, 409)
        self.assertIn("phone call", res.json()["detail"])
        call = {"called_name": "Nurse J. Bautista", "called_number": "(02) 8555 0142"}
        self.assertEqual(self.api(self.rmt).post(f"/api/lab-portal/requests/{req.pk}/critical-call/", call, format="json").status_code, 400)
        call["read_back_confirmed"] = True
        self.assertEqual(self.api(self.rmt).post(f"/api/lab-portal/requests/{req.pk}/critical-call/", call, format="json").status_code, 200)
        res, _ = self.release(self.rmt, req)
        self.assertEqual(res.status_code, 403)  # PH: an RMT releases routine results only
        res, sms = self.release(self.path, req)
        self.assertEqual(res.status_code, 200, res.content)
        provider_texts = [c.args[1] for c in sms.call_args_list if c.args[0] == "+639185550123"]
        self.assertTrue(any(t.startswith("POWER CRITICAL") for t in provider_texts))
        self.assertTrue(InboxAlert.objects.filter(recipient=self.doctor, kind="critical").exists())

    def test_a_new_critical_value_needs_its_own_call(self):
        req = self.collected(self.one())
        self.results(self.rmt, req, [CRITICAL])
        call = {"called_name": "Nurse J. Bautista", "read_back_confirmed": True}
        self.assertEqual(self.api(self.rmt).post(f"/api/lab-portal/requests/{req.pk}/critical-call/", call, format="json").status_code, 200)
        res, _ = self.release(self.path, req, "preliminary")
        self.assertEqual(res.status_code, 200, res.content)
        # a different critical value entered afterwards: the earlier call was about the old value
        self.results(self.rmt, req, [[{**CRITICAL[0], "value": "9"}]])
        self.upload(self.rmt, req)
        res, _ = self.release(self.path, req)
        self.assertEqual(res.status_code, 409, res.content)
        self.assertIn("phone call", res.json()["detail"])
        self.assertEqual(self.api(self.rmt).post(f"/api/lab-portal/requests/{req.pk}/critical-call/", call, format="json").status_code, 200)
        res, _ = self.release(self.path, req)
        self.assertEqual(res.status_code, 200, res.content)

    def test_us_technologist_may_release_a_critical_after_the_call(self):
        self.bayanihan.country = "US"
        self.bayanihan.save()
        req = self.collected(self.one())
        self.results(self.rmt, req, [CRITICAL])
        self.upload(self.rmt, req)
        self.api(self.rmt).post(f"/api/lab-portal/requests/{req.pk}/critical-call/",
                                {"called_name": "RN Smith", "read_back_confirmed": True}, format="json")
        self.assertEqual(self.release(self.rmt, req)[0].status_code, 200)

    def test_release_needs_the_release_right(self):
        req = self.collected(self.one())
        self.results(self.rmt, req, [NORMAL])
        self.upload(self.rmt, req)
        PartnerLabStaff.objects.filter(user=self.rmt).update(can_release=False)
        self.assertEqual(self.release(self.rmt, req)[0].status_code, 403)

    def test_correction_after_final(self):
        req = self.collected(self.one())
        self.results(self.rmt, req, [NORMAL])
        self.upload(self.rmt, req)
        self.release(self.rmt, req)
        report = LabReport.objects.get()
        report.review_status = "reviewed"
        report.save()
        changed = [dict(NORMAL[0], value="8.1")]
        self.assertEqual(self.results(self.rmt, req, [changed]).status_code, 200)
        res, _ = self.release(self.rmt, req)
        self.assertEqual(res.status_code, 200, res.content)
        report.refresh_from_db()
        self.assertEqual((report.status, report.review_status), ("corrected", "unreviewed"))
        self.assertEqual(LabReport.objects.count(), 1)
        self.assertTrue(InboxAlert.objects.filter(recipient=self.doctor, source_type__startswith="lab_request_corrected").exists())

    def test_decline_goes_back_to_the_provider(self):
        req = self.one()
        self.assertEqual(self.do(self.rmt, req, "decline").status_code, 400)
        with mock.patch(SEND) as sms, self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.do(self.rmt, req, "decline", reason="Test not offered").status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.status, "declined")
        self.assertEqual(Order.objects.get().interface_status, "not_sent")  # can be sent to another lab
        self.assertTrue(InboxAlert.objects.filter(recipient=self.doctor, source_type="lab_request_declined").exists())
        self.assertTrue(any(c.args[0] == "+639185550123" for c in sms.call_args_list))
        entry2 = ClinicLab.objects.create(organization=self.org, name="Rizal", partner=self.rizal)
        self.assertEqual(self.send([Order.objects.get()], clinic_lab=entry2.pk)[0].status_code, 201)

    def test_recollect(self):
        req = self.collected(self.one())
        self.assertEqual(self.do(self.rmt, req, "recollect", reason="Hemolyzed").status_code, 200)
        req.refresh_from_db()
        self.assertEqual((req.status, req.collected_at), ("accepted", None))

    def test_recollect_throws_away_what_was_measured_on_the_rejected_specimen(self):
        req = self.collected(self.one())
        self.results(self.rmt, req, [CRITICAL])
        self.upload(self.rmt, req)
        call = {"called_name": "Nurse J. Bautista", "read_back_confirmed": True}
        self.assertEqual(self.api(self.rmt).post(f"/api/lab-portal/requests/{req.pk}/critical-call/", call, format="json").status_code, 200)
        self.assertEqual(self.do(self.rmt, req, "recollect", reason="Hemolyzed").status_code, 200)
        item = req.items.get()
        self.assertEqual((item.draft, item.draft_saved_at), ({}, None))
        self.assertFalse(LabRequestFile.objects.filter(request=req).exists())
        # the new specimen: nothing to release until new results are entered
        self.assertEqual(self.do(self.rmt, req, "collect", accession_number="BDL-2").status_code, 200)
        res, _ = self.release(self.path, req)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("results first", res.json()["detail"])
        # a critical value on the new specimen needs a new call: the one before the recollect doesn't count
        self.results(self.rmt, req, [CRITICAL])
        self.upload(self.rmt, req)
        res, _ = self.release(self.path, req)
        self.assertEqual(res.status_code, 409)
        self.assertIn("phone call", res.json()["detail"])
        self.assertEqual(self.api(self.rmt).post(f"/api/lab-portal/requests/{req.pk}/critical-call/", call, format="json").status_code, 200)
        res, _ = self.release(self.path, req)
        self.assertEqual(res.status_code, 200, res.content)

    def test_admin_cannot_do_lab_work(self):
        req = self.one()
        self.assertEqual(self.do(self.labadmin, req, "accept").status_code, 403)


class InpatientTests(Base):
    def test_inpatient_bedside_needs_a_lab_that_does_it(self):
        o = self.order()
        res, _ = self.send([o], care_setting="inpatient", collection="lab_at_bedside", location="Ward 3B, Bed 12", priority="stat")
        self.assertEqual(res.status_code, 400)
        self.bayanihan.offers_bedside = True
        self.bayanihan.save()
        res, sms = self.send([o], care_setting="inpatient", collection="lab_at_bedside", location="Ward 3B, Bed 12", priority="stat")
        self.assertEqual(res.status_code, 201, res.content)
        lab_text = sms.call_args_list[0].args[1]
        self.assertIn("STAT", lab_text)
        self.assertIn("Ward 3B, Bed 12", lab_text)
        self.assertEqual(len(sms.call_args_list), 1)  # no patient text for an inpatient


class ReminderTests(Base):
    def test_reminders_then_expiry(self):
        req = self.one()
        LabRequest.objects.filter(pk=req.pk).update(created_at=timezone.now() - timedelta(days=4))
        with mock.patch(SEND) as sms, self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(s.remind_and_expire(), {"reminded": 1, "expired": 0})
            self.assertEqual(s.remind_and_expire(), {"reminded": 0, "expired": 0})  # once per milestone
        self.assertIn("Reminder", sms.call_args_list[0].args[1])
        LabRequest.objects.filter(pk=req.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
        with mock.patch(SEND), self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(s.remind_and_expire()["expired"], 1)
        req.refresh_from_db()
        self.assertEqual(req.status, "expired")
        self.assertEqual(Order.objects.get().interface_status, "not_sent")
        self.assertTrue(InboxAlert.objects.filter(recipient=self.doctor, source_type="lab_request_expired").exists())


class DirectoryTests(Base):
    def test_admin_manages_the_directory(self):
        body = {"name": "Rizal Clinical Lab", "mode": "partner_portal", "partner": self.rizal.pk, "is_default": True}
        self.assertEqual(self.api(self.doctor).post("/api/lab-requests/clinic-labs/", body, format="json").status_code, 403)
        res = self.api(self.admin).post("/api/lab-requests/clinic-labs/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        pending = self.partner("Pending Lab", status="pending")
        self.assertEqual(self.api(self.admin).post("/api/lab-requests/clinic-labs/", dict(body, partner=pending.pk), format="json").status_code, 400)
        listed = self.api(self.doctor).get("/api/lab-requests/clinic-labs/").json()
        self.assertEqual(listed["results"][0]["name"], "Rizal Clinical Lab")  # the default first
        self.assertEqual(listed["country"], "PH")


class PdfReaderTests(Base):
    READ = "/api/lab-portal/requests/{}/report-file/read/"

    def test_off_by_default(self):
        req = self.collected(self.one())
        self.assertEqual(self.upload(self.rmt, req).status_code, 200)
        self.assertFalse(self.api(self.rmt).get(f"/api/lab-portal/requests/{req.pk}/").json()["can_read_pdf"])
        self.assertEqual(self.api(self.rmt).post(self.READ.format(req.pk)).status_code, 503)

    @override_settings(LAB_PDF_READER_ENABLED=True, LAB_PDF_READER_MODEL_ID="claude-test")
    def test_fills_values_for_review_without_saving(self):
        req = self.collected(self.one())
        item = req.items.get()
        self.assertEqual(self.api(self.rmt).post(self.READ.format(req.pk)).status_code, 400)  # no PDF yet
        self.assertEqual(self.upload(self.rmt, req).status_code, 200)
        reply = {"tests": [
            {"item_id": item.pk, "lines": [
                {"test_name": "Hemoglobin", "value": "13.9", "units": "g/dL", "reference_range": "13.5-17.5", "abnormal_flag": ""},
                {"test_name": "WBC", "value": "11.2", "units": "x10^9/L", "reference_range": "4.5-11.0", "abnormal_flag": "high"},
                {"test_name": "", "value": "3"},  # no name: dropped
            ]},
            {"item_id": 999999, "lines": [{"test_name": "Not ours", "value": "1"}]},  # not on this request: dropped
        ]}
        with mock.patch("lab_portal.pdf_reader._call", return_value=reply) as call:
            res = self.api(self.rmt).post(self.READ.format(req.pk))
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(call.call_args[0][0], PDF)
        items = res.json()["items"]
        self.assertEqual([i["item"] for i in items], [item.pk])
        self.assertEqual([(l["test_name"], l["value"], l["abnormal_flag"]) for l in items[0]["results"]],
                         [("Hemoglobin", "13.9", ""), ("WBC", "11.2", "H")])
        item.refresh_from_db()
        self.assertEqual(item.draft, {})  # nothing saved
        self.assertTrue(req.events.filter(event_type="pdf_read").exists())

    @override_settings(LAB_PDF_READER_ENABLED=True, LAB_PDF_READER_MODEL_ID="claude-test")
    def test_service_failure_and_who_may_read(self):
        req = self.collected(self.one())
        self.upload(self.rmt, req)
        with mock.patch("lab_portal.pdf_reader._call", side_effect=RuntimeError("down")):
            self.assertEqual(self.api(self.rmt).post(self.READ.format(req.pk)).status_code, 503)
        with mock.patch("lab_portal.pdf_reader._call", return_value={"tests": []}):
            self.assertEqual(self.api(self.labadmin).post(self.READ.format(req.pk)).status_code, 403)


class SeedDemoLabTests(TestCase):
    def test_seed_is_idempotent_links_the_clinic_and_removes_cleanly(self):
        from io import StringIO

        from django.core.management import call_command

        org = Organization.objects.create(name="Seed Clinic")
        out = StringIO()
        call_command("seed_demo_lab", "--clinic", str(org.pk), "--password", "demo-pass-123", stdout=out)
        lab = PartnerLab.objects.get(name="Diagnostika Clinical Laboratory (DEMO)")
        self.assertEqual(lab.status, "approved")
        staff = {m.user.username: m for m in PartnerLabStaff.objects.filter(partner=lab).select_related("user")}
        self.assertEqual(set(staff), {"demo_diagnostika_admin", "demo_diagnostika_asst", "demo_diagnostika_path"})
        self.assertTrue(staff["demo_diagnostika_admin"].is_admin)
        self.assertIn(staff["demo_diagnostika_admin"].user.role, s.WORKER_ROLES)  # the chief med tech works requests too
        self.assertFalse(staff["demo_diagnostika_asst"].can_release)
        self.assertTrue(staff["demo_diagnostika_path"].is_pathologist)
        self.assertTrue(staff["demo_diagnostika_asst"].user.check_password("demo-pass-123"))
        self.assertTrue(ClinicLab.objects.filter(organization=org, partner=lab, mode="partner_portal").exists())

        call_command("seed_demo_lab", "--clinic", str(org.pk), stdout=StringIO())  # re-run keeps passwords, no duplicates
        self.assertEqual(PartnerLab.objects.filter(name=lab.name).count(), 1)
        self.assertEqual(ClinicLab.objects.filter(partner=lab).count(), 1)
        self.assertTrue(get_user_model().objects.get(username="demo_diagnostika_admin").check_password("demo-pass-123"))

        call_command("seed_demo_lab", "--remove", stdout=StringIO())
        self.assertFalse(PartnerLab.objects.filter(name=lab.name).exists())
        self.assertFalse(get_user_model().objects.filter(username__startswith="demo_diagnostika_").exists())

    def test_from_env_does_nothing_unless_switched_on_and_never_fails(self):
        from io import StringIO

        from django.core.management import call_command

        with mock.patch.dict("os.environ", {"SEED_DEMO_LAB": ""}):
            call_command("seed_demo_lab", "--from-env", stdout=StringIO())
        self.assertFalse(PartnerLab.objects.exists())
        org = Organization.objects.create(name="Env Clinic")
        env = {"SEED_DEMO_LAB": "true", "DEMO_LAB_PASSWORD": "env-pass-1234", "DEMO_LAB_CLINIC": str(org.pk)}
        with mock.patch.dict("os.environ", env):
            call_command("seed_demo_lab", "--from-env", stdout=StringIO())
        self.assertTrue(get_user_model().objects.get(username="demo_diagnostika_asst").check_password("env-pass-1234"))
        self.assertTrue(ClinicLab.objects.filter(organization=org).exists())
        with mock.patch.dict("os.environ", {**env, "DEMO_LAB_CLINIC": "no such clinic"}):
            call_command("seed_demo_lab", "--from-env", stdout=StringIO(), stderr=StringIO())  # warns, doesn't raise
