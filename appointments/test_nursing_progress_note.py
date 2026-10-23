"""Nursing Progress Note: the seeded template."""

from importlib import import_module

from django.apps import apps as django_apps
from django.test import TestCase

from .chart_data import SOURCES
from .models import NoteFieldDefinition, NoteTemplate

seed_module = import_module("appointments.migrations.0074_seed_nursing_progress_note")


class NursingProgressNoteTests(TestCase):
    def setUp(self):
        seed_module.seed(django_apps, None)
        self.template = NoteTemplate.objects.get(code="nursing_progress_note")
        self.fields = {f.key: f for f in self.template.fields.all()}

    def test_template(self):
        self.assertEqual(self.template.name, "Nursing Progress Note")
        self.assertEqual(self.template.note_type, "nursing_assessment")
        self.assertEqual({f.tab_label for f in self.fields.values()}, {""})  # one page, no tabs

    def test_sections_follow_the_outline(self):
        sections = []
        for f in self.template.fields.order_by("sort_order"):
            if f.section_label not in sections:
                sections.append(f.section_label)
        self.assertEqual(sections, ["Date and Time of the Entry", "Subjective", "Objective", "Nursing Assessment",
                                    "Interventions", "Patient Response", "Follow-up Plan", "Signature"])

    def test_required_fields(self):
        required = {k for k, f in self.fields.items() if f.required}
        self.assertEqual(required, {"entry_date", "entry_time", "subjective", "nursing_assessment", "followup_plan", "signer_credentials"})

    def test_chart_fields(self):
        sources = {f.calc["source"] for f in self.fields.values() if f.field_type == "chart_data"}
        self.assertEqual(sources, {"vitals", "intake_output"})
        self.assertTrue(sources <= set(SOURCES))

    def test_provider_questions_open_on_yes(self):
        for key in ("provider_name", "provider_time", "provider_method", "provider_orders", "provider_readback"):
            self.assertEqual(self.fields[key].depends_on.key, "provider_notified", key)
            self.assertEqual(self.fields[key].depends_on_value, "yes", key)

    def test_late_entry_asks_for_event_time_and_findings_open_when_abnormal(self):
        self.assertEqual((self.fields["event_datetime"].depends_on.key, self.fields["event_datetime"].depends_on_value), ("entry_type", "late_entry"))
        self.assertEqual((self.fields["obj_respiratory_findings"].depends_on.key, self.fields["obj_respiratory_findings"].depends_on_value), ("obj_respiratory", "abnormal"))

    def test_interventions_is_a_multiselect(self):
        self.assertEqual(self.fields["interventions"].field_type, "multiselect")
        self.assertEqual(self.fields["interventions"].dictionary.items.count(), 9)

    def test_running_again_changes_nothing_and_keeps_edits(self):
        self.fields["subjective"].label = "What the patient says"
        self.fields["subjective"].save()
        before = NoteFieldDefinition.objects.filter(template=self.template).count()
        seed_module.seed(django_apps, None)
        self.assertEqual(NoteFieldDefinition.objects.filter(template=self.template).count(), before)
        self.assertEqual(NoteFieldDefinition.objects.get(template=self.template, key="subjective").label, "What the patient says")
