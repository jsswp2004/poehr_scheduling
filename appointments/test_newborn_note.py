"""Newborn Note template, the ICD-10 field type, and the birth-details sync."""

from types import SimpleNamespace

from django.test import TestCase

from .calculations import compute_calc, validate_calc
from .models import Dictionary, NoteFieldDefinition, NoteTemplate
from .pediatric_sync import BIRTH_FIELDS, sync_birth_details

TABS = [
    "Birth History", "Newborn Exam", "Feeding and Output", "Screening and Prophylaxis",
    "Assessment and Plan", "Attestation",
]


class FakeProfile:
    """Stands in for the patient's profile: records which fields were saved."""

    def __init__(self, **values):
        self.gestational_age_weeks = None
        self.gestational_age_days = None
        self.birth_weight_g = None
        for key, value in values.items():
            setattr(self, key, value)
        self.saved = None

    def save(self, update_fields=None):
        self.saved = list(update_fields or [])


def newborn_note(data, profile, code="newborn_note"):
    return SimpleNamespace(
        template=SimpleNamespace(code=code),
        patient=SimpleNamespace(patient_profile=profile),
        structured_data=data,
    )


class NewbornTemplateTests(TestCase):
    def setUp(self):
        self.template = NoteTemplate.objects.get(code="newborn_note")
        self.fields = list(self.template.fields.order_by("sort_order"))
        self.by_key = {f.key: f for f in self.fields}

    def test_template_is_a_doctor_note_of_its_own_type(self):
        self.assertEqual(self.template.note_type, "newborn_visit")
        self.assertTrue(self.template.is_active)
        item = Dictionary.objects.get(code="note_types").items.get(value="newborn_visit")
        self.assertEqual(item.author_role, "doctor")

    def test_tabs_come_in_the_designed_order(self):
        seen = []
        for f in self.fields:
            if f.tab_label not in seen:
                seen.append(f.tab_label)
        self.assertEqual(seen, TABS)

    def test_field_types_are_allowed_ones(self):
        allowed = {value for value, _ in NoteFieldDefinition.FIELD_TYPE_CHOICES}
        self.assertIn("icd10", allowed)
        self.assertTrue({f.field_type for f in self.fields} <= allowed)

    def test_dictionary_fields_have_a_dictionary_with_options(self):
        for f in self.fields:
            if f.field_type in ("radio", "dropdown", "multiselect"):
                self.assertIsNotNone(f.dictionary, f.key)
                self.assertTrue(f.dictionary.items.exists(), f.key)
            else:
                self.assertIsNone(f.dictionary, f.key)

    def test_every_dependency_points_at_a_field_of_this_template(self):
        for f in self.fields:
            if f.depends_on_id:
                self.assertEqual(f.depends_on.template_id, self.template.id, f.key)
                self.assertIn(f.depends_on.key, self.by_key)

    def test_diagnoses_use_the_icd10_picker(self):
        self.assertEqual(self.by_key["diagnoses"].field_type, "icd10")

    def test_birth_details_are_numeric_fields_on_the_birth_tab(self):
        for key in BIRTH_FIELDS:
            self.assertEqual(self.by_key[key].field_type, "numeric", key)
            self.assertEqual(self.by_key[key].tab_label, "Birth History", key)

    def test_vitals_chart_field_reads_the_flowsheet(self):
        self.assertEqual(self.by_key["vitals_chart"].field_type, "chart_data")
        self.assertEqual(self.by_key["vitals_chart"].calc, {"source": "vitals"})

    def test_weight_change_calculation_is_valid_and_reads_the_two_weights(self):
        field = self.by_key["weight_change_pct"]
        earlier = {}
        for f in self.fields:
            if f.key == field.key:
                break
            earlier[f.key] = {"field_type": f.field_type, "numeric_options": None, "label": f.label}
        cleaned, errors = validate_calc(field.calc, field.key, earlier)
        self.assertEqual(errors, [])
        small = compute_calc(cleaned, {"birth_weight_g": 2650, "weight_today_g": 2520})
        self.assertEqual(small["number"], -4.9)
        self.assertEqual(small["interpretation"], "Less than 10 % loss")
        big = compute_calc(cleaned, {"birth_weight_g": 2650, "weight_today_g": 2385})
        self.assertEqual(big["number"], -10.0)
        self.assertEqual(big["interpretation"], "Loss of 10 % or more: review")
        self.assertEqual(compute_calc(cleaned, {"birth_weight_g": 2650})["value"], "")


class NewbornBirthSyncTests(TestCase):
    def test_newborn_note_copies_birth_details_to_the_patient(self):
        profile = FakeProfile()
        data = {"gestational_age_weeks": "36", "gestational_age_days": "0", "birth_weight_g": "2650"}
        changed = sync_birth_details(newborn_note(data, profile))
        self.assertEqual(sorted(changed), ["birth_weight_g", "gestational_age_days", "gestational_age_weeks"])
        self.assertEqual((profile.gestational_age_weeks, profile.gestational_age_days, profile.birth_weight_g), (36, 0, 2650))

    def test_pediatric_note_still_syncs(self):
        profile = FakeProfile()
        changed = sync_birth_details(newborn_note({"birth_weight_g": 3400}, profile, code="general_pediatric_note"))
        self.assertEqual(changed, ["birth_weight_g"])

    def test_other_notes_do_not_sync(self):
        profile = FakeProfile()
        self.assertEqual(sync_birth_details(newborn_note({"birth_weight_g": 3400}, profile, code="progress_note")), [])
        self.assertIsNone(profile.birth_weight_g)

    def test_blank_and_out_of_range_values_never_overwrite_the_record(self):
        profile = FakeProfile(gestational_age_weeks=36, birth_weight_g=2650)
        data = {"gestational_age_weeks": "", "birth_weight_g": "26500", "gestational_age_days": "9"}
        self.assertEqual(sync_birth_details(newborn_note(data, profile)), [])
        self.assertEqual((profile.gestational_age_weeks, profile.birth_weight_g), (36, 2650))
        self.assertIsNone(profile.saved)

    def test_unchanged_values_cause_no_save(self):
        profile = FakeProfile(gestational_age_weeks=36)
        self.assertEqual(sync_birth_details(newborn_note({"gestational_age_weeks": 36}, profile)), [])
        self.assertIsNone(profile.saved)
