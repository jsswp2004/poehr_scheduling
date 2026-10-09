"""Home medications: the patient's own list, reconciliation, and the link from signed prescriptions."""

from datetime import date, timedelta

from .models import HomeMedication, MedReview, PatientAllergy
from .test_prescriptions import GOOD_NPI, RxBase  # noqa: F401  (RxBase gives the clinic, doctor, pharmacy)

LIST = "/api/home-medications/"
ONE = "/api/home-medications/{}/"
ACT = "/api/home-medications/{}/action/"
REVIEW = "/api/home-medications/review/"


class HomeMedBase(RxBase):
    def add(self, user=None, **extra):
        data = {"patient": self.patient.pk, "drug_name": "Lisinopril", "strength": "10 mg", "form": "tablet", "dose": "1 tablet", "route": "PO", "frequency": "daily"}
        data.update(extra)
        r = self.as_(user or self.nurse).post(LIST, data, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def list(self, user=None, **params):
        return self.as_(user or self.nurse).get(LIST, {"patient": self.patient.pk, **params})


class ListAndCreateTests(HomeMedBase):
    def test_add_and_list_with_directions_sentence(self):
        med = self.add(source="patient", indication_text="Blood pressure", last_taken=str(date.today() - timedelta(days=1)))
        self.assertEqual(med["sig"], "Take 1 tablet by mouth once daily.")
        self.assertEqual(med["source_label"], "Patient")
        self.assertEqual(med["status"], "active")
        r = self.list().json()
        self.assertEqual([m["drug_name"] for m in r["results"]], ["Lisinopril"])
        self.assertEqual(r["counts"], {"active": 1, "stopped": 0})
        self.assertIsNone(r["last_review"])
        self.assertIn("daily", [f["value"] for f in r["options"]["frequencies"]])

    def test_validation(self):
        c = self.as_(self.nurse)
        base = {"patient": self.patient.pk}
        self.assertEqual(c.post(LIST, {**base}, format="json").status_code, 400)
        self.assertEqual(c.post(LIST, {**base, "drug_name": "X", "route": "Nope"}, format="json").status_code, 400)
        self.assertEqual(c.post(LIST, {**base, "drug_name": "X", "frequency": "Nope"}, format="json").status_code, 400)
        self.assertEqual(c.post(LIST, {**base, "drug_name": "X", "source": "Nope"}, format="json").status_code, 400)
        self.assertEqual(c.post(LIST, {**base, "drug_name": "X", "form": "Nope"}, format="json").status_code, 400)
        self.assertEqual(c.post(LIST, {**base, "drug_name": "X", "last_taken": "soon"}, format="json").status_code, 400)
        future = str(date.today() + timedelta(days=2))
        self.assertEqual(c.post(LIST, {**base, "drug_name": "X", "last_taken": future}, format="json").status_code, 400)
        self.assertEqual(c.post(LIST, {"drug_name": "X"}, format="json").status_code, 400)

    def test_the_same_medicine_is_not_listed_twice(self):
        self.add()
        r = self.as_(self.nurse).post(LIST, {"patient": self.patient.pk, "drug_name": "lisinopril"}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertIn("already on", r.json()["detail"])

    def test_controlled_medicines_can_be_recorded_but_are_flagged(self):
        med = self.add(drug_name="Oxycodone")
        self.assertTrue(med["controlled"])

    def test_allergy_alert_is_shown_on_the_entry(self):
        PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance="Amoxicillin", status="active", severity="severe", reaction="Hives")
        med = self.add(drug_name="Amoxicillin")
        self.assertTrue(med["allergy_alerts"])

    def test_roles_and_clinics(self):
        self.assertEqual(self.as_(self.registrar).get(LIST, {"patient": self.patient.pk}).status_code, 403)
        self.assertEqual(self.as_(self.registrar).post(LIST, {"patient": self.patient.pk, "drug_name": "X"}, format="json").status_code, 403)
        med = self.add()
        self.assertEqual(self.as_(self.outsider).get(LIST, {"patient": self.patient.pk}).status_code, 404)
        self.assertEqual(self.as_(self.outsider).get(ONE.format(med["id"])).status_code, 404)
        self.assertEqual(self.as_(self.doctor).get(ONE.format(med["id"])).status_code, 200)


class EditStopResumeTests(HomeMedBase):
    def test_edit_stop_resume(self):
        med = self.add()
        r = self.as_(self.nurse).patch(ONE.format(med["id"]), {"dose": "2 tablets", "sig_extra": "with food"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["sig"], "Take 2 tablets by mouth once daily. with food.")
        # a reason is needed to stop
        self.assertEqual(self.as_(self.nurse).post(ACT.format(med["id"]), {"action": "stop"}, format="json").status_code, 400)
        stopped = self.as_(self.nurse).post(ACT.format(med["id"]), {"action": "stop", "reason": "Cough"}, format="json").json()
        self.assertEqual((stopped["status"], stopped["stop_reason"]), ("stopped", "Cough"))
        self.assertEqual(self.list().json()["results"], [])
        self.assertEqual(len(self.list(status="stopped").json()["results"]), 1)
        # a stopped medicine can't be edited or stopped again
        self.assertEqual(self.as_(self.nurse).patch(ONE.format(med["id"]), {"dose": "1"}, format="json").status_code, 409)
        self.assertEqual(self.as_(self.nurse).post(ACT.format(med["id"]), {"action": "stop", "reason": "x"}, format="json").status_code, 409)
        back = self.as_(self.nurse).post(ACT.format(med["id"]), {"action": "resume"}, format="json").json()
        self.assertEqual((back["status"], back["stop_reason"]), ("active", ""))
        self.assertEqual(self.as_(self.nurse).post(ACT.format(med["id"]), {"action": "resume"}, format="json").status_code, 409)

    def test_cannot_resume_a_medicine_added_again_meanwhile(self):
        med = self.add()
        self.as_(self.nurse).post(ACT.format(med["id"]), {"action": "stop", "reason": "Cough"}, format="json")
        self.add()  # started again as a new entry
        r = self.as_(self.nurse).post(ACT.format(med["id"]), {"action": "resume"}, format="json")
        self.assertEqual(r.status_code, 409)

    def test_rename_into_a_duplicate_is_refused(self):
        self.add()
        other = self.add(drug_name="Metformin")
        r = self.as_(self.nurse).patch(ONE.format(other["id"]), {"drug_name": "Lisinopril"}, format="json")
        self.assertEqual(r.status_code, 409)

    def test_unknown_action(self):
        med = self.add()
        self.assertEqual(self.as_(self.nurse).post(ACT.format(med["id"]), {"action": "dance"}, format="json").status_code, 400)


class ReconciliationTests(HomeMedBase):
    def test_confirm_one_medicine(self):
        med = self.add()
        done = self.as_(self.doctor).post(ACT.format(med["id"]), {"action": "confirm"}, format="json").json()
        self.assertTrue(done["reviewed_at"])
        self.assertEqual(done["reviewed_by_name"], "Jeffrey Lee")

    def test_review_the_whole_list(self):
        a = self.add()
        b = self.add(drug_name="Metformin", strength="500 mg", frequency="bid")
        self.as_(self.nurse).post(ACT.format(b["id"]), {"action": "stop", "reason": "Stopped by PCP"}, format="json")
        r = self.as_(self.doctor).post(REVIEW, {"patient": self.patient.pk, "note": "Reviewed with patient and daughter"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["medications"][0]["drug_name"], "Lisinopril")
        self.assertEqual(body["by"], "Jeffrey Lee")
        listed = self.list().json()
        self.assertEqual(listed["last_review"]["note"], "Reviewed with patient and daughter")
        self.assertTrue(listed["results"][0]["reviewed_at"])
        self.assertTrue(a["id"])
        hist = self.as_(self.nurse).get(REVIEW, {"patient": self.patient.pk}).json()["results"]
        self.assertEqual(len(hist), 1)

    def test_an_empty_list_can_be_confirmed(self):
        r = self.as_(self.nurse).post(REVIEW, {"patient": self.patient.pk}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["count"], 0)

    def test_review_roles_and_clinics(self):
        self.assertEqual(self.as_(self.registrar).post(REVIEW, {"patient": self.patient.pk}, format="json").status_code, 403)
        self.assertEqual(self.as_(self.outsider).post(REVIEW, {"patient": self.patient.pk}, format="json").status_code, 404)
        self.assertEqual(MedReview.objects.count(), 0)


class SignedPrescriptionTests(HomeMedBase):
    def test_signing_puts_the_medicine_on_the_home_list(self):
        rx = self.signed(drug_name="Metformin", strength="500 mg", form="tablet", dose="1 tablet", frequency="bid", quantity="60", quantity_unit="tablets", days_supply=30)
        meds = HomeMedication.objects.filter(patient=self.patient)
        self.assertEqual(meds.count(), 1)
        med = meds.first()
        self.assertEqual((med.drug_name, med.source, med.from_prescription_id, med.status), ("Metformin", "our_rx", rx["id"], "active"))
        self.assertEqual(med.dose, "1 tablet")

    def test_a_medicine_already_listed_is_not_added_twice(self):
        self.add(drug_name="Amoxicillin")
        self.signed()
        self.assertEqual(HomeMedication.objects.filter(patient=self.patient, drug_name__iexact="amoxicillin").count(), 1)

    def test_a_drafted_prescription_is_not_a_home_medicine(self):
        self.make()
        self.assertEqual(HomeMedication.objects.count(), 0)

    def test_a_stopped_medicine_started_again_gets_a_new_entry(self):
        first = self.add(drug_name="Amoxicillin")
        self.as_(self.nurse).post(ACT.format(first["id"]), {"action": "stop", "reason": "Course done"}, format="json")
        self.signed()
        self.assertEqual(HomeMedication.objects.filter(patient=self.patient, status="active").count(), 1)
        self.assertEqual(HomeMedication.objects.filter(patient=self.patient).count(), 2)
