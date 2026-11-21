"""POWER Pharmacy, Phase 3: the external pharmacy portal -- isolation, onboarding, routing, claim, stages, requests,
cancel, substitution, dangerous drugs, senior/PWD, minimum data and the access log."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from appointments import prescriptions as rxs
from appointments.models import InboxAlert, PatientAllergy, Pharmacy, PrescriberProfile, Prescription
from users.models import Organization, Patient

from . import portal as pt
from .models import (
    PartnerDirectoryLink,
    PartnerPharmacist,
    PartnerPharmacy,
    PortalAccessLog,
    PortalDispense,
    PortalNotice,
    PortalPrescription,
    PortalRequest,
)

User = get_user_model()
GOOD_NPI = "1234567893"
NEXT_YEAR = date.today() + timedelta(days=365)
BIRTHDATE = date(1958, 3, 14)


def mk(username, role, org=None, first="", last=""):
    return User.objects.create_user(username=username, email=f"{username}@example.ph", password="pw-12345-xyz", role=role,
                                    organization=org, first_name=first, last_name=last)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class Base(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Klinika ng Bayan", enabled_modules=["clinical_documentation", "pharmacy"])
        self.doctor = mk("doc", "doctor", self.org, "Jose", "Rizal")
        self.doctor.npi = GOOD_NPI
        self.doctor.save()
        PrescriberProfile.objects.create(user=self.doctor, license_number="0123456", s2_number="S2-24680", phone="(02) 8123 4567")
        self.doctor2 = mk("doc2", "doctor", self.org, "Emilio", "Aguinaldo")
        self.nurse = mk("nurse", "nurse", self.org)
        self.sysadmin = mk("sys", "system_admin")
        self.sysadmin.email = "power-admin@example.ph"
        self.sysadmin.save()
        self.patient = mk("pat", "patient", self.org, "Corazon", "Reyes")
        profile = Patient.objects.get(user=self.patient)
        profile.date_of_birth, profile.organization, profile.address, profile.phone_number = BIRTHDATE, self.org, "45 Mabini St, Manila", "09171234567"
        profile.save()
        PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance="Penicillin", reaction="Hives", severity="severe")
        self.mercury = self.partner("Mercury Drug Cubao", "mercury@example.ph", "LTO-3000011111")
        self.watsons = self.partner("Watsons Iloilo", "watsons@example.ph", "LTO-3000022222")
        self.rph = self.portal_user(self.mercury, "rph", "ext_pharmacist", "Andres Bonifacio", "0045678")
        self.clerk = self.portal_user(self.mercury, "clerk", "ext_pharmacy_admin", "Gabriela Silang", "")
        self.rph_w = self.portal_user(self.watsons, "rphw", "ext_pharmacist", "Apolinario Mabini", "0099887")
        self.directory = Pharmacy.objects.create(organization=self.org, name="Mercury Drug Cubao")
        PartnerDirectoryLink.objects.create(pharmacy=self.directory, partner=self.mercury)

    def partner(self, name, email, lto, status="approved", expiry=NEXT_YEAR):
        return PartnerPharmacy.objects.create(name=name, email=email, fda_lto_number=lto, lto_expiry=expiry, status=status, city="Quezon City")

    def portal_user(self, partner, username, role, full_name, prc):
        u = mk(username, role)
        PartnerPharmacist.objects.create(partner=partner, user=u, full_name=full_name, prc_number=prc, is_admin=role == "ext_pharmacy_admin")
        return u

    def api(self, user=None):
        c = APIClient()
        if user is not None:
            c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return c

    def draft(self, drug="Losartan potassium", pharmacy="directory", **extra):
        values = dict(
            organization=self.org, patient=self.patient, prescriber=self.doctor, created_by=self.doctor, drug_name=drug,
            strength="50 mg", form="tablet", dose="1 tablet", route="PO", frequency="daily", quantity=Decimal(30),
            quantity_unit="tablets", days_supply=30, refills=1, pharmacy=self.directory if pharmacy == "directory" else pharmacy,
        )
        values.update(extra)
        return Prescription.objects.create(**values)

    def signed(self, **kw):
        return rxs.sign(self.draft(**kw), self.doctor)

    def portal_rx(self, rx):
        return PortalPrescription.objects.get(prescription=rx)

    def do(self, user, prx, action, **body):
        return self.api(user).post(f"/api/pharmacy-portal/rx/{prx.pk}/action/", {"action": action, **body}, format="json")

    def dispense_body(self, **extra):
        return {"quantity": "30", "generic_name": "Losartan potassium", "brand_name": "Cozaar", "manufacturer": "Organon", **extra}


class IsolationTests(Base):
    """Portal users never reach internal POWER pages; clinic staff never reach the portal."""

    def test_portal_user_is_refused_everywhere_but_the_portal(self):
        c = self.api(self.rph)
        for url in ("/api/users/patients/", "/api/prescriptions/", "/api/pharmacy/queue/", "/api/pharmacy/patients/",
                    f"/api/patient-header/{self.patient.pk}/", "/api/orders/", "/api/inbox/counts/", "/api/users/me/"):
            r = c.get(url)
            self.assertEqual(r.status_code, 403, url)
        self.assertEqual(c.get("/api/pharmacy-portal/me/").status_code, 200)

    def test_clinic_staff_cannot_use_the_portal(self):
        for user in (self.doctor, self.nurse, self.sysadmin):
            self.assertEqual(self.api(user).get("/api/pharmacy-portal/rx/").status_code, 403, user.role)

    def test_each_pharmacy_sees_only_its_own_prescriptions(self):
        prx = self.portal_rx(self.signed())
        self.assertEqual([r["id"] for r in self.api(self.rph).get("/api/pharmacy-portal/rx/?tab=new").json()["results"]], [prx.pk])
        self.assertEqual(self.api(self.rph_w).get("/api/pharmacy-portal/rx/?tab=new").json()["results"], [])
        self.assertEqual(self.api(self.rph_w).get(f"/api/pharmacy-portal/rx/{prx.pk}/").status_code, 404)
        self.assertEqual(self.do(self.rph_w, prx, "accept").status_code, 404)

    def test_minimum_patient_data_only(self):
        prx = self.portal_rx(self.signed())
        data = self.api(self.rph).get(f"/api/pharmacy-portal/rx/{prx.pk}/").json()
        self.assertEqual(data["patient"], {"name": "Reyes, Corazon", "birthdate": "1958-03-14", "age": pt.age_years(BIRTHDATE)})
        self.assertEqual(data["allergies"][0]["substance"], "Penicillin")
        flat = str(data)
        for leak in ("Mabini St", "09171234567", "MRN", "pat@example.ph"):
            self.assertNotIn(leak, flat)

    def test_every_view_and_action_is_logged(self):
        prx = self.portal_rx(self.signed())
        self.api(self.rph).get("/api/pharmacy-portal/rx/?tab=new")
        self.api(self.rph).get(f"/api/pharmacy-portal/rx/{prx.pk}/")
        self.do(self.rph, prx, "accept")
        actions = list(PortalAccessLog.objects.filter(user=self.rph).order_by("id").values_list("action", flat=True))
        self.assertEqual(actions, ["list:new", "view", "accept"])
        log = PortalAccessLog.objects.get(user=self.rph, action="view")
        self.assertEqual((log.partner, log.prescription_id), (self.mercury, prx.prescription_id))


class OnboardingTests(Base):
    def register(self, **extra):
        body = {
            "name": "Botica Boie Davao", "fda_lto_number": "LTO-3000033333", "lto_expiry": NEXT_YEAR.isoformat(),
            "email": "boie@example.ph", "username": "boie_admin", "password": "a-long-password-1",
            "first_name": "Maria Clara", "last_name": "Santos", "admin_prc_number": "0011223",
            "pharmacists": [{"full_name": "Juan Dela Cruz", "prc_number": "0033445"}],
        }
        body.update(extra)
        return self.api().post("/api/pharmacy-portal/register/", body, format="json")

    def test_register_stays_pending_until_a_power_admin_approves(self):
        r = self.register()
        self.assertEqual(r.status_code, 201, r.content)
        partner = PartnerPharmacy.objects.get(name="Botica Boie Davao")
        self.assertEqual(partner.status, "pending")
        self.assertEqual(sorted(partner.staff.values_list("prc_number", flat=True)), ["0011223", "0033445"])
        user = User.objects.get(username="boie_admin")
        self.assertEqual(user.role, "ext_pharmacist")
        me = self.api(user).get("/api/pharmacy-portal/me/").json()
        self.assertIn("waiting for approval", me["problem"])
        self.assertEqual(self.api(user).get("/api/pharmacy-portal/rx/").status_code, 403)
        # only a POWER administrator approves
        url = f"/api/pharmacy/network/{partner.pk}/status/"
        self.assertEqual(self.api(self.doctor).post(url, {"action": "approve"}, format="json").status_code, 403)
        self.assertEqual(self.api(self.sysadmin).post(url, {"action": "approve"}, format="json").status_code, 200)
        self.assertEqual(self.api(user).get("/api/pharmacy-portal/rx/").status_code, 200)

    def test_registration_needs_lto_and_a_pharmacist_prc(self):
        self.assertEqual(self.register(fda_lto_number="").status_code, 400)
        self.assertEqual(self.register(lto_expiry=(date.today() - timedelta(days=1)).isoformat()).status_code, 400)
        self.assertEqual(self.register(pharmacists=[]).status_code, 400)

    def test_suspended_and_expired_pharmacies_are_blocked(self):
        prx = self.portal_rx(self.signed())
        self.assertEqual(self.api(self.sysadmin).post(f"/api/pharmacy/network/{self.mercury.pk}/status/", {"action": "suspend"}, format="json").status_code, 400)
        self.api(self.sysadmin).post(f"/api/pharmacy/network/{self.mercury.pk}/status/", {"action": "suspend", "reason": "LTO under review"}, format="json")
        self.assertEqual(self.do(self.rph, prx, "accept").status_code, 403)
        # a suspended partner can't be chosen for a new prescription
        r = self.api(self.doctor).post("/api/prescriptions/", {"patient": self.patient.pk, "drug_name": "Losartan", "pharmacy": self.directory.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        PartnerPharmacy.objects.filter(pk=self.watsons.pk).update(lto_expiry=date.today() - timedelta(days=1))
        self.assertIn("expired", self.api(self.rph_w).get("/api/pharmacy-portal/rx/").json()["detail"])


class RoutingClaimTests(Base):
    def test_signing_routes_to_the_chosen_partner_and_notifies_it(self):
        rx = self.signed()
        self.assertEqual(len(rx.claim_code), 8)
        prx = self.portal_rx(rx)
        self.assertEqual((prx.partner, prx.status, prx.how), (self.mercury, "new", "routed"))
        self.assertTrue(PortalNotice.objects.filter(partner=self.mercury, title="New prescription").exists())
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ["clerk@example.ph", "rph@example.ph"])  # each pharmacist gets it
        self.assertNotIn("Reyes", mail.outbox[-1].body)  # no patient details by email
        self.assertTrue(rx.events.filter(event_type="portal_routed").exists())

    def test_claim_with_code_and_birthdate_locks_to_that_pharmacy(self):
        rx = self.signed(pharmacy=None)
        self.assertFalse(PortalPrescription.objects.filter(prescription=rx).exists())
        c = self.api(self.rph_w)
        self.assertEqual(c.post("/api/pharmacy-portal/claim/", {"code": rx.claim_code, "birthdate": "1960-01-01", "mobile_last4": "4567"}, format="json").status_code, 404)
        r = c.post("/api/pharmacy-portal/claim/", {"code": f"POWER-RX:{rx.claim_code.lower()}", "birthdate": BIRTHDATE.isoformat(), "mobile_last4": "4567"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        prx = self.portal_rx(rx)
        self.assertEqual((prx.partner, prx.status, prx.how), (self.watsons, "in_progress", "claimed"))
        rx.refresh_from_db()
        self.assertEqual((rx.status, rx.delivery_method), ("sent", "portal"))
        r = self.api(self.rph).post("/api/pharmacy-portal/claim/", {"code": rx.claim_code, "birthdate": BIRTHDATE.isoformat(), "mobile_last4": "4567"}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(PortalAccessLog.objects.filter(user=self.rph_w, action="claim_failed").exists())

    def test_pdf_carries_the_claim_code(self):
        from appointments.prescription_pdf import build_pdf

        rx = self.signed(pharmacy=None)
        self.assertTrue(build_pdf(rx).startswith(b"%PDF"))


class StageTests(Base):
    def test_accept_ready_dispense_updates_the_prescription(self):
        rx = self.signed()
        prx = self.portal_rx(rx)
        self.assertEqual(self.do(self.clerk, prx, "accept").status_code, 403)  # not a pharmacist
        self.assertEqual(self.do(self.rph, prx, "accept").status_code, 200)
        rx.refresh_from_db()
        self.assertEqual((rx.status, rx.delivery_method), ("sent", "portal"))
        self.assertEqual(self.do(self.clerk, prx, "ready").status_code, 200)
        # only a pharmacist with a PRC number dispenses
        self.assertEqual(self.do(self.clerk, prx, "dispense", **self.dispense_body()).status_code, 403)
        r = self.do(self.rph, prx, "dispense", **self.dispense_body(quantity="10"))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], "partially_dispensed")
        self.assertEqual(r.json()["balance"], "20")
        r = self.do(self.rph, prx, "dispense", **self.dispense_body(quantity="20"))
        self.assertEqual(r.json()["status"], "dispensed")
        events = list(rx.events.values_list("event_type", flat=True))
        for e in ("portal_routed", "portal_accepted", "portal_ready", "portal_partially_dispensed", "portal_dispensed"):
            self.assertIn(e, events)
        # the prescriber sees it on the prescription
        detail = self.api(self.doctor).get(f"/api/prescriptions/{rx.pk}/").json()
        self.assertEqual((detail["portal"]["status"], detail["portal"]["pharmacy"]), ("dispensed", "Mercury Drug Cubao"))

    def test_generic_substitution_flows_to_the_med_profile(self):
        prx = self.portal_rx(self.signed())
        self.do(self.rph, prx, "accept")
        self.do(self.rph, prx, "dispense", **self.dispense_body(brand_name="Lifezar", manufacturer="Unilab"))
        d = PortalDispense.objects.get(portal=prx)
        self.assertEqual((d.generic_name, d.brand_name, d.manufacturer, d.pharmacist_prc), ("Losartan potassium", "Lifezar", "Unilab", "0045678"))
        admin = mk("adm", "admin", self.org)
        prof = self.api(admin).get(f"/api/pharmacy/med-profile/{self.patient.pk}/").json()
        row = prof["portal_dispensing"][0]
        self.assertEqual((row["drug"]["display"], row["manufacturer"], row["source"]), ("Losartan potassium (Lifezar)", "Unilab", "Mercury Drug Cubao"))
        self.assertEqual(self.do(self.rph, prx, "dispense", **self.dispense_body(generic_name="")).status_code, 409)

    def test_decline_needs_a_reason_and_returns_to_the_prescriber(self):
        rx = self.signed()
        prx = self.portal_rx(rx)
        self.assertEqual(self.do(self.rph, prx, "decline").status_code, 400)
        self.assertEqual(self.do(self.rph, prx, "decline", reason="Not stocked at this branch").status_code, 200)
        prx.refresh_from_db()
        self.assertEqual((prx.status, prx.partner), ("declined", None))
        alert = InboxAlert.objects.get(recipient=self.doctor, source_type="portal_declined")
        self.assertIn("Not stocked at this branch", alert.body)
        # back with the prescriber only: no other pharmacy can claim it
        r = self.api(self.rph_w).post("/api/pharmacy-portal/claim/", {"code": rx.claim_code, "birthdate": BIRTHDATE.isoformat(), "mobile_last4": "4567"}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertIn("returned to the prescriber", r.json()["detail"])

    def test_senior_or_pwd_id_is_recorded_without_pricing(self):
        prx = self.portal_rx(self.signed())
        self.do(self.rph, prx, "accept")
        self.assertEqual(self.do(self.rph, prx, "dispense", **self.dispense_body(discount_id_type="senior")).status_code, 400)
        r = self.do(self.rph, prx, "dispense", **self.dispense_body(discount_id_type="senior", discount_id_number="QC-SC-2019-004512"))
        self.assertEqual(r.status_code, 200)
        d = PortalDispense.objects.get(portal=prx)
        self.assertEqual((d.discount_id_type, d.discount_id_number), ("senior", "QC-SC-2019-004512"))
        self.assertNotIn("total", r.json()["dispenses"][0])

    def test_refill_then_no_more(self):
        prx = self.portal_rx(self.signed(refills=1))
        self.do(self.rph, prx, "accept")
        self.do(self.rph, prx, "dispense", **self.dispense_body())
        self.assertEqual(self.do(self.rph, prx, "refill").status_code, 200)
        self.do(self.rph, prx, "dispense", **self.dispense_body())
        r = self.do(self.rph, prx, "refill")
        self.assertEqual(r.status_code, 409)
        self.assertIn("renewal", r.json()["detail"])


class DangerousDrugTests(Base):
    def test_dispense_needs_yellow_serial_and_the_original_and_never_refills(self):
        rx = self.signed(drug="Morphine sulfate", strength="10 mg", is_yellow_rx=True, yellow_rx_serial="DDB-2026-0007777", refills=0, quantity=Decimal(10))
        prx = self.portal_rx(rx)
        detail = self.api(self.rph).get(f"/api/pharmacy-portal/rx/{prx.pk}/").json()
        self.assertTrue(detail["dangerous_drug"])
        self.assertEqual(detail["s2_number"], "S2-24680")
        self.do(self.rph, prx, "accept")
        body = self.dispense_body(quantity="10", generic_name="Morphine sulfate")
        self.assertEqual(self.do(self.rph, prx, "dispense", **body).status_code, 400)
        self.assertEqual(self.do(self.rph, prx, "dispense", **body, yellow_rx_serial="DDB-2026-0007777").status_code, 400)
        self.assertEqual(self.do(self.rph, prx, "dispense", **body, yellow_rx_serial="DDB-2026-0000000", original_in_hand=True).status_code, 400)
        r = self.do(self.rph, prx, "dispense", **body, yellow_rx_serial="DDB-2026-0007777", original_in_hand=True)
        self.assertEqual(r.status_code, 200, r.content)
        r = self.do(self.rph, prx, "refill")
        self.assertEqual(r.status_code, 409)
        self.assertIn("new prescription", r.json()["detail"])


class RequestCancelTests(Base):
    def test_change_request_goes_to_the_prescriber_and_the_answer_comes_back(self):
        prx = self.portal_rx(self.signed())
        self.do(self.rph, prx, "accept")
        url = f"/api/pharmacy-portal/rx/{prx.pk}/requests/"
        r = self.api(self.rph).post(url, {"kind": "strength_form", "message": "We only have 100 mg tablets", "proposed": "100 mg, half tablet daily"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        req = PortalRequest.objects.get(pk=r.json()["id"])
        alert = InboxAlert.objects.get(recipient=self.doctor, source_type="pharmacy_request", source_id=req.pk)
        self.assertIn("100 mg tablets", alert.body)
        self.assertEqual(self.api(self.rph).post(url, {"kind": "strength_form", "message": "again"}, format="json").status_code, 409)
        respond = f"/api/pharmacy/portal-requests/{req.pk}/respond/"
        self.assertEqual(self.api(self.doctor2).post(respond, {"decision": "approved"}, format="json").status_code, 403)
        self.assertEqual(self.api(self.doctor).post(respond, {"decision": "denied"}, format="json").status_code, 400)
        r = self.api(self.doctor).post(respond, {"decision": "approved", "response": "OK: 100 mg, half a tablet daily"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        notice = PortalNotice.objects.filter(partner=self.mercury, portal=prx).latest("id")
        self.assertIn("approved", notice.title)
        tabs = self.api(self.rph).get("/api/pharmacy-portal/rx/?tab=changes").json()
        self.assertEqual(tabs["results"][0]["id"], prx.pk)

    def test_approved_renewal_starts_a_renewal_draft(self):
        rx = self.signed(refills=0)
        prx = self.portal_rx(rx)
        self.do(self.rph, prx, "accept")
        self.do(self.rph, prx, "dispense", **self.dispense_body())
        r = self.api(self.rph).post(f"/api/pharmacy-portal/rx/{prx.pk}/requests/", {"kind": "renewal", "message": "Patient needs another month"}, format="json")
        req = PortalRequest.objects.get(pk=r.json()["id"])
        self.api(self.doctor).post(f"/api/pharmacy/portal-requests/{req.pk}/respond/", {"decision": "approved"}, format="json")
        req.refresh_from_db()
        self.assertEqual(req.renewal_prescription.renews_id, rx.pk)
        self.assertEqual(req.renewal_prescription.status, "draft")
        self.assertEqual(self.api(self.rph).get("/api/pharmacy-portal/rx/?tab=renewals").json()["results"][0]["id"], prx.pk)

    def test_prescriber_cancel_reaches_the_pharmacy_and_blocks_dispense(self):
        rx = self.signed()
        prx = self.portal_rx(rx)
        self.do(self.rph, prx, "accept")
        rxs.cancel(rx, self.doctor, "Wrong patient")
        prx.refresh_from_db()
        self.assertEqual(prx.status, "cancelled")
        self.assertTrue(PortalNotice.objects.filter(partner=self.mercury, title="Prescription cancelled").exists())
        r = self.do(self.rph, prx, "dispense", **self.dispense_body())
        self.assertEqual(r.status_code, 409)
        self.assertIn("cancelled", r.json()["detail"])


class StaffTests(Base):
    def test_pharmacy_admin_adds_a_pharmacist_login(self):
        r = self.api(self.clerk).post("/api/pharmacy-portal/staff/", {"full_name": "Melchora Aquino", "prc_number": "0055667", "email": "melchora@example.ph", "username": "melchora", "password": "a-long-password-2"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        u = User.objects.get(username="melchora")
        self.assertEqual((u.role, u.portal_membership.partner), ("ext_pharmacist", self.mercury))
        self.assertEqual(self.api(self.rph).post("/api/pharmacy-portal/staff/", {"full_name": "X", "prc_number": "1", "email": "x@example.ph", "username": "x2", "password": "a-long-password-3"}, format="json").status_code, 403)


class TransportTests(Base):
    def test_sms_can_be_added_as_a_channel(self):
        from . import portal_transport as tr

        sent = []

        class FakeSms(tr.Channel):
            name = "sms"

            def to_pharmacy(self, partner, title, body, portal_rx=None):
                sent.append(title)

        tr.CHANNELS.append(FakeSms())
        try:
            tr.notify_pharmacy(self.mercury, "Hello", "Body")
        finally:
            tr.CHANNELS.pop()
        self.assertEqual(sent, ["Hello"])
        self.assertIsInstance(tr.adapter_for(self.mercury), tr.PowerPortalAdapter)


class FollowUpTests(Base):
    """Jessie's answers to the Phase 3 questions."""

    def claim(self, user, rx, **extra):
        body = {"code": rx.claim_code, "birthdate": BIRTHDATE.isoformat(), "mobile_last4": "4567", **extra}
        return self.api(user).post("/api/pharmacy-portal/claim/", body, format="json")

    def test_1_claim_needs_birthdate_and_mobile_last4(self):
        rx = self.signed(pharmacy=None)
        self.assertEqual(self.claim(self.rph_w, rx, mobile_last4="").status_code, 400)
        r = self.claim(self.rph_w, rx, mobile_last4="0000")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json()["detail"], "No prescription matches that claim code, birthdate and mobile number.")
        self.assertEqual(self.claim(self.rph_w, rx).status_code, 201)

    def test_1_failed_claims_lock_the_pharmacy_for_the_hour(self):
        rx = self.signed(pharmacy=None)
        for _ in range(5):
            self.assertEqual(self.claim(self.rph_w, rx, mobile_last4="0000").status_code, 404)
        r = self.claim(self.rph_w, rx)  # even the right answer is refused while locked
        self.assertEqual(r.status_code, 429)
        self.assertTrue(PortalAccessLog.objects.filter(partner=self.watsons, action="claim_locked").exists())
        self.assertEqual(self.claim(self.rph, rx).status_code, 201)  # another pharmacy is not affected
        # an hour later the lock is gone
        PortalAccessLog.objects.filter(action="claim_failed").update(created_at=timezone.now() - timedelta(hours=2))
        self.assertEqual(self.claim(self.rph_w, self.signed(pharmacy=None, drug="Amlodipine besylate")).status_code, 201)

    def test_2_only_external_pharmacists_claim_or_accept(self):
        rx = self.signed(pharmacy=None)
        r = self.claim(self.clerk, rx)
        self.assertEqual(r.status_code, 403)
        prx = self.portal_rx(self.signed(drug="Amlodipine besylate"))
        self.assertEqual(self.do(self.clerk, prx, "accept").status_code, 403)
        self.assertEqual(self.do(self.rph, prx, "accept").status_code, 200)

    def test_4_declined_back_to_prescriber_then_rerouted(self):
        other = Pharmacy.objects.create(organization=self.org, name="Watsons Iloilo")
        PartnerDirectoryLink.objects.create(pharmacy=other, partner=self.watsons)
        rx = self.signed()
        prx = self.portal_rx(rx)
        self.do(self.rph, prx, "decline", reason="Out of stock")
        url = f"/api/pharmacy/portal-reroute/{rx.pk}/"
        self.assertEqual(self.api(self.doctor2).post(url, {"pharmacy": other.pk}, format="json").status_code, 403)
        r = self.api(self.doctor).post(url, {"pharmacy": other.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        prx.refresh_from_db()
        self.assertEqual((prx.partner, prx.status), (self.watsons, "new"))
        self.assertEqual(self.api(self.doctor).post(url, {"pharmacy": other.pk}, format="json").status_code, 409)  # not declined now

    def test_4_new_code_or_reprint_makes_it_claimable_again(self):
        rx = self.signed()
        self.do(self.rph, self.portal_rx(rx), "decline", reason="Out of stock")
        old_code = rx.claim_code
        r = self.api(self.doctor).post(f"/api/pharmacy/portal-reroute/{rx.pk}/", {"new_code": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        rx.refresh_from_db()
        self.assertNotEqual(rx.claim_code, old_code)
        self.assertEqual(self.claim(self.rph_w, rx, code=old_code).status_code, 404)  # the old printout no longer works
        self.assertEqual(self.claim(self.rph_w, rx).status_code, 201)
        # a reprint does the same
        rx2 = self.signed(drug="Amlodipine besylate")
        self.do(self.rph, self.portal_rx(rx2), "decline", reason="Closed for inventory")
        rxs.record_print(rx2, self.doctor)
        rx2.refresh_from_db()
        self.assertEqual(self.portal_rx(rx2).status, "released")
        self.assertEqual(self.claim(self.rph_w, rx2).status_code, 201)

    def test_5_staff_screen_add_edit_deactivate(self):
        url = "/api/pharmacy-portal/staff/"
        c = self.api(self.clerk)
        self.assertEqual(c.post(url, {"full_name": "Melchora Aquino", "prc_number": "0055667"}, format="json").status_code, 400)  # email needed
        r = c.post(url, {"full_name": "Melchora Aquino", "prc_number": "0055667", "email": "melchora@example.ph"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertFalse(r.json()["has_login"])  # a login is optional
        r = c.post(url, {"full_name": "Teodora Alonso", "prc_number": "0066778", "email": "teodora@example.ph", "username": "teodora", "password": "a-long-password-4"}, format="json")
        staff_id = r.json()["id"]
        r = c.patch(f"{url}{staff_id}/", {"prc_number": "0066779", "email": "t.alonso@example.ph"}, format="json")
        self.assertEqual((r.json()["prc_number"], r.json()["email"]), ("0066779", "t.alonso@example.ph"))
        r = c.patch(f"{url}{staff_id}/", {"is_active": False}, format="json")
        self.assertFalse(r.json()["is_active"])
        self.assertFalse(User.objects.get(username="teodora").is_active)
        self.assertEqual(self.api(self.rph).patch(f"{url}{staff_id}/", {"is_active": True}, format="json").status_code, 403)
        self.assertEqual(self.api(self.rph_w).patch(f"{url}{staff_id}/", {"is_active": True}, format="json").status_code, 403)
        clerk_row = PartnerPharmacist.objects.get(user=self.clerk)
        self.assertEqual(c.patch(f"{url}{clerk_row.pk}/", {"is_active": False}, format="json").status_code, 400)

    def test_6_access_log_admin_view_filter_and_csv(self):
        prx = self.portal_rx(self.signed())
        self.api(self.rph).get(f"/api/pharmacy-portal/rx/{prx.pk}/")
        self.api(self.rph_w).get("/api/pharmacy-portal/rx/")
        url = "/api/pharmacy/portal-access-log/"
        self.assertEqual(self.api(self.doctor).get(url).status_code, 403)
        data = self.api(self.sysadmin).get(url, {"pharmacy": self.mercury.pk}).json()
        self.assertEqual([r["action"] for r in data["results"]], ["view"])
        self.assertEqual(data["results"][0]["prescription"], f"RX-{prx.prescription_id:06d}")
        self.assertEqual(data["retention_days"], 5 * 365 + 1)
        r = self.api(self.sysadmin).get(url, {"export": "csv", "user": "rphw"})
        self.assertEqual(r["Content-Type"], "text/csv")
        lines = r.content.decode().strip().splitlines()
        self.assertEqual(lines[0].split(",")[:5], ["When", "Username", "Name", "Pharmacy", "Action"])
        self.assertEqual(len(lines), 2)
        self.assertIn("rphw", lines[1])

    def test_6_purge_removes_only_entries_older_than_5_years(self):
        from io import StringIO

        from django.core.management import call_command

        pt.log_access(self.rph, "view")
        old = pt.log_access(self.rph, "view")
        PortalAccessLog.objects.filter(pk=PortalAccessLog.objects.order_by("id").last().pk).update(created_at=timezone.now() - timedelta(days=5 * 365 + 10))
        out = StringIO()
        call_command("purge_portal_access_log", "--dry-run", stdout=out)
        self.assertIn("1 portal access-log entries", out.getvalue())
        self.assertEqual(PortalAccessLog.objects.count(), 2)
        call_command("purge_portal_access_log", stdout=StringIO())
        self.assertEqual(PortalAccessLog.objects.count(), 1)
        self.assertIsNone(old)

    def test_7_power_admins_are_emailed_when_a_pharmacy_registers(self):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.api().post("/api/pharmacy-portal/register/", {
                "name": "Botica Boie Davao", "fda_lto_number": "LTO-3000033333", "lto_expiry": NEXT_YEAR.isoformat(),
                "email": "boie@example.ph", "username": "boie_admin", "password": "a-long-password-1",
                "pharmacists": [{"full_name": "Juan Dela Cruz", "prc_number": "0033445", "email": "juan@example.ph"}],
            }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        sent = [m for m in mail.outbox if m.to == ["power-admin@example.ph"]]
        self.assertEqual(len(sent), 1)
        self.assertIn("Botica Boie Davao", sent[0].subject)
        self.assertEqual(PartnerPharmacist.objects.get(prc_number="0033445").email, "juan@example.ph")

    def test_8_notices_go_to_each_active_pharmacist_with_pharmacy_fallback(self):
        from . import portal_transport as tr

        PartnerPharmacist.objects.filter(user=self.rph).update(email="andres.b@example.ph")
        PartnerPharmacist.objects.create(partner=self.mercury, full_name="Inactive", prc_number="1", email="gone@example.ph", is_active=False)
        mail.outbox.clear()
        tr.notify_pharmacy(self.mercury, "Hello", "Body")
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ["andres.b@example.ph", "clerk@example.ph"])
        # a pharmacy with no pharmacist email falls back to its own email
        lone = self.partner("Botika Uno", "uno@example.ph", "LTO-1")
        PartnerPharmacist.objects.create(partner=lone, full_name="No email", prc_number="2")
        mail.outbox.clear()
        tr.notify_pharmacy(lone, "Hello", "Body")
        self.assertEqual([m.to for m in mail.outbox], [["uno@example.ph"]])
