import datetime as dt

from django.test import TestCase

from users.models import CustomUser, Organization, Patient

from . import immunization_service as svc
from .immunization_schedule_loader import load_schedule
from .models import (
    ImmunizationItem,
    ImmunizationRule,
    ImmunizationSchedule,
    PatientImmunization,
    PatientSchedule,
    ProblemListEntry,
    VaccineProduct,
)

TODAY = dt.date(2026, 10, 19)


def doc(name="Age", population="adult", risk=False, triggers=None, rules=None, items=None):
    return {
        "schedule": {"name": name, "population": population, "is_risk_group": risk, "source": "test", "edition": "1",
                     "triggers": triggers or []},
        "items": items or [{"code": "td", "name": "Td or Tdap", "cvx": ["115"]}],
        "rules": rules or [{"item": "td", "min_age_months": 228, "recurrence_months": 120}],
    }


class ServiceTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other = Organization.objects.create(name="Clinic B")
        VaccineProduct.objects.create(cvx_code="115", short_name="Tdap")
        self.patient = self.make_patient(self.org, "pat1", dt.date(1990, 1, 1), "F")

    def make_patient(self, org, username, dob, sex):
        user = CustomUser.objects.create_user(username=username, password="x", role="patient", organization=org)
        profile, _ = Patient.objects.get_or_create(user=user)
        profile.date_of_birth, profile.legal_sex, profile.organization = dob, sex, org
        profile.save()
        return CustomUser.objects.get(pk=user.pk)

    def approve(self, name="Age", **kw):
        s = load_schedule(doc(name=name, **kw))["schedule"]
        s.status = "approved"
        s.save()
        return s

    def test_draft_schedule_is_not_used(self):
        load_schedule(doc())
        out = svc.recommend_for_patient(self.patient, self.org, TODAY)
        self.assertEqual(out["problem"], "no_schedule")
        self.assertEqual(out["recommendations"], [])

    def test_approved_age_schedule_recommends(self):
        self.approve()
        out = svc.recommend_for_patient(self.patient, self.org, TODAY)
        self.assertEqual([r.item_code for r in out["recommendations"]], ["td"])
        self.assertEqual(out["recommendations"][0].status, "due")

    def test_missing_birth_date_is_reported_not_guessed(self):
        Patient.objects.filter(user=self.patient).update(date_of_birth=None)
        self.patient = CustomUser.objects.get(pk=self.patient.pk)
        self.assertEqual(svc.recommend_for_patient(self.patient, self.org, TODAY)["problem"], "no_dob")

    def test_two_approved_schedules_in_one_tier_clash(self):
        self.approve("One")
        self.approve("Two")
        out = svc.recommend_for_patient(self.patient, self.org, TODAY)
        self.assertEqual(out["problem"], "schedule_clash")
        self.assertEqual(sorted(s.name for s in out["clash"]), ["One", "Two"])
        self.assertEqual(out["recommendations"], [])

    def test_clinic_schedule_takes_the_place_of_the_shared_one(self):
        self.approve("Shared")
        own = self.approve("Own")
        own.organization = self.org
        own.save()
        out = svc.recommend_for_patient(self.patient, self.org, TODAY)
        self.assertEqual(out["age_schedule"].name, "Own")

    def test_other_clinics_schedule_is_not_visible(self):
        s = self.approve("Theirs")
        s.organization = self.other
        s.save()
        self.assertEqual(svc.recommend_for_patient(self.patient, self.org, TODAY)["problem"], "no_schedule")

    def test_child_gets_child_schedule_only(self):
        self.approve("Adult")
        kid = self.make_patient(self.org, "kid", dt.date(2020, 1, 1), "M")
        self.assertEqual(svc.recommend_for_patient(kid, self.org, TODAY)["problem"], "no_schedule")

    def test_risk_rule_replaces_age_rule_and_is_only_used_when_assigned(self):
        self.approve()
        risk = self.approve("Risk", risk=True, triggers=[{"code_prefix": "E11"}], rules=[
            {"item": "td", "min_age_months": 228, "review_reason": "special"}])
        out = svc.recommend_for_patient(self.patient, self.org, TODAY)
        self.assertEqual(out["recommendations"][0].status, "due")
        PatientSchedule.all_objects.create(organization=self.org, patient=self.patient, schedule=risk, status="active")
        out = svc.recommend_for_patient(self.patient, self.org, TODAY)
        self.assertEqual(out["recommendations"][0].status, "review")

    def test_suggestion_comes_from_problem_list_and_stops_once_handled(self):
        self.approve()
        risk = self.approve("Risk", risk=True, triggers=[{"code_prefix": "E11"}])
        ProblemListEntry.objects.create(organization=self.org, patient=self.patient, description="T2DM", code="E11.9", status="active")
        ProblemListEntry.objects.create(organization=self.org, patient=self.patient, description="old", code="E11.65", status="resolved")
        out = svc.recommend_for_patient(self.patient, self.org, TODAY)
        self.assertEqual([s["schedule"].pk for s in out["suggestions"]], [risk.pk])
        PatientSchedule.all_objects.create(organization=self.org, patient=self.patient, schedule=risk, status="dismissed")
        self.assertEqual(svc.recommend_for_patient(self.patient, self.org, TODAY)["suggestions"], [])

    def test_resolved_problem_does_not_suggest(self):
        self.approve()
        self.approve("Risk", risk=True, triggers=[{"code_prefix": "E11"}])
        ProblemListEntry.objects.create(organization=self.org, patient=self.patient, description="x", code="E11.9", status="resolved")
        self.assertEqual(svc.recommend_for_patient(self.patient, self.org, TODAY)["suggestions"], [])

    def test_records_count_and_voided_records_do_not(self):
        self.approve()
        item = ImmunizationItem.objects.get(code="td")
        rec = PatientImmunization.all_objects.create(organization=self.org, patient=self.patient, item=item, status="done", given_on=dt.date(2024, 1, 1))
        self.assertEqual(svc.recommend_for_patient(self.patient, self.org, TODAY)["recommendations"][0].status, "done")
        rec.status = "entered_in_error"
        rec.save()
        self.assertEqual(svc.recommend_for_patient(self.patient, self.org, TODAY)["recommendations"][0].status, "due")

    def test_another_clinics_records_are_ignored(self):
        self.approve()
        item = ImmunizationItem.objects.get(code="td")
        PatientImmunization.all_objects.create(organization=self.other, patient=self.patient, item=item, status="done", given_on=dt.date(2024, 1, 1))
        self.assertEqual(svc.recommend_for_patient(self.patient, self.org, TODAY)["recommendations"][0].status, "due")
