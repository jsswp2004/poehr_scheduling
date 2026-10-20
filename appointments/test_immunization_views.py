import datetime as dt

from django.utils import timezone
from rest_framework.test import APIClient
from django.test import TestCase

from users.models import CustomUser, Organization, Patient

from .immunization_schedule_loader import load_schedule
from .models import ImmunizationEvent, LookupEntry, PatientImmunization, PatientSchedule, ProblemListEntry, VaccineProduct


def schedule_doc(name="Age", risk=False, triggers=None):
    return {
        "schedule": {"name": name, "population": "adult", "is_risk_group": risk, "source": "test", "edition": "1", "triggers": triggers or []},
        "items": [{"code": "td", "name": "Td or Tdap", "cvx": ["115", "09"]}, {"code": "rzv", "name": "Zoster", "cvx": ["187"]}],
        "rules": [{"item": "td", "min_age_months": 228, "recurrence_months": 120},
                  {"item": "rzv", "min_age_months": 600, "dose_count": 2, "dose_min_intervals_days": [0, 60]}],
    }


class ApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="A")
        self.other = Organization.objects.create(name="B")
        for code, name in (("115", "Tdap"), ("09", "Td"), ("187", "Shingrix")):
            VaccineProduct.objects.create(cvx_code=code, short_name=name)
        self.nurse = self.user("nurse1", "nurse", self.org)
        self.doctor = self.user("doc1", "doctor", self.org)
        self.front = self.user("front1", "registrar", self.org)
        self.stranger_nurse = self.user("nurse2", "nurse", self.other)
        self.patient = self.user("p1", "patient", self.org, dob=dt.date(1960, 3, 5), sex="F")
        self.age = load_schedule(schedule_doc())["schedule"]
        self.age.status = "approved"
        self.age.save()
        self.client = APIClient()
        self.client.force_authenticate(self.nurse)

    def user(self, username, role, org, dob=None, sex=""):
        u = CustomUser.objects.create_user(username=username, password="x", role=role, organization=org)
        if dob:
            profile, _ = Patient.objects.get_or_create(user=u)
            profile.date_of_birth, profile.legal_sex, profile.organization = dob, sex, org
            profile.save()
        return CustomUser.objects.get(pk=u.pk)

    def url(self, tail=""):
        return f"/api/vaccine-manager/patient/{self.patient.pk}/{tail}"

    def test_summary_lists_what_is_due(self):
        r = self.client.get(self.url())
        self.assertEqual(r.status_code, 200)
        by = {x["item"]: x for x in r.json()["recommendations"]}
        self.assertEqual(by["td"]["status"], "due")
        self.assertEqual(by["td"]["status_label"], "Due now")
        self.assertEqual(r.json()["schedule"]["name"], "Age")
        self.assertTrue(r.json()["can_record"])

    def test_rights_are_enforced(self):
        self.client.force_authenticate(self.front)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.client.force_authenticate(self.patient)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url()).status_code, (401, 403))

    def test_other_clinics_patient_is_not_found(self):
        self.client.force_authenticate(self.stranger_nurse)
        self.assertEqual(self.client.get(self.url()).status_code, 404)
        self.assertEqual(self.client.post(self.url("doses/"), {"item": "td", "given_on": "2026-01-01"}, format="json").status_code, 404)

    def test_record_dose_then_it_is_done_and_audited(self):
        r = self.client.post(self.url("doses/"), {"item": "td", "product": "115", "given_on": "2026-10-01", "lot_number": " A1 "}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual({x["item"]: x["status"] for x in body["recommendations"]}["td"], "done")
        self.assertEqual(body["saved"][0]["lot_number"], "A1")
        self.assertEqual(ImmunizationEvent.objects.filter(action="recorded").count(), 1)

    def test_several_doses_at_one_visit_are_all_or_nothing(self):
        good = {"item": "td", "given_on": "2026-10-01"}
        bad = {"item": "rzv", "given_on": "2999-01-01"}
        r = self.client.post(self.url("doses/"), {"doses": [good, bad]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(PatientImmunization.all_objects.count(), 0)
        r = self.client.post(self.url("doses/"), {"doses": [good, {"item": "rzv", "given_on": "2026-10-01"}]}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(PatientImmunization.all_objects.count(), 2)

    def test_dose_validation(self):
        post = lambda d: self.client.post(self.url("doses/"), d, format="json")
        self.assertEqual(post({"item": "nope", "given_on": "2026-01-01"}).status_code, 400)
        self.assertEqual(post({"item": "td"}).status_code, 400)
        self.assertEqual(post({"item": "td", "given_on": "1950-01-01"}).status_code, 400)  # before birth
        self.assertEqual(post({"item": "td", "given_on": "2026-01-01", "product": "187"}).status_code, 400)  # wrong product
        self.assertEqual(post({"item": "td", "given_on": "2026-01-01", "expiration_date": "2025-12-31"}).status_code, 400)
        self.assertEqual(post({"item": "td", "given_on": "2026-01-01", "manufacturer": 99999}).status_code, 400)
        self.assertEqual(post({"item": "td", "given_on": "2026-01-01", "given_time": "noon"}).status_code, 400)

    def test_duplicate_dose_same_day_is_refused(self):
        d = {"item": "td", "given_on": "2026-01-01", "dose_number": 1}
        self.assertEqual(self.client.post(self.url("doses/"), d, format="json").status_code, 201)
        self.assertEqual(self.client.post(self.url("doses/"), d, format="json").status_code, 400)

    def test_manufacturer_must_come_from_the_manufacturer_dictionary(self):
        wrong = LookupEntry.objects.create(dictionary="lot_source", name="Stock")
        right = LookupEntry.objects.create(dictionary="manufacturer", name="Pfizer")
        base = {"item": "td", "given_on": "2026-01-01"}
        self.assertEqual(self.client.post(self.url("doses/"), {**base, "manufacturer": wrong.pk}, format="json").status_code, 400)
        r = self.client.post(self.url("doses/"), {**base, "manufacturer": right.pk}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["saved"][0]["manufacturer"], "Pfizer")

    def test_not_done_suppresses_and_validates(self):
        post = lambda d: self.client.post(self.url("not-done/"), d, format="json")
        self.assertEqual(post({"item": "td", "reason": "bogus"}).status_code, 400)
        self.assertEqual(post({"item": "td", "reason": "declined", "offer_again_on": "2020-01-01"}).status_code, 400)
        future = (timezone.localdate() + dt.timedelta(days=90)).isoformat()
        r = post({"item": "td", "reason": "declined", "offer_again_on": future, "notes": "Wants to wait"})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual({x["item"]: x["status"] for x in r.json()["recommendations"]}["td"], "not_done")

    def test_void_needs_a_reason_and_restores_the_recommendation(self):
        rec = self.client.post(self.url("doses/"), {"item": "td", "given_on": "2026-10-01"}, format="json").json()["saved"][0]
        void = f"/api/vaccine-manager/doses/{rec['id']}/void/"
        self.assertEqual(self.client.post(void, {}, format="json").status_code, 400)
        r = self.client.post(void, {"reason": "Wrong patient"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual({x["item"]: x["status"] for x in r.json()["recommendations"]}["td"], "due")
        self.assertEqual(self.client.post(void, {"reason": "again"}, format="json").status_code, 400)
        self.assertTrue(ImmunizationEvent.objects.filter(action="entered_in_error").exists())
        self.client.force_authenticate(self.stranger_nurse)
        self.assertEqual(self.client.post(void, {"reason": "x"}, format="json").status_code, 404)

    def test_risk_schedule_suggest_confirm_and_end(self):
        risk = load_schedule(schedule_doc("Risk", risk=True, triggers=[{"code_prefix": "E11"}]))["schedule"]
        risk.status = "approved"
        risk.save()
        problem = ProblemListEntry.objects.create(organization=self.org, patient=self.patient, description="T2DM", code="E11.9", status="active")
        s = self.client.get(self.url()).json()["suggestions"]
        self.assertEqual([x["schedule"] for x in s], [risk.pk])
        r = self.client.post(self.url("risk-schedules/"), {"schedule": risk.pk, "problem": problem.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["suggestions"], [])
        self.assertEqual(body["risk_schedules"][0]["status"], "active")
        self.assertEqual(self.client.post(self.url("risk-schedules/"), {"schedule": risk.pk}, format="json").status_code, 400)
        ps = body["risk_schedules"][0]["id"]
        r = self.client.post(self.url(f"risk-schedules/{ps}/"), {"action": "end"}, format="json")
        self.assertEqual(r.json()["risk_schedules"], [])
        self.assertEqual(PatientSchedule.all_objects.get(pk=ps).status, "ended")

    def test_dismissed_suggestion_stays_dismissed(self):
        risk = load_schedule(schedule_doc("Risk", risk=True, triggers=[{"code_prefix": "E11"}]))["schedule"]
        risk.status = "approved"
        risk.save()
        ProblemListEntry.objects.create(organization=self.org, patient=self.patient, description="T2DM", code="E11.9", status="active")
        r = self.client.post(self.url("risk-schedules/dismiss/"), {"schedule": risk.pk, "reason": "not diabetic"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["suggestions"], [])

    def test_draft_risk_schedule_cannot_be_assigned(self):
        draft = load_schedule(schedule_doc("Draft risk", risk=True, triggers=[{"code_prefix": "E11"}]))["schedule"]
        self.assertEqual(self.client.post(self.url("risk-schedules/"), {"schedule": draft.pk}, format="json").status_code, 400)

    def test_catalog(self):
        LookupEntry.objects.create(dictionary="manufacturer", name="Pfizer")
        r = self.client.get("/api/vaccine-manager/catalog/")
        self.assertEqual(r.status_code, 200)
        codes = [i["code"] for i in r.json()["items"]]
        self.assertIn("td", codes)
        self.assertIn("manufacturer", r.json()["lookups"])
        self.assertIn("declined", [x["value"] for x in r.json()["reasons"]])

    def test_patient_without_birth_date_explains_itself(self):
        nodob = self.user("p2", "patient", self.org)
        r = self.client.get(f"/api/vaccine-manager/patient/{nodob.pk}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["problem"], "no_dob")
        self.assertTrue(r.json()["problem_text"])
