import importlib

from django.test import TestCase

from .models import NoteTemplate
from .serializers import (
    NoteTemplateAdminReadSerializer,
    NoteTemplateAdminSerializer,
    NoteTemplatePickerSerializer,
    NoteTemplateSerializer,
)


class OwnershipFieldTests(TestCase):
    def test_choices_are_physician_nursing_ancillary(self):
        self.assertEqual([v for v, _ in NoteTemplate.OWNERSHIP_CHOICES], ["physician", "nursing", "ancillary"])

    def test_new_templates_start_with_no_ownership(self):
        self.assertEqual(NoteTemplate.objects.create(code="own_test", name="Own test").ownership, "")

    def test_note_builder_reads_and_writes_ownership(self):
        self.assertIn("ownership", NoteTemplateAdminSerializer.Meta.fields)
        self.assertIn("ownership", NoteTemplateAdminReadSerializer.Meta.fields)

    def test_documents_tab_reads_note_type_and_ownership(self):
        self.assertIn("note_type", NoteTemplatePickerSerializer.Meta.fields)
        self.assertIn("ownership", NoteTemplatePickerSerializer.Meta.fields)

    def test_frozen_note_snapshot_is_unchanged(self):
        self.assertNotIn("note_type", NoteTemplateSerializer.Meta.fields)
        self.assertNotIn("ownership", NoteTemplateSerializer.Meta.fields)

    def test_admin_serializer_accepts_each_value_and_blank(self):
        field = NoteTemplateAdminSerializer().fields["ownership"]
        for value in ("physician", "nursing", "ancillary", ""):
            self.assertEqual(field.run_validation(value), value)
        with self.assertRaises(Exception):
            field.run_validation("janitor")


class OwnershipBackfillTests(TestCase):
    def test_doctor_types_become_physician_and_nurse_types_nursing(self):
        backfill = importlib.import_module("appointments.migrations.0094_backfill_template_ownership")
        self.assertEqual(backfill.owner_for("doctor"), "physician")
        self.assertEqual(backfill.owner_for("nurse"), "nursing")

    def test_open_or_unknown_types_are_left_blank(self):
        backfill = importlib.import_module("appointments.migrations.0094_backfill_template_ownership")
        for role in ("", None, "registrar"):
            self.assertEqual(backfill.owner_for(role), "")
