"""Clinical Summary: the problem list, the fishbone lab panels and the one-call summary behind the chart tab."""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.utils import timezone
from rest_framework.test import APIClient

from . import fishbone
from . import orders_workflow as ow
from .models import (
    Appointment,
    ClinicalNote,
    FlowsheetTemplate,
    HomeMedication,
    LabReport,
    LabResultItem,
    MedReview,
    Orderable,
    OrderTask,
    PatientAllergy,
    Prescription,
    ProblemListEntry,
    Referral,
    VitalSignsFlowsheet,
)
from .prescription_views import _name
from .test_patient_header import Base

SUMMARY = "/api/clinical-summary/"
PROBLEMS = "/api/problem-list/"
PROBLEM = "/api/problem-list/{}/"


class SummaryBase(Base):
    def as_(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def problem(self, user=None, **extra):
        data = {"patient": self.patient.pk, "description": "Type 2 diabetes", "code": "e11.9"}
        data.update(extra)
        r = self.as_(user or self.doctor).post(PROBLEMS, data, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def report(self, rows, days_ago=0, status="final", title="Panel", patient=None):
        when = timezone.now() - timedelta(days=days_ago)
        rep = LabReport.objects.create(
            organization=self.org, patient=patient or self.patient, title=title, status=status,
            collected_at=when, resulted_at=when,
        )
        for n, row in enumerate(rows):
            name, value = row[0], row[1]
            extra = row[2] if len(row) > 2 else {}
            LabResultItem.objects.create(report=rep, sort_order=n, test_name=name, value=str(value), **extra)
        return rep

    def summary(self, user=None, **params):
        return self.as_(user or self.doctor).get(SUMMARY, {"patient": self.patient.pk, **params})

    def data(self, user=None):
        r = self.summary(user)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()


class ProblemListTests(SummaryBase):
    def test_add_and_list(self):
        p = self.problem()
        self.assertEqual(p["code"], "E11.9")
        self.assertEqual(p["status"], "active")
        self.problem(description="Hypertension", code="I10", status="chronic")
        r = self.as_(self.nurse).get(PROBLEMS, {"patient": self.patient.pk}).json()
        self.assertEqual([x["description"] for x in r["results"]], ["Type 2 diabetes", "Hypertension"])  # active before chronic
        self.assertEqual(r["counts"], {"active": 1, "chronic": 1, "resolved": 0})

    def test_the_same_code_is_not_listed_twice_while_open(self):
        self.problem()
        r = self.as_(self.doctor).post(PROBLEMS, {"patient": self.patient.pk, "description": "Diabetes again", "code": "E11.9"}, format="json")
        self.assertEqual(r.status_code, 409)
        # without a code there is nothing to compare, so free text may repeat
        self.problem(description="Fatigue", code="")
        self.problem(description="Fatigue", code="")

    def test_a_resolved_problem_can_come_back(self):
        p = self.problem()
        r = self.as_(self.doctor).patch(PROBLEM.format(p["id"]), {"status": "resolved"}, format="json")
        self.assertEqual(r.json()["resolved_date"], date.today().isoformat())
        self.problem()  # same code again is fine once the first is resolved
        back = self.as_(self.doctor).patch(PROBLEM.format(p["id"]), {"status": "active"}, format="json")
        self.assertEqual(back.status_code, 409)  # ... but two open entries of one code are not
        other = ProblemListEntry.objects.filter(patient=self.patient, status="active").first()
        self.as_(self.doctor).patch(PROBLEM.format(other.pk), {"status": "entered_in_error"}, format="json")
        back = self.as_(self.doctor).patch(PROBLEM.format(p["id"]), {"status": "chronic"}, format="json")
        self.assertEqual(back.status_code, 200, back.content)
        self.assertIsNone(back.json()["resolved_date"])

    def test_show_filter(self):
        a = self.problem()
        self.problem(description="Asthma", code="J45.909")
        self.as_(self.doctor).patch(PROBLEM.format(a["id"]), {"status": "resolved"}, format="json")
        names = lambda show: [x["description"] for x in self.as_(self.doctor).get(PROBLEMS, {"patient": self.patient.pk, "show": show}).json()["results"]]  # noqa: E731
        self.assertEqual(names("open"), ["Asthma"])
        self.assertEqual(names("resolved"), ["Type 2 diabetes"])
        self.assertEqual(sorted(names("all")), ["Asthma", "Type 2 diabetes"])
        self.assertEqual(self.as_(self.doctor).get(PROBLEMS, {"patient": self.patient.pk, "show": "nope"}).status_code, 400)

    def test_entered_in_error_is_locked_and_not_deleted(self):
        p = self.problem()
        self.as_(self.doctor).patch(PROBLEM.format(p["id"]), {"status": "entered_in_error"}, format="json")
        r = self.as_(self.doctor).patch(PROBLEM.format(p["id"]), {"description": "x"}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(ProblemListEntry.objects.filter(pk=p["id"]).exists())
        self.assertEqual(self.as_(self.doctor).get(PROBLEMS, {"patient": self.patient.pk, "show": "all"}).json()["results"][0]["status"], "entered_in_error")

    def test_validation(self):
        c = self.as_(self.doctor)
        base = {"patient": self.patient.pk}
        self.assertEqual(c.post(PROBLEMS, {**base, "description": "  "}, format="json").status_code, 400)
        self.assertEqual(c.post(PROBLEMS, {**base, "description": "X", "status": "entered_in_error"}, format="json").status_code, 400)
        self.assertEqual(c.post(PROBLEMS, {**base, "description": "X", "onset_date": "soon"}, format="json").status_code, 400)
        self.assertEqual(c.post(PROBLEMS, {**base, "description": "X", "onset_date": str(date.today() + timedelta(days=3))}, format="json").status_code, 400)
        self.assertEqual(c.post(PROBLEMS, {"description": "X"}, format="json").status_code, 404)
        p = self.problem()
        self.assertEqual(c.patch(PROBLEM.format(p["id"]), {"description": ""}, format="json").status_code, 400)
        self.assertEqual(c.patch(PROBLEM.format(p["id"]), {"status": "bogus"}, format="json").status_code, 400)
        self.assertEqual(c.patch(PROBLEM.format(p["id"]), {"onset_date": "x"}, format="json").status_code, 400)
        self.assertEqual(c.patch(PROBLEM.format(99999), {"note": "x"}, format="json").status_code, 404)

    def test_who_may_use_it(self):
        self.assertEqual(self.as_(self.registrar).get(PROBLEMS, {"patient": self.patient.pk}).status_code, 403)
        self.assertEqual(self.as_(self.registrar).post(PROBLEMS, {"patient": self.patient.pk, "description": "X"}, format="json").status_code, 403)
        self.assertEqual(self.as_(self.outsider).get(PROBLEMS, {"patient": self.patient.pk}).status_code, 404)
        p = self.problem()
        self.assertEqual(self.as_(self.outsider).patch(PROBLEM.format(p["id"]), {"note": "x"}, format="json").status_code, 404)
        self.assertEqual(self.as_(self.registrar).patch(PROBLEM.format(p["id"]), {"note": "x"}, format="json").status_code, 403)
        self.assertEqual(self.as_(self.sysadmin).get(PROBLEMS, {"patient": self.patient.pk}).status_code, 200)
        self.assertEqual(self.client.get(PROBLEMS, {"patient": self.patient.pk}).status_code, 401)
        self.assertEqual(self.as_(self.nurse).post(PROBLEMS, {"patient": self.patient.pk, "description": "Nurse-entered"}, format="json").status_code, 201)

    def test_edit_fields(self):
        p = self.problem()
        r = self.as_(self.nurse).patch(PROBLEM.format(p["id"]), {"description": "T2DM", "code": "e11.65", "note": "A1c 8.1", "onset_date": "2020-01-05"}, format="json").json()
        self.assertEqual((r["description"], r["code"], r["note"], r["onset_date"]), ("T2DM", "E11.65", "A1c 8.1", "2020-01-05"))


class FishboneTests(SummaryBase):
    def cells(self):
        return {p["key"]: {c["key"]: c for c in p["cells"]} for p in fishbone.panels_for(self.patient)}

    def test_matches_by_name_and_loinc_and_picks_the_newest(self):
        self.report([("Sodium, Serum", 141), ("Potassium", "4.1"), ("Chloride", 104), ("CO2, Total", 24),
                     ("Urea Nitrogen, Blood", 14), ("Creatinine", "0.9"), ("Glucose", 98)], days_ago=3)
        self.report([("Sodium", 133, {"ref_low": Decimal("135"), "ref_high": Decimal("145")}),
                     ("Whatever", 5, {"loinc_code": "2823-3"})], days_ago=0)
        bmp = self.cells()["bmp"]
        self.assertEqual(bmp["na"]["value"], "133")
        self.assertEqual(bmp["na"]["flag"], "L")  # worked out from the range
        self.assertEqual(bmp["na"]["trend"], "down")
        self.assertEqual(bmp["na"]["previous"]["value"], "141")
        self.assertEqual(bmp["k"]["value"], "5")  # found by its LOINC code, not its name
        self.assertEqual(bmp["k"]["trend"], "up")
        self.assertEqual(bmp["cl"]["trend"], "")  # only one result: nothing to compare
        self.assertIsNone(bmp["cl"]["previous"])
        for key in ("co2", "bun", "cr", "glu"):
            self.assertIsNotNone(bmp[key]["value"], key)

    def test_the_flag_the_lab_sent_wins(self):
        self.report([("Potassium", "6.9", {"abnormal_flag": "HH", "ref_high": Decimal("5.1")})])
        k = self.cells()["bmp"]["k"]
        self.assertEqual(k["flag"], "HH")
        self.assertTrue(k["critical"])

    def test_normal_value_has_no_flag(self):
        self.report([("Hemoglobin", "13.5", {"ref_low": Decimal("12"), "ref_high": Decimal("16")})])
        self.assertEqual(self.cells()["cbc"]["hgb"]["flag"], "")

    def test_a1c_is_not_hemoglobin_and_non_numbers_do_not_break_anything(self):
        self.report([("Hemoglobin A1c", "7.2"), ("Hemoglobin", "Pending"), ("WBC Count", "see comment")])
        cells = self.cells()
        self.assertEqual(cells["other"]["a1c"]["value"], "7.2")
        self.assertEqual(cells["cbc"]["hgb"]["value"], "Pending")
        self.assertEqual(cells["cbc"]["hgb"]["flag"], "")
        self.assertEqual(cells["cbc"]["wbc"]["trend"], "")

    def test_entered_in_error_and_other_patients_are_ignored(self):
        self.report([("Sodium", 150)], days_ago=2)
        self.report([("Sodium", 99)], days_ago=0, status="entered_in_error")
        self.report([("Sodium", 120)], days_ago=0, patient=self.other_patient)
        na = self.cells()["bmp"]["na"]
        self.assertEqual(na["value"], "150")
        self.assertIsNone(na["previous"])

    def test_only_panels_with_values_appear(self):
        self.assertEqual(fishbone.panels_for(self.patient), [])
        self.report([("Platelets", 250)])
        panels = fishbone.panels_for(self.patient)
        self.assertEqual([p["key"] for p in panels], ["cbc"])
        self.assertEqual([c["key"] for c in panels[0]["cells"]], ["wbc", "hgb", "hct", "plt"])  # a fixed order, gaps included
        self.assertIsNone(panels[0]["cells"][0]["value"])

    def test_two_values_in_one_report_are_not_each_others_previous(self):
        self.report([("Sodium", 140), ("Sodium", 141)])
        self.assertIsNone(self.cells()["bmp"]["na"]["previous"])

    def test_pure_helpers(self):
        self.assertEqual(fishbone._norm("Sodium, Serum"), "sodium")
        self.assertEqual(fishbone._norm("WBC Count"), "wbc")
        self.assertEqual(fishbone._norm("Hemoglobin A1c"), "hemoglobin a1c")


class SummaryTests(SummaryBase):
    def test_empty_patient_gets_every_card(self):
        d = self.data()
        for key in ("header", "problems", "medications", "results", "vitals", "orders", "tasks", "notes_referrals", "upcoming"):
            self.assertIn(key, d)
            self.assertNotIn("error", d[key] or {}, key)
        self.assertEqual(d["header"]["name"], "Bcs, Test")
        self.assertEqual(d["header"]["sex"], "Male")
        self.assertEqual(d["header"]["attending"], "Dr. Jeffrey Lee")
        self.assertEqual(d["header"]["allergies"]["emphasis"], "warn")  # nothing documented
        self.assertEqual(d["problems"]["items"], [])
        self.assertEqual(d["medications"]["home_count"], 0)
        self.assertFalse(d["medications"]["needs_reconciliation"])
        self.assertEqual(d["results"], {"hidden": False, "recent": [], "unreviewed": 0, "fishbone": []})
        self.assertEqual(d["vitals"], {"latest": {}, "series": {}})
        self.assertEqual(d["orders"]["count"], 0)
        self.assertEqual(d["tasks"]["count"], 0)
        self.assertEqual(d["upcoming"], {"items": []})

    def test_who_may_open_it_and_that_reading_changes_nothing(self):
        before = Appointment.objects.count()
        self.assertEqual(self.summary(self.registrar).status_code, 403)
        self.assertEqual(self.summary(self.outsider).status_code, 404)
        self.assertEqual(self.summary(self.sysadmin).status_code, 200)
        self.assertEqual(self.summary(self.nurse).status_code, 200)
        self.assertEqual(self.summary(self.admin).status_code, 200)
        self.assertEqual(self.client.get(SUMMARY, {"patient": self.patient.pk}).status_code, 401)
        self.assertEqual(self.as_(self.doctor).get(SUMMARY).status_code, 404)
        self.assertEqual(Appointment.objects.count(), before)

    def test_allergies_and_header(self):
        PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance="Penicillin", reaction="Rash", severity="severe")
        a = self.data()["header"]["allergies"]
        self.assertEqual(a["emphasis"], "alert")
        self.assertEqual(a["items"], [{"substance": "Penicillin", "reaction": "Rash", "severity": "severe"}])

    def test_problems_card_lists_the_list_and_labels_other_sources(self):
        self.problem()
        self.problem(description="Old fracture", code="S52.50", status="resolved")
        self.profile.medical_history = "Appendectomy 2010"
        self.profile.save()
        orderable = Orderable.objects.create(code="ekg", name="EKG", category="procedure")
        appt = Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="V", appointment_datetime=timezone.now())
        ow.create_draft_order(self.doctor, appt, orderable, diagnosis_codes=[{"code": "I10", "description": "Hypertension"}, {"code": "E11.9", "description": "dup"}])
        Referral.objects.create(organization=self.org, patient=self.patient, referring_provider=self.doctor, created_by=self.doctor,
                                specialty="Cardiology", status="sent", diagnosis_code="R07.9", diagnosis_text="Chest pain")
        p = self.data()["problems"]
        self.assertEqual([x["code"] for x in p["items"]], ["E11.9"])
        self.assertEqual(p["resolved_count"], 1)
        self.assertEqual(p["history_text"], "Appendectomy 2010")
        self.assertEqual({(o["code"], o["source"]) for o in p["other_sources"]}, {("I10", "Order: EKG"), ("R07.9", "Referral")})  # E11.9 is already listed

    def test_medications_card(self):
        HomeMedication.objects.create(organization=self.org, patient=self.patient, drug_name="Lisinopril", strength="10 mg", dose="1 tablet", route="PO", frequency="daily", source="patient")
        d = self.data()["medications"]
        self.assertEqual(d["home_count"], 1)
        self.assertEqual(d["home"][0]["sig"], "Take 1 tablet by mouth once daily.")
        self.assertTrue(d["needs_reconciliation"])
        self.assertIsNone(d["last_review"])
        MedReview.objects.create(organization=self.org, patient=self.patient, reviewed_by=self.nurse, snapshot=[])
        HomeMedication.objects.update(reviewed_at=timezone.now())
        d = self.data()["medications"]
        self.assertFalse(d["needs_reconciliation"])
        self.assertEqual(d["last_review"]["by"], _name(self.nurse))
        self.assertTrue(d["last_review"]["at"])

    def test_allergy_alert_counts_on_a_home_medicine(self):
        PatientAllergy.objects.create(organization=self.org, patient=self.patient, substance="Penicillin", severity="severe")
        HomeMedication.objects.create(organization=self.org, patient=self.patient, drug_name="Amoxicillin", source="patient")
        self.assertEqual(self.data()["medications"]["home"][0]["allergy_alerts"], 1)

    def test_prescriptions_only_while_they_still_run(self):
        now = timezone.now()
        common = dict(organization=self.org, patient=self.patient, prescriber=self.doctor, strength="500 mg", form="capsule", dose="1 capsule", route="PO", frequency="tid", quantity="30", days_supply=10, refills=0)
        Prescription.objects.create(drug_name="Running", status="signed", signed_at=now - timedelta(days=2), **common)
        Prescription.objects.create(drug_name="Expired", status="sent", signed_at=now - timedelta(days=200), **common)
        Prescription.objects.create(drug_name="Soon out", status="sent", signed_at=now - timedelta(days=5), **common)
        Prescription.objects.create(drug_name="A draft", status="draft", **common)
        d = self.data()["medications"]
        self.assertEqual({r["drug_name"] for r in d["prescriptions"]}, {"Running", "Soon out"})
        self.assertEqual(d["renewals_due"], 2)  # both run out within the 14-day window
        self.assertEqual(d["drafts"], 1)

    def test_results_card_and_fishbone(self):
        self.report([("Sodium", 141), ("Potassium", "6.8", {"abnormal_flag": "HH"})], title="BMP")
        rep = self.report([("Hemoglobin", 9, {"abnormal_flag": "L"})], title="CBC", days_ago=1)
        rep.review_status = "reviewed"
        rep.save()
        self.report([("Sodium", 1)], status="entered_in_error", title="Wrong")
        r = self.data()["results"]
        self.assertEqual([x["title"] for x in r["recent"]], ["BMP", "CBC"])
        self.assertEqual((r["recent"][0]["abnormal"], r["recent"][0]["critical"]), (1, 1))
        self.assertEqual(r["unreviewed"], 1)
        self.assertEqual([p["key"] for p in r["fishbone"]], ["bmp", "cbc"])

    def test_results_hidden_without_the_right(self):
        self.report([("Sodium", 141)])
        real = __import__("appointments.clinical_summary", fromlist=["x"]).user_has_right
        with mock.patch("appointments.clinical_summary.user_has_right", side_effect=lambda u, c: False if c == "lab_results.view" else real(u, c)):
            d = self.data()
        self.assertEqual(d["results"], {"hidden": True})
        self.assertEqual(d["orders"]["count"], 0)

    def test_orders_hidden_without_the_right(self):
        real = __import__("appointments.clinical_summary", fromlist=["x"]).user_has_right
        with mock.patch("appointments.clinical_summary.user_has_right", side_effect=lambda u, c: False if c == "orders.view" else real(u, c)):
            d = self.data()
        self.assertIsNone(d["orders"])
        self.assertIsNotNone(d["tasks"])

    def make_order(self, name="CBC", category="laboratory", sign=True, **kw):
        orderable = Orderable.objects.create(code=name.lower(), name=name, category=category)
        appt = Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="V", appointment_datetime=timezone.now())
        o = ow.create_draft_order(self.doctor, appt, orderable, **kw)
        if sign:
            ow.sign_order(o, self.doctor)
            o.refresh_from_db()
        return o

    def test_orders_and_tasks_card(self):
        self.make_order("CBC")
        self.make_order("Draft thing", sign=False)
        done = self.make_order("Old")
        done.status = "completed"
        done.save()
        d = self.data()
        self.assertEqual(d["orders"]["count"], 2)
        self.assertEqual({o["name"] for o in d["orders"]["items"]}, {"CBC", "Draft thing"})
        order = self.make_order("Med", category="medication", sign=False)
        now = timezone.now()
        OrderTask.objects.create(organization=self.org, order=order, patient=self.patient, title="Give dose", due_at=now - timedelta(hours=2))
        OrderTask.objects.create(organization=self.org, order=order, patient=self.patient, title="Later", due_at=now + timedelta(hours=2))
        OrderTask.objects.create(organization=self.org, order=order, patient=self.patient, title="PRN pain", due_at=now - timedelta(hours=5), is_prn=True)
        OrderTask.objects.create(organization=self.org, order=order, patient=self.patient, title="Done", due_at=now - timedelta(hours=1), status="done")
        t = self.data()["tasks"]
        self.assertEqual(t["count"], 3)
        self.assertEqual(t["overdue"], 1)  # a PRN is never overdue
        by = {x["title"]: x for x in t["items"]}
        self.assertTrue(by["Give dose"]["overdue"])
        self.assertFalse(by["PRN pain"]["overdue"])
        self.assertEqual(t["items"][0]["title"], "PRN pain")  # soonest due first

    def test_notes_referrals_and_upcoming(self):
        appt = Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="Visit", appointment_datetime=timezone.now())
        ClinicalNote.objects.create(organization=self.org, appointment=appt, patient=self.patient, author=self.doctor, note_type="doctor_assessment", status="signed", signed_at=timezone.now())
        Referral.objects.create(organization=self.org, patient=self.patient, referring_provider=self.doctor, created_by=self.doctor, specialty="Cardiology", status="sent")
        Referral.objects.create(organization=self.org, patient=self.patient, referring_provider=self.doctor, created_by=self.doctor, specialty="Draftology", status="draft")
        Referral.objects.create(organization=self.org, patient=self.patient, referring_provider=self.doctor, created_by=self.doctor, specialty="Closed", status="closed")
        Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="Follow-up", appointment_datetime=timezone.now() + timedelta(days=3))
        Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="Cancelled", appointment_datetime=timezone.now() + timedelta(days=4), status="cancelled")
        Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="Request", appointment_datetime=timezone.now() + timedelta(days=5), status="pending")
        d = self.data()
        self.assertEqual([n["type"] for n in d["notes_referrals"]["notes"]], ["Doctor Assessment"])
        self.assertEqual(d["notes_referrals"]["notes"][0]["author"], _name(self.doctor))
        self.assertEqual([r["specialty"] for r in d["notes_referrals"]["referrals"]], ["Cardiology"])
        self.assertEqual([a["title"] for a in d["upcoming"]["items"]], ["Follow-up", "Request"])

    def test_vitals_latest_and_trend_series(self):
        template, _ = FlowsheetTemplate.objects.get_or_create(code="vital_signs", defaults={"name": "Vital Signs"})
        appt = Appointment.objects.create(organization=self.org, patient=self.patient, provider=self.doctor, title="V", appointment_datetime=timezone.now())
        now = timezone.now()
        columns, data = [], {"heart_rate": {}, "bp_systolic": {}, "bp_diastolic": {}, "spo2": {}, "temperature_f": {}}
        for n in range(10):
            cid = f"col_{n}"
            columns.append({"id": cid, "timestamp": (now - timedelta(hours=10 - n)).isoformat()})
            data["heart_rate"][cid] = str(70 + n)
            data["spo2"][cid] = "96"
        data["bp_systolic"]["col_9"] = "128"
        data["bp_diastolic"]["col_9"] = "82"
        data["temperature_f"]["col_9"] = "n/a"  # junk is skipped
        VitalSignsFlowsheet.objects.create(organization=self.org, template=template, appointment=appt, patient=self.patient, columns=columns, data=data)
        v = self.data()["vitals"]
        self.assertEqual(v["latest"]["hr"]["value"], 79.0)
        self.assertEqual(v["latest"]["hr"]["unit"], "bpm")
        self.assertEqual((v["latest"]["sbp"]["value"], v["latest"]["dbp"]["value"]), (128.0, 82.0))
        self.assertNotIn("temp", v["latest"])
        self.assertEqual(len(v["series"]["hr"]), 8)  # the last eight readings
        self.assertEqual([p["value"] for p in v["series"]["hr"]][-3:], [77.0, 78.0, 79.0])

    def test_one_broken_card_does_not_blank_the_others(self):
        self.problem()
        with mock.patch("appointments.clinical_summary._vitals", side_effect=RuntimeError("boom")):
            d = self.data()
        self.assertEqual(d["vitals"], {"error": "Could not load this section."})
        self.assertEqual(len(d["problems"]["items"]), 1)
        self.assertEqual(d["header"]["name"], "Bcs, Test")

    def test_a_database_error_in_one_card_leaves_the_rest_working(self):
        from django.db import DatabaseError

        with mock.patch("appointments.clinical_summary._upcoming", side_effect=DatabaseError("nope")):
            d = self.data()
        self.assertIn("error", d["upcoming"])
        self.assertIn("items", d["problems"])

    def test_orders_card_failure_is_reported_for_both_cards(self):
        with mock.patch("appointments.clinical_summary._orders_and_tasks", side_effect=RuntimeError("boom")):
            d = self.data()
        self.assertIn("error", d["orders"])
        self.assertIn("error", d["tasks"])
        self.assertEqual(d["header"]["name"], "Bcs, Test")
