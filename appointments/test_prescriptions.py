"""Rx writer: sig, controlled-drug block, signing rules, allergy/duplicate checks, print/fax audit, revise, scoping."""

from datetime import timedelta
from decimal import Decimal

from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import prescriptions as rxs
from . import rx_transport
from .models import PatientAllergy, PatientPharmacy, Pharmacy, PrescriberProfile, Prescription, PrescriptionEvent
from .test_patient_header import Base, make_user

LIST = "/api/prescriptions/"
DETAIL = "/api/prescriptions/{}/"
ACTION = "/api/prescriptions/{}/action/"
PDF = "/api/prescriptions/{}/pdf/"
META = "/api/prescription-meta/"
DRUGS = "/api/prescription-drugs/"
PHARMS = "/api/pharmacies/"
PHARM = "/api/pharmacies/{}/"
PATIENT_PHARM = "/api/patient-pharmacy/{}/"
PROFILE = "/api/prescriber-profile/"
QUEUES = "/api/prescriptions/queues/"
GOOD_NPI = "1234567893"


class PureTests(SimpleTestCase):
    def test_npi_check_digit(self):
        self.assertTrue(rxs.npi_valid(GOOD_NPI))
        self.assertFalse(rxs.npi_valid("1234567890"))
        self.assertFalse(rxs.npi_valid("12345"))
        self.assertFalse(rxs.npi_valid(""))

    def test_dea_check_digit(self):
        self.assertTrue(rxs.dea_valid("AB1234563"))
        self.assertFalse(rxs.dea_valid("AB1234560"))
        self.assertFalse(rxs.dea_valid("1234567"))

    def test_controlled_detection(self):
        for name in ("Oxycodone", "Percocet 5/325", "alprazolam", "Adderall XR", "Tramadol HCl", "zolpidem"):
            self.assertTrue(rxs.is_controlled(name), name)
        for name in ("Amoxicillin", "Lisinopril", "Metformin", "Ibuprofen", "Hydrochlorothiazide"):
            self.assertFalse(rxs.is_controlled(name), name)

    def test_sig_sentences(self):
        rx = Prescription(dose="1 tablet", route="PO", frequency="bid", duration_days=10, sig_extra="with food")
        self.assertEqual(rxs.build_sig(rx), "Take 1 tablet by mouth twice daily for 10 days. with food.")
        rx = Prescription(dose="1 tablet", route="PO", frequency="q6h", prn=True, prn_reason="pain")
        self.assertEqual(rxs.build_sig(rx), "Take 1 tablet by mouth every 6 hours as needed for pain.")
        rx = Prescription(dose="1 drop", route="Ophthalmic", frequency="tid", duration_days=1)
        self.assertEqual(rxs.build_sig(rx), "Instill 1 drop in the eye three times daily for 1 day.")
        rx = Prescription(dose="2 puffs", route="Inhaled", frequency="prn", prn_reason="wheezing")
        self.assertEqual(rxs.build_sig(rx), "Inhale 2 puffs by inhalation as needed for wheezing.")

    def test_capabilities_default(self):
        caps = rx_transport.capabilities()
        self.assertTrue(caps["print"]["available"])
        self.assertFalse(caps["fax"]["automatic"])
        self.assertFalse(caps["erx"]["available"])
        self.assertFalse(caps["controlled_substances"])
        with self.assertRaises(rx_transport.TransportNotConfigured):
            rx_transport.send_fax(None, b"", "5551234567")
        with self.assertRaises(rx_transport.TransportNotConfigured):
            rx_transport.send_erx(None)


class RxBase(Base):
    def setUp(self):
        super().setUp()
        self.doctor.npi = GOOD_NPI
        self.doctor.save()
        PrescriberProfile.objects.create(user=self.doctor, license_number="123456", license_state="NY", practice_name="Riverside Clinic", phone="718-555-0100", fax="718-555-0101")
        self.pharm = Pharmacy.objects.create(organization=self.org, name="Corner Pharmacy", address="1 Main St", city="Brooklyn", state="NY", zip_code="11201", phone="718-555-0199", fax="(718) 555-0198")
        self.doctor2 = make_user("doc2", "doctor", self.org, first_name="Ann", last_name="Roe")

    def as_(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def body(self, **extra):
        data = {
            "patient": self.patient.pk, "drug_name": "Amoxicillin", "strength": "500 mg", "form": "capsule",
            "dose": "1 capsule", "route": "PO", "frequency": "tid", "duration_days": 10,
            "quantity": "30", "quantity_unit": "capsules", "days_supply": 10, "refills": 0,
            "indication_code": "J01.90", "indication_text": "Acute infection",
        }
        data.update(extra)
        return data

    def make(self, user=None, **extra):
        r = self.as_(user or self.doctor).post(LIST, self.body(**extra), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def act(self, rx_id, action, user=None, **data):
        return self.as_(user or self.doctor).post(ACTION.format(rx_id), {"action": action, **data}, format="json")

    def signed(self, **extra):
        rx = self.make(**extra)
        r = self.act(rx["id"], "sign")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()


class CreateEditTests(RxBase):
    def test_doctor_creates_draft_for_self(self):
        rx = self.make()
        self.assertEqual(rx["status"], "draft")
        self.assertEqual(rx["prescriber"], self.doctor.pk)
        self.assertEqual(rx["sig"], "Take 1 capsule by mouth three times daily for 10 days.")
        self.assertEqual(rx["actions"], ["sign"])
        self.assertEqual(PrescriptionEvent.objects.filter(prescription_id=rx["id"], event_type="created").count(), 1)

    def test_nurse_drafts_for_named_doctor_but_cannot_sign(self):
        r = self.as_(self.nurse).post(LIST, self.body(), format="json")
        self.assertEqual(r.status_code, 400)  # no prescriber chosen
        rx = self.make(user=self.nurse, prescriber=self.doctor.pk)
        self.assertEqual(rx["actions"], [])
        self.assertEqual(self.act(rx["id"], "sign", user=self.nurse).status_code, 403)

    def test_registrar_and_patient_cannot_use(self):
        self.assertEqual(self.as_(self.registrar).post(LIST, self.body(), format="json").status_code, 403)
        self.assertEqual(self.as_(self.registrar).get(LIST).status_code, 403)

    def test_other_clinic_patient_not_found(self):
        r = self.as_(self.doctor).post(LIST, self.body(patient=self.other_patient.pk), format="json")
        self.assertEqual(r.status_code, 404)

    def test_controlled_substance_blocked(self):
        r = self.as_(self.doctor).post(LIST, self.body(drug_name="Oxycodone"), format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Controlled substances", r.json()["detail"])
        rx = self.make()
        r = self.as_(self.doctor).patch(DETAIL.format(rx["id"]), {"drug_name": "Percocet"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_validation(self):
        for bad in ({"route": "Sideways"}, {"frequency": "hourly-ish"}, {"form": "brick"}, {"quantity": "-3"}, {"quantity": "abc"}, {"refills": 12}, {"days_supply": 0}, {"duration_days": "x"}):
            r = self.as_(self.doctor).post(LIST, self.body(**bad), format="json")
            self.assertEqual(r.status_code, 400, bad)
        r = self.as_(self.doctor).post(LIST, {"patient": self.patient.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.as_(self.nurse).post(LIST, self.body(prescriber=self.outsider.pk), format="json")
        self.assertEqual(r.status_code, 400)

    def test_preferred_pharmacy_fills_in(self):
        PatientPharmacy.objects.create(patient=self.patient, pharmacy=self.pharm)
        self.assertEqual(self.make()["pharmacy"], self.pharm.pk)
        self.assertIsNone(self.make(pharmacy=None)["pharmacy"])

    def test_patch_draft_and_lock_after_sign(self):
        rx = self.make()
        r = self.as_(self.nurse).patch(DETAIL.format(rx["id"]), {"quantity": "20", "pharmacy": self.pharm.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["quantity"], "20")
        self.assertEqual(self.act(rx["id"], "sign").status_code, 200)
        r = self.as_(self.doctor).patch(DETAIL.format(rx["id"]), {"quantity": "5"}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.as_(self.doctor).delete(DETAIL.format(rx["id"])).status_code, 409)

    def test_delete_draft(self):
        rx = self.make()
        self.assertEqual(self.as_(self.doctor).delete(DETAIL.format(rx["id"])).status_code, 204)
        self.assertFalse(Prescription.objects.filter(pk=rx["id"]).exists())

    def test_cross_clinic_pharmacy_rejected(self):
        other = Pharmacy.objects.create(organization=self.other_org, name="Elsewhere")
        r = self.as_(self.doctor).post(LIST, self.body(pharmacy=other.pk), format="json")
        self.assertEqual(r.status_code, 400)


class SignTests(RxBase):
    def test_missing_pieces_listed(self):
        rx = self.make(quantity=None, days_supply=None)
        r = self.act(rx["id"], "sign")
        self.assertEqual(r.status_code, 400)
        self.assertIn("quantity", r.json()["errors"])
        self.assertIn("days' supply", r.json()["errors"])

    def test_prescriber_needs_npi_license_and_patient_dob(self):
        rx = self.make(user=self.doctor2, prescriber=self.doctor2.pk)
        r = self.act(rx["id"], "sign", user=self.doctor2)
        self.assertEqual(r.status_code, 400)
        self.assertIn("prescriber NPI", r.json()["errors"])
        self.assertIn("prescriber license number", r.json()["errors"])
        self.profile.date_of_birth = None
        self.profile.save()
        r = self.act(self.make()["id"], "sign")
        self.assertIn("patient date of birth", r.json()["errors"])

    def test_only_the_prescriber_signs(self):
        rx = self.make()
        self.assertEqual(self.act(rx["id"], "sign", user=self.admin).status_code, 403)
        self.assertEqual(self.act(rx["id"], "sign", user=self.doctor2).status_code, 403)
        self.assertEqual(self.act(rx["id"], "sign").status_code, 200)

    def test_signing_freezes_sig_and_snapshot(self):
        rx = self.make(pharmacy=self.pharm.pk)
        out = self.act(rx["id"], "sign").json()
        self.assertEqual(out["status"], "signed")
        self.assertEqual(out["signed_by_name"], "Jeffrey Lee")
        snap = out["clinical_snapshot"]
        self.assertEqual(snap["prescriber"]["npi"], GOOD_NPI)
        self.assertEqual(snap["prescriber"]["license_number"], "123456")
        self.assertEqual(snap["patient"]["name"], "Test Bcs")
        self.assertEqual(out["pharmacy_detail"]["name"], "Corner Pharmacy")
        self.pharm.name = "Renamed"
        self.pharm.save()
        again = self.as_(self.doctor).get(DETAIL.format(rx["id"])).json()
        self.assertEqual(again["pharmacy_detail"]["name"], "Corner Pharmacy")
        self.assertEqual(self.act(rx["id"], "sign").status_code, 409)  # already signed

    def test_allergy_stops_signing_until_reason(self):
        PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance="Amoxicillin", status="active", severity="severe", reaction="Hives")
        rx = self.make()
        self.assertTrue(rx["allergy_alerts"])
        r = self.act(rx["id"], "sign")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["errors"][0]["kind"], "allergy")
        r = self.act(rx["id"], "sign", allergy_override_reason="Tolerated before, allergy re-tested negative")
        self.assertEqual(r.status_code, 200)
        event = PrescriptionEvent.objects.get(prescription_id=rx["id"], event_type="signed")
        self.assertIn("allergy_override", event.detail)
        self.assertEqual(r.json()["clinical_snapshot"]["allergies"][0]["substance"], "Amoxicillin")

    def test_duplicate_needs_reason(self):
        self.signed()
        rx = self.make()
        self.assertTrue(rx["duplicates"])
        r = self.act(rx["id"], "sign")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["errors"][0]["kind"], "duplicate")
        r = self.act(rx["id"], "sign", duplicate_reason="Dose change")
        self.assertEqual(r.status_code, 200)

    def test_old_prescription_is_not_a_duplicate(self):
        first = self.signed()
        Prescription.objects.filter(pk=first["id"]).update(signed_at=timezone.now() - timedelta(days=60))
        rx = self.make()
        self.assertEqual(rx["duplicates"], [])
        self.assertEqual(self.act(rx["id"], "sign").status_code, 200)

    def test_different_drug_is_not_a_duplicate(self):
        self.signed()
        self.assertEqual(self.make(drug_name="Lisinopril")["duplicates"], [])

    def test_controlled_drug_cannot_be_signed_even_if_saved_earlier(self):
        rx = self.make()
        Prescription.objects.filter(pk=rx["id"]).update(drug_name="Oxycodone")
        r = self.act(rx["id"], "sign")
        self.assertEqual(r.status_code, 400)


class PrintFaxTests(RxBase):
    def test_draft_cannot_be_printed_but_can_be_previewed(self):
        rx = self.make()
        self.assertEqual(self.as_(self.doctor).post(PDF.format(rx["id"])).status_code, 409)
        r = self.as_(self.doctor).get(PDF.format(rx["id"]))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/pdf")
        self.assertTrue(r.content.startswith(b"%PDF"))
        self.assertEqual(Prescription.objects.get(pk=rx["id"]).print_count, 0)

    def test_print_logs_and_marks_given(self):
        rx = self.signed(pharmacy=self.pharm.pk)
        r = self.as_(self.nurse).post(PDF.format(rx["id"]))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b"%PDF"))
        row = Prescription.objects.get(pk=rx["id"])
        self.assertEqual((row.status, row.delivery_method, row.print_count), ("sent", "print", 1))
        self.assertIsNotNone(row.sent_at)
        self.assertEqual(self.as_(self.nurse).post(PDF.format(rx["id"])).status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.print_count, 2)
        types = list(PrescriptionEvent.objects.filter(prescription=row).values_list("event_type", flat=True))
        self.assertEqual(types[-2:], ["printed", "reprinted"])

    def test_preview_does_not_log(self):
        rx = self.signed()
        self.as_(self.doctor).get(PDF.format(rx["id"]))
        self.assertEqual(Prescription.objects.get(pk=rx["id"]).status, "signed")

    def test_fax_uses_pharmacy_number(self):
        rx = self.signed(pharmacy=self.pharm.pk)
        r = self.act(rx["id"], "fax", user=self.nurse, confirmation="FX-991")
        self.assertEqual(r.status_code, 200, r.content)
        out = r.json()
        self.assertEqual((out["status"], out["delivery_method"]), ("sent", "fax"))
        self.assertEqual(out["delivery_detail"]["fax_number"], "7185550198")
        self.assertEqual(out["delivery_detail"]["confirmation"], "FX-991")
        self.assertEqual(out["delivery_detail"]["mode"], "manual")

    def test_fax_needs_a_number(self):
        rx = self.signed()
        self.assertEqual(self.act(rx["id"], "fax").status_code, 400)
        self.assertEqual(self.act(rx["id"], "fax", fax_number="12345").status_code, 400)
        r = self.act(rx["id"], "fax", fax_number="1 (212) 555-0123")
        self.assertEqual(r.json()["delivery_detail"]["fax_number"], "2125550123")

    def test_second_fax_is_logged_not_a_new_state(self):
        rx = self.signed(pharmacy=self.pharm.pk)
        self.act(rx["id"], "fax")
        r = self.act(rx["id"], "fax", fax_number="2125550123")
        self.assertEqual(r.json()["status"], "sent")
        types = [e["type"] for e in r.json()["events"]]
        self.assertEqual(types[-2:], ["faxed", "faxed_again"])

    def test_draft_cannot_be_faxed(self):
        rx = self.make(pharmacy=self.pharm.pk)
        self.assertEqual(self.act(rx["id"], "fax").status_code, 409)

    def test_watermarks_do_not_break_pdf(self):
        rx = self.signed()
        self.act(rx["id"], "cancel", reason="Wrong drug")
        r = self.as_(self.doctor).get(PDF.format(rx["id"]))
        self.assertTrue(r.content.startswith(b"%PDF"))

    def test_pdf_scoped_to_clinic(self):
        rx = self.signed()
        self.assertEqual(self.as_(self.outsider).get(PDF.format(rx["id"])).status_code, 404)
        self.assertEqual(self.as_(self.outsider).post(PDF.format(rx["id"])).status_code, 404)


class CancelReviseTests(RxBase):
    def test_cancel_needs_reason_and_authority(self):
        rx = self.signed()
        self.assertEqual(self.act(rx["id"], "cancel", user=self.nurse, reason="x").status_code, 403)
        self.assertEqual(self.act(rx["id"], "cancel", user=self.doctor2, reason="x").status_code, 403)
        self.assertEqual(self.act(rx["id"], "cancel").status_code, 400)
        r = self.act(rx["id"], "cancel", reason="Patient allergic")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()["status"], r.json()["cancel_reason"]), ("cancelled", "Patient allergic"))
        self.assertEqual(self.act(rx["id"], "cancel", reason="again").status_code, 409)

    def test_admin_can_cancel_and_sent_flags_pharmacy(self):
        rx = self.signed(pharmacy=self.pharm.pk)
        self.act(rx["id"], "fax")
        r = self.act(rx["id"], "cancel", user=self.admin, reason="Entered in error")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["events"][-1]["detail"]["pharmacy_must_be_told"])

    def test_draft_cannot_be_cancelled(self):
        self.assertEqual(self.act(self.make()["id"], "cancel", reason="x").status_code, 409)

    def test_revise_makes_a_draft_and_signing_replaces_the_old(self):
        old = self.signed(pharmacy=self.pharm.pk)
        r = self.act(old["id"], "revise", user=self.nurse)
        self.assertEqual(r.status_code, 201, r.content)
        new = r.json()
        self.assertEqual((new["status"], new["replaces"], new["pharmacy"]), ("draft", old["id"], self.pharm.pk))
        again = self.act(old["id"], "revise")
        self.assertEqual(again.json()["id"], new["id"])  # one open revision at a time
        self.as_(self.doctor).patch(DETAIL.format(new["id"]), {"quantity": "21", "days_supply": 7}, format="json")
        self.assertEqual(self.as_(self.doctor).get(DETAIL.format(new["id"])).json()["duplicates"], [])
        signed = self.act(new["id"], "sign")
        self.assertEqual(signed.status_code, 200, signed.content)
        old_row = Prescription.objects.get(pk=old["id"])
        self.assertEqual(old_row.status, "cancelled")
        self.assertEqual(old_row.cancel_reason, f"Replaced by Rx {new['id']}")

    def test_cannot_revise_a_draft(self):
        self.assertEqual(self.act(self.make()["id"], "revise").status_code, 409)

    def test_unknown_action(self):
        self.assertEqual(self.act(self.make()["id"], "explode").status_code, 400)


class ListScopeTests(RxBase):
    def test_filters_and_scope(self):
        a = self.make()
        b = self.signed(drug_name="Lisinopril", strength="10 mg", form="tablet", dose="1 tablet", frequency="daily", quantity="30", quantity_unit="tablets", days_supply=30)
        rows = self.as_(self.doctor).get(LIST, {"patient": self.patient.pk}).json()
        self.assertEqual(rows["count"], 2)
        self.assertEqual({r["id"] for r in self.as_(self.doctor).get(LIST, {"status": "draft"}).json()["results"]}, {a["id"]})
        self.assertEqual({r["id"] for r in self.as_(self.doctor).get(LIST, {"status": "active"}).json()["results"]}, {b["id"]})
        self.assertEqual({r["id"] for r in self.as_(self.doctor).get(LIST, {"q": "lisin"}).json()["results"]}, {b["id"]})
        self.assertEqual(self.as_(self.doctor).get(LIST, {"prescriber": "me"}).json()["count"], 2)
        self.assertEqual(self.as_(self.doctor2).get(LIST, {"prescriber": "me"}).json()["count"], 0)
        self.assertEqual(self.as_(self.outsider).get(LIST).json()["count"], 0)
        self.assertEqual(self.as_(self.outsider).get(DETAIL.format(a["id"])).status_code, 404)
        self.assertEqual(self.as_(self.outsider).post(ACTION.format(a["id"]), {"action": "sign"}, format="json").status_code, 404)

    def test_queues_filter_and_count(self):
        draft = self.make()
        to_send = self.signed(drug_name="Lisinopril", strength="10 mg", form="tablet", dose="1 tablet", frequency="daily", quantity="30", quantity_unit="tablets", days_supply=30)
        sent = self.signed(drug_name="Metformin", strength="500 mg", form="tablet", dose="1 tablet", frequency="bid", quantity="60", quantity_unit="tablets", days_supply=30)
        self.assertEqual(self.as_(self.doctor).post(PDF.format(sent["id"]), {}, format="json").status_code, 200)
        gone = self.signed(drug_name="Ibuprofen", strength="400 mg", form="tablet", dose="1 tablet", frequency="q8h", quantity="20", quantity_unit="tablets", days_supply=7)
        self.assertEqual(self.act(gone["id"], "cancel", reason="Entered in error").status_code, 200)

        def ids(queue, **extra):
            return {r["id"] for r in self.as_(self.doctor).get(LIST, {"queue": queue, **extra}).json()["results"]}

        self.assertEqual(ids("needs_signing"), {draft["id"]})
        self.assertEqual(ids("to_send"), {to_send["id"]})
        self.assertEqual(ids("sent"), {sent["id"]})
        self.assertEqual(ids("cancelled"), {gone["id"]})
        self.assertEqual(len(ids("all")), 4)
        counts = self.as_(self.doctor).get(QUEUES).json()["counts"]
        self.assertEqual(counts, {"needs_signing": 1, "to_send": 1, "renewals": 0, "sent": 1, "cancelled": 1, "all": 4})
        # the counts follow the search / prescriber / patient filters, but not the queue itself
        self.assertEqual(self.as_(self.doctor).get(QUEUES, {"q": "metfor"}).json()["counts"]["all"], 1)
        self.assertEqual(self.as_(self.doctor2).get(QUEUES, {"prescriber": "me"}).json()["counts"]["all"], 0)
        self.assertEqual(self.as_(self.doctor).get(QUEUES, {"patient": self.patient.pk}).json()["counts"]["all"], 4)
        # other clinics see nothing, and roles that can't prescribe are refused
        self.assertEqual(self.as_(self.outsider).get(QUEUES).json()["counts"]["all"], 0)
        self.assertEqual(self.as_(self.registrar).get(QUEUES).status_code, 403)

    def test_paging(self):
        for _ in range(3):
            self.make()
        r = self.as_(self.doctor).get(LIST, {"page_size": 2}).json()
        self.assertEqual((r["count"], len(r["results"])), (3, 2))


class PharmacyAndProfileTests(RxBase):
    def test_pharmacy_crud(self):
        c = self.as_(self.nurse)
        r = c.post(PHARMS, {"name": "  Walk-in Rx ", "state": "ny", "fax": "212-555-0000", "ncpdp_id": "1234567"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        pid = r.json()["id"]
        self.assertEqual((r.json()["name"], r.json()["state"]), ("Walk-in Rx", "NY"))
        self.assertEqual(c.post(PHARMS, {"name": ""}, format="json").status_code, 400)
        self.assertEqual(c.post(PHARMS, {"name": "X", "ncpdp_id": "ab"}, format="json").status_code, 400)
        names = [p["name"] for p in c.get(PHARMS, {"q": "walk"}).json()["results"]]
        self.assertEqual(names, ["Walk-in Rx"])
        self.assertEqual(c.patch(PHARM.format(pid), {"city": "Queens"}, format="json").json()["city"], "Queens")
        self.assertEqual(self.as_(self.outsider).get(PHARM.format(pid)).status_code, 404)
        self.assertEqual(c.delete(PHARM.format(pid)).status_code, 403)  # nurses can't remove
        self.assertEqual(self.as_(self.doctor).delete(PHARM.format(pid)).status_code, 204)

    def test_used_pharmacy_is_deactivated_not_deleted(self):
        self.make(pharmacy=self.pharm.pk)
        r = self.as_(self.admin).delete(PHARM.format(self.pharm.pk))
        self.assertTrue(r.json()["deactivated"])
        self.assertEqual(self.as_(self.doctor).get(PHARMS).json()["results"], [])
        self.assertEqual(len(self.as_(self.doctor).get(PHARMS, {"all": "1"}).json()["results"]), 1)

    def test_patient_pharmacy(self):
        c = self.as_(self.nurse)
        self.assertIsNone(c.get(PATIENT_PHARM.format(self.patient.pk)).json()["pharmacy"])
        r = c.put(PATIENT_PHARM.format(self.patient.pk), {"pharmacy": self.pharm.pk}, format="json")
        self.assertEqual(r.json()["pharmacy"]["name"], "Corner Pharmacy")
        self.assertEqual(c.get(PATIENT_PHARM.format(self.patient.pk)).json()["pharmacy"]["id"], self.pharm.pk)
        elsewhere = Pharmacy.objects.create(organization=self.other_org, name="Elsewhere")
        self.assertEqual(c.put(PATIENT_PHARM.format(self.patient.pk), {"pharmacy": elsewhere.pk}, format="json").status_code, 400)
        self.assertIsNone(c.put(PATIENT_PHARM.format(self.patient.pk), {"pharmacy": None}, format="json").json()["pharmacy"])
        self.assertEqual(self.as_(self.registrar).get(PATIENT_PHARM.format(self.patient.pk)).status_code, 403)
        self.assertEqual(self.as_(self.outsider).get(PATIENT_PHARM.format(self.patient.pk)).status_code, 404)

    def test_profile_get_and_put(self):
        c = self.as_(self.doctor2)
        self.assertFalse(c.get(PROFILE).json()["ready"])
        self.assertEqual(c.put(PROFILE, {"npi": "1234567890"}, format="json").status_code, 400)
        self.assertEqual(c.put(PROFILE, {"dea_number": "AB1234560"}, format="json").status_code, 400)
        r = c.put(PROFILE, {"npi": GOOD_NPI, "license_number": "998877", "license_state": "ny", "dea_number": "ab1234563", "phone": "212-555-1111"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        out = r.json()
        self.assertTrue(out["ready"])
        self.assertEqual((out["license_state"], out["dea_number"]), ("NY", "AB1234563"))
        self.assertEqual(c.get(PROFILE).json()["npi"], GOOD_NPI)

    def test_profile_permissions(self):
        self.assertEqual(self.as_(self.nurse).put(PROFILE + f"?user={self.doctor.pk}", {"fax": "1"}, format="json").status_code, 403)
        self.assertEqual(self.as_(self.admin).put(PROFILE + f"?user={self.doctor.pk}", {"fax": "718-555-7777"}, format="json").json()["fax"], "718-555-7777")
        self.assertEqual(self.as_(self.outsider).get(PROFILE + f"?user={self.doctor.pk}").status_code, 404)
        self.assertEqual(self.as_(self.registrar).get(PROFILE).status_code, 403)


class MetaAndSearchTests(RxBase):
    def test_meta(self):
        r = self.as_(self.nurse).get(META).json()
        self.assertIn("bid", [f["value"] for f in r["frequencies"]])
        self.assertIn("PO", r["routes"])
        self.assertEqual(r["max_refills"], 11)
        ready = {d["name"]: d["ready"] for d in r["doctors"]}
        self.assertTrue(ready["Jeffrey Lee"])
        self.assertFalse(ready["Ann Roe"])
        self.assertFalse(r["can_sign"])
        self.assertEqual([q["value"] for q in r["queues"]], ["needs_signing", "to_send", "renewals", "sent", "cancelled", "all"])
        self.assertTrue(self.as_(self.doctor).get(META).json()["can_sign"])
        self.assertEqual(self.as_(self.registrar).get(META).status_code, 403)

    @override_settings(ALLERGY_RXNORM_ENABLED=False)
    def test_drug_search_flags_controlled_and_drops_classes(self):
        r = self.as_(self.doctor).get(DRUGS, {"q": "oxyc"}).json()
        flagged = {x["display"].lower(): x["controlled"] for x in r["results"]}
        self.assertTrue(flagged.get("oxycodone"))
        r = self.as_(self.doctor).get(DRUGS, {"q": "penicillin"}).json()
        self.assertTrue(all(not x["display"].endswith("(class)") for x in r["results"]))
        self.assertEqual(self.as_(self.doctor).get(DRUGS, {"q": "a"}).json()["results"], [])
        self.assertEqual(self.as_(self.registrar).get(DRUGS, {"q": "amox"}).status_code, 403)
