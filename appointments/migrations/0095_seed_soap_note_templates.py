"""Make Initial Assessment and Progress Note real Note Builder templates.

They were hard-coded in the notes screen (four SOAP boxes), so they never appeared in the Note Builder and
ignored Document ownership. Each becomes a template with the same four boxes, owned by Physician, so an admin can
see, edit, switch off or re-assign it. Notes already written keep their SOAP text and open as before. A clinic that
already has a template with the same code is left alone.
"""

from django.db import migrations

TEMPLATES = [
    # code, name, note type (an item of the note_types dictionary)
    ("initial_assessment", "Initial Assessment", "assessment"),
    ("progress_note", "Progress Note", "progress"),
]
SOAP_FIELDS = [
    ("subjective", "Subjective"),
    ("objective", "Objective"),
    ("assessment", "Assessment"),
    ("plan", "Plan"),
]


def seed(apps, schema_editor):
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    NoteFieldDefinition = apps.get_model("appointments", "NoteFieldDefinition")
    DictionaryItem = apps.get_model("appointments", "DictionaryItem")
    known_types = set(DictionaryItem.objects.filter(dictionary__code="note_types").values_list("value", flat=True))
    for code, name, note_type in TEMPLATES:
        template, created = NoteTemplate.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "kind": "note",
                "version": 1,
                "is_active": True,
                "ownership": "physician",
                "note_type": note_type if note_type in known_types else "",
            },
        )
        if not created:
            continue
        for order, (key, label) in enumerate(SOAP_FIELDS):
            NoteFieldDefinition.objects.create(
                template=template, key=key, label=label, field_type="textarea", sort_order=order
            )


def unseed(apps, schema_editor):
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    NoteTemplate.objects.filter(code__in=[c for c, _, _ in TEMPLATES], notes__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("appointments", "0094_backfill_template_ownership")]
    operations = [migrations.RunPython(seed, unseed)]
