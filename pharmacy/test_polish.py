"""POWER Pharmacy polish: pharmacists read but never place orders or prescriptions, the Med Profile follows the active
clinic (and facility), and a CrCl that can't be calculated is said out loud (and alerts for renally cleared drugs)."""

from datetime import date
from unittest import mock

from appointments.models import Facility, Prescription
from users.models import Patient, Registration

from . import services as svc
from .tests import Base, mk

MED_PROFILE = "/api/pharmacy/med-profile/{}/"


class PharmacistsReadOnlyTests(Base):
    """1. The order and prescription UIs hide every place / new / sign control; the backend refuses them anyway."""

    def test_pharmacy_roles_read_orders_but_cannot_place_or_prescribe(self):
        self.med()
        for user in (self.pharmacist, self.tech):
            c = self.api(user)
            r = c.get("/api/orders/", {"patient": self.patient.pk})
            self.assertEqual(r.status_code, 200, user.role)
            self.assertEqual(c.post("/api/orders/", {"appointment": self.appt.pk, "orderable": self.para.pk}, format="json").status_code, 403, user.role)
            r = c.post("/api/prescriptions/", {"patient": self.patient.pk, "drug_name": "Amoxicillin 500 mg capsule"}, format="json")
            self.assertEqual(r.status_code, 403, user.role)
            r = c.post("/api/prescription-favorites/", {"drug_name": "Amoxicillin 500 mg capsule"}, format="json")
            self.assertEqual(r.status_code, 403, user.role)
        self.assertEqual(
            self.api(self.doctor).post("/api/orders/", {"appointment": self.appt.pk, "orderable": self.para.pk}, format="json").status_code, 201)


class MedProfileScopeTests(Base):
    """2. The Med Profile is scoped to the active clinic (and the user's facilities), like the verification queue."""

    def setUp(self):
        super().setUp()
        self.sysadmin = mk("sys", "system_admin", None)
        self.cebu_patient = mk("patc", "patient", self.other, "Ramon", "Magsaysay")
        Prescription.objects.create(organization=self.other, patient=self.patient, prescriber=self.doctor, created_by=self.doctor,
                                    drug_name="Losartan potassium 50 mg tablet", status="signed")  # another clinic's Rx for the same person

    def test_own_clinic_only(self):
        self.assertEqual(self.api(self.pharmacist).get(MED_PROFILE.format(self.patient.pk)).status_code, 200)
        self.assertEqual(self.api(self.pharmacist).get(MED_PROFILE.format(self.cebu_patient.pk)).status_code, 404)
        self.assertEqual(self.api(self.foreign_rph).get(MED_PROFILE.format(self.patient.pk)).status_code, 404)

    def test_lists_only_the_active_clinics_records(self):
        Prescription.objects.create(organization=self.org, patient=self.patient, prescriber=self.doctor, created_by=self.doctor,
                                    drug_name="Metformin 500 mg tablet", status="signed")
        rxs = self.api(self.pharmacist).get(MED_PROFILE.format(self.patient.pk)).json()["prescriptions"]
        self.assertEqual([r["drug"]["generic"].split()[0] for r in rxs], ["Metformin"])  # not the Cebu losartan

    def test_system_admin_follows_the_chosen_clinic_or_sees_all(self):
        c = self.api(self.sysadmin)
        self.assertEqual(c.get(MED_PROFILE.format(self.cebu_patient.pk), {"org": self.other.pk}).status_code, 200)
        self.assertEqual(c.get(MED_PROFILE.format(self.cebu_patient.pk), {"org": self.org.pk}).status_code, 404)
        self.assertEqual(c.get(MED_PROFILE.format(self.cebu_patient.pk)).status_code, 200)  # no clinic chosen: every clinic
        both = c.get(MED_PROFILE.format(self.patient.pk)).json()["prescriptions"]
        self.assertEqual(len(both), 1)  # unscoped: the Cebu Rx shows (Manila has none here)

    def test_facility_limited_pharmacist(self):
        stmary = Facility.objects.create(organization=self.org, name="St. Mary Hospital", kind="hospital")
        lourdes = Facility.objects.create(organization=self.org, name="Our Lady of Lourdes Hospital", kind="hospital")
        self.pharmacist.facilities.set([stmary])
        profile = Patient.objects.get(user=self.patient)
        self.assertEqual(self.api(self.pharmacist).get(MED_PROFILE.format(self.patient.pk)).status_code, 200)  # not registered yet
        reg = Registration.objects.create(patient=profile, organization=self.org, facility=lourdes)
        self.assertEqual(self.api(self.pharmacist).get(MED_PROFILE.format(self.patient.pk)).status_code, 404)  # another facility
        Registration.objects.filter(pk=reg.pk).update(facility=stmary)
        self.assertEqual(self.api(self.pharmacist).get(MED_PROFILE.format(self.patient.pk)).status_code, 200)
        self.assertEqual(self.api(self.tech).get(MED_PROFILE.format(self.patient.pk)).status_code, 200)  # not limited


class CrClNotCalculatedTests(Base):
    """4. When CrCl can't be calculated, say why; a renally cleared drug gets a renal alert instead of none."""

    def test_note_names_what_is_missing(self):
        Patient.objects.filter(user=self.patient).update(date_of_birth=date(1958, 3, 14), legal_sex="M")
        self.patient.refresh_from_db()
        renal = svc.renal_info(self.patient)
        self.assertIsNone(renal["crcl"])
        self.assertEqual(renal["crcl_note"], "CrCl not calculated — missing weight, serum creatinine")

    def test_note_for_a_child(self):
        Patient.objects.filter(user=self.patient).update(date_of_birth=date.today().replace(year=date.today().year - 9), legal_sex="F")
        self.patient.refresh_from_db()
        with mock.patch("appointments.intake_output_views.weight_kg", return_value=28):
            note = svc.renal_info(self.patient)["crcl_note"]
        self.assertIn("missing serum creatinine", note)
        self.assertIn("patient under 18", note)

    def test_renally_cleared_drug_without_crcl_gets_a_moderate_alert(self):
        from appointments.models import Orderable

        vanco = Orderable.objects.create(code="vanco1g", name="Vancomycin 1 g IV", category="medication", generic_name="Vancomycin")
        order = self.med(vanco)
        renal = {"crcl": None, "crcl_note": "CrCl not calculated — missing weight", "renal_flag": False, "scr_mg_dl": 1.1, "weight_kg": None}
        alerts = svc.cds_alerts(order, renal)
        self.assertEqual([(a["key"], a["severity"]) for a in alerts], [("renal", "moderate")])
        self.assertTrue(alerts[0]["message"].startswith("CrCl not calculated — missing weight. Vancomycin needs a dose check"))
        # a drug with no renal threshold: still no renal alert
        self.assertEqual(svc.cds_alerts(self.med(self.para), renal), [])

    def test_queue_and_patient_list_carry_the_note(self):
        self.med()
        row = self.api(self.pharmacist).get("/api/pharmacy/queue/").json()["results"][0]
        detail = self.api(self.pharmacist).get(f"/api/pharmacy/orders/{row['id']}/").json()
        self.assertTrue(detail["renal"]["crcl_note"].startswith("CrCl not calculated — missing"))
