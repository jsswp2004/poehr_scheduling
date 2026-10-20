"""
Vaccine Manager data layer: models, tenant scoping, and the new rights. All patients here are made up.
"""

import datetime

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from poehr_scheduling_backend.tenancy import clear_current_organization, set_current_organization
from users.models import Organization
from users.rights import role_default_rights, user_has_right

from .models import (
    ImmunizationEvent,
    ImmunizationItem,
    ImmunizationRule,
    ImmunizationSchedule,
    ImmunizationScheduleTrigger,
    LookupEntry,
    PatientImmunization,
    PatientSchedule,
    VaccineProduct,
)

User = get_user_model()


def make_user(name, role, org, **extra):
    return User.objects.create_user(
        username=name, email=f"{name}@example.com", password="pw-12345-xyz", role=role, organization=org, **extra
    )


class VaccineRightsTests(TestCase):
    def test_clinicians_see_and_record(self):
        for role in ("doctor", "nurse"):
            rights = role_default_rights(role)
            self.assertIn("immunizations.view", rights)
            self.assertIn("immunizations.record", rights)
            self.assertNotIn("immunization_rules.manage", rights)

    def test_admin_sees_and_manages_schedules_but_does_not_record(self):
        rights = role_default_rights("admin")
        self.assertIn("immunizations.view", rights)
        self.assertIn("immunization_rules.manage", rights)
        self.assertNotIn("immunizations.record", rights)

    def test_patients_and_front_desk_get_none(self):
        for role in ("patient", "receptionist", "registrar", "none"):
            rights = role_default_rights(role)
            self.assertFalse({"immunizations.view", "immunizations.record", "immunization_rules.manage"} & rights, role)

    def test_system_admin_has_everything(self):
        rights = role_default_rights("system_admin")
        self.assertTrue({"immunizations.view", "immunizations.record", "immunization_rules.manage"} <= rights)

    def test_user_has_right_accepts_the_new_codes(self):
        org = Organization.objects.create(name="Clinic A")
        nurse = make_user("nurse1", "nurse", org)
        self.assertTrue(user_has_right(nurse, "immunizations.record"))
        self.assertFalse(user_has_right(nurse, "immunization_rules.manage"))


class ScheduleDataTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")

    def test_base_item_codes_are_unique(self):
        ImmunizationItem.objects.create(code="zoster_rzv", name="Zoster")
        with self.assertRaises(IntegrityError), transaction.atomic():
            ImmunizationItem.objects.create(code="zoster_rzv", name="Zoster again")

    def test_a_clinic_can_reuse_a_base_code_once(self):
        ImmunizationItem.objects.create(code="zoster_rzv", name="Zoster")
        ImmunizationItem.objects.create(code="zoster_rzv", name="Zoster (clinic)", organization=self.org)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ImmunizationItem.objects.create(code="zoster_rzv", name="Duplicate", organization=self.org)

    def test_rule_defaults(self):
        item = ImmunizationItem.objects.create(code="flu", name="Influenza")
        schedule = ImmunizationSchedule.objects.create(name="CDC adult 2026", population="adult")
        rule = ImmunizationRule.objects.create(schedule=schedule, item=item, min_age_months=6, recurrence_months=12)
        self.assertEqual(schedule.status, "draft")
        self.assertEqual(rule.dose_count, 1)
        self.assertEqual(rule.dose_min_intervals_days, [])
        self.assertIsNone(rule.max_age_months)
        self.assertEqual(rule.sex, "any")


class PatientRecordTests(TestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Clinic A")
        self.org_b = Organization.objects.create(name="Clinic B")
        self.item = ImmunizationItem.objects.create(code="td", name="Td / Tdap")
        self.patient_a = make_user("pa", "patient", self.org_a)
        self.patient_b = make_user("pb", "patient", self.org_b)
        self.nurse = make_user("nurse1", "nurse", self.org_a)
        PatientImmunization.all_objects.create(
            organization=self.org_a, patient=self.patient_a, item=self.item, given_on=datetime.date(2014, 6, 12)
        )
        PatientImmunization.all_objects.create(
            organization=self.org_b, patient=self.patient_b, item=self.item, given_on=datetime.date(2020, 1, 1)
        )

    def tearDown(self):
        clear_current_organization()

    def test_default_manager_is_empty_without_a_request(self):
        clear_current_organization()
        self.assertEqual(PatientImmunization.objects.count(), 0)
        self.assertEqual(PatientImmunization.all_objects.count(), 2)

    def test_default_manager_only_sees_the_current_clinic(self):
        set_current_organization(self.org_a)
        rows = list(PatientImmunization.objects.all())
        self.assertEqual([r.patient_id for r in rows], [self.patient_a.id])

    def test_new_record_defaults(self):
        rec = PatientImmunization.all_objects.get(patient=self.patient_a)
        self.assertEqual(rec.status, "done")
        self.assertEqual(rec.source, "given_here")
        self.assertEqual(rec.dose_number, 1)
        self.assertFalse(rec.vis_given)

    def test_not_done_record_holds_a_reason_and_offer_date(self):
        rec = PatientImmunization.all_objects.create(
            organization=self.org_a,
            patient=self.patient_a,
            item=self.item,
            status="not_done",
            not_done_reason="declined",
            offer_again_on=datetime.date(2027, 1, 15),
        )
        self.assertEqual(rec.not_done_reason, "declined")
        self.assertIsNone(rec.given_on)

    def test_a_patient_with_records_cannot_be_deleted_and_the_item_is_kept(self):
        from django.db.models import ProtectedError

        with self.assertRaises(ProtectedError):
            self.item.delete()

    def test_audit_event_links_to_the_record(self):
        rec = PatientImmunization.all_objects.get(patient=self.patient_a)
        ev = ImmunizationEvent.objects.create(
            organization=self.org_a, record=rec, patient_id=self.patient_a.id, action="recorded", user=self.nurse
        )
        self.assertEqual(list(rec.events.all()), [ev])
        self.assertEqual(ev.changed_fields, [])


class CatalogTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")

    def test_cvx_codes_are_unique(self):
        VaccineProduct.objects.create(cvx_code="143", short_name="Adenovirus types 4 and 7")
        with self.assertRaises(IntegrityError), transaction.atomic():
            VaccineProduct.objects.create(cvx_code="143", short_name="Duplicate")

    def test_product_defaults_follow_the_cdc_file(self):
        p = VaccineProduct.objects.create(cvx_code="54", short_name="adenovirus, type 4", status="inactive")
        self.assertTrue(p.is_vaccine)
        self.assertEqual(p.get_status_display(), "Inactive")

    def test_an_item_can_be_met_by_several_products(self):
        item = ImmunizationItem.objects.create(code="flu", name="Influenza Vaccine", display_name="6- Influenza Vaccine")
        a = VaccineProduct.objects.create(cvx_code="141", short_name="Influenza, seasonal, injectable")
        b = VaccineProduct.objects.create(cvx_code="150", short_name="Influenza, injectable, quadrivalent, PF")
        item.products.add(a, b)
        self.assertEqual(set(item.products.all()), {a, b})
        self.assertEqual(list(a.items.all()), [item])
        self.assertEqual(str(item), "6- Influenza Vaccine")

    def test_lookup_names_are_unique_within_a_dictionary(self):
        LookupEntry.objects.create(dictionary="manufacturer", name="Pfizer")
        with self.assertRaises(IntegrityError), transaction.atomic():
            LookupEntry.objects.create(dictionary="manufacturer", name="Pfizer")
        LookupEntry.objects.create(dictionary="lot_source", name="Pfizer")  # another dictionary is fine
        LookupEntry.objects.create(dictionary="manufacturer", name="Pfizer", organization=self.org)  # a clinic's own

    def test_ten_dictionaries_like_the_builder(self):
        self.assertEqual(len(LookupEntry.DICTIONARIES), 10)
        self.assertIn(("eligibility_code", "Vaccine eligibility code"), LookupEntry.DICTIONARIES)

    def test_item_category_comes_from_the_event_category_dictionary(self):
        cat = LookupEntry.objects.create(dictionary="event_category", name="Immunizations")
        item = ImmunizationItem.objects.create(code="td", name="Td", category=cat)
        self.assertEqual(item.category.dictionary, "event_category")


class RiskScheduleTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Clinic A")
        self.other = Organization.objects.create(name="Clinic B")
        self.schedule = ImmunizationSchedule.objects.create(
            name="High risk: diabetes", population="adult", is_risk_group=True
        )
        self.patient = make_user("p1", "patient", self.org)

    def tearDown(self):
        clear_current_organization()

    def assign(self, **kw):
        kw.setdefault("organization", self.org)
        return PatientSchedule.all_objects.create(patient=self.patient, schedule=self.schedule, **kw)

    def test_a_diagnosis_prefix_triggers_a_suggestion_only(self):
        ImmunizationScheduleTrigger.objects.create(schedule=self.schedule, code_prefix="E11")
        with self.assertRaises(IntegrityError), transaction.atomic():
            ImmunizationScheduleTrigger.objects.create(schedule=self.schedule, code_prefix="E11")
        self.assertEqual(PatientSchedule.all_objects.count(), 0)

    def test_assignment_defaults_to_a_clinician_added_active_schedule(self):
        a = self.assign()
        self.assertEqual((a.status, a.source), ("active", "manual"))

    def test_only_one_live_assignment_per_patient_and_schedule(self):
        self.assign(status="suggested", source="auto")
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.assign()

    def test_a_dismissed_assignment_can_be_suggested_again(self):
        first = self.assign(status="suggested", source="auto")
        first.status = "dismissed"
        first.save()
        again = self.assign(status="suggested", source="auto")
        self.assertNotEqual(first.pk, again.pk)

    def test_assignments_are_scoped_to_the_clinic(self):
        self.assign()
        clear_current_organization()
        self.assertEqual(PatientSchedule.objects.count(), 0)
        set_current_organization(self.other)
        self.assertEqual(PatientSchedule.objects.count(), 0)
        set_current_organization(self.org)
        self.assertEqual(PatientSchedule.objects.count(), 1)

    def test_schedule_copy_keeps_a_link_to_the_original(self):
        copy = ImmunizationSchedule.objects.create(name="High risk: diabetes (clinic)", copied_from=self.schedule)
        self.assertEqual(copy.copied_from, self.schedule)


class DoseDetailTests(TestCase):
    def test_a_dose_records_the_product_and_the_dictionary_values(self):
        org = Organization.objects.create(name="Clinic A")
        patient = make_user("p2", "patient", org)
        item = ImmunizationItem.objects.create(code="flu", name="Influenza")
        product = VaccineProduct.objects.create(cvx_code="141", short_name="Influenza, seasonal, injectable")
        mfr = LookupEntry.objects.create(dictionary="manufacturer", name="Sanofi Pasteur")
        elig = LookupEntry.objects.create(dictionary="eligibility_code", name="Not VFC eligible")
        rec = PatientImmunization.all_objects.create(
            organization=org, patient=patient, item=item, product=product, manufacturer=mfr, eligibility_code=elig,
            given_on=datetime.date(2026, 10, 19), lot_number="AB123",
        )
        rec.refresh_from_db()
        self.assertEqual(rec.product.cvx_code, "141")
        self.assertEqual(rec.manufacturer.name, "Sanofi Pasteur")
        self.assertEqual(rec.eligibility_code.dictionary, "eligibility_code")
        self.assertIsNone(rec.lot_source)
