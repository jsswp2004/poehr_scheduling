from django.db import migrations, models

NOTE_TYPES = [
    ("assessment", "Assessment"),
    ("triage", "Triage"),
    ("progress", "Progress"),
    ("admission", "Admission"),
    ("discharge", "Discharge"),
    ("procedure", "Procedure"),
]

# Templates that already exist in the product get the obvious type; anything else stays blank
# ("Not set") until an admin picks one.
KNOWN = {
    "initial_assessment": "assessment",
    "triage_note": "triage",
    "progress_note": "progress",
    "admission_note": "admission",
}


def seed_note_types(apps, schema_editor):
    Dictionary = apps.get_model("appointments", "Dictionary")
    DictionaryItem = apps.get_model("appointments", "DictionaryItem")
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    d, _ = Dictionary.objects.get_or_create(
        code="note_types",
        defaults={"name": "Note types", "description": "Categories offered in the Note type picker of every note template."},
    )
    for order, (value, label) in enumerate(NOTE_TYPES, start=1):
        DictionaryItem.objects.get_or_create(
            dictionary=d, value=value, defaults={"label": label, "sort_order": order * 10}
        )
    for code, value in KNOWN.items():
        NoteTemplate.objects.filter(code=code, note_type="").update(note_type=value)


class Migration(migrations.Migration):
    dependencies = [("appointments", "0066_triage_alert_people")]

    operations = [
        migrations.AddField(
            model_name="notetemplate",
            name="note_type",
            field=models.CharField(blank=True, default="", help_text="Value of an item in the note_types dictionary; blank = not set", max_length=100),
        ),
        migrations.RunPython(seed_note_types, migrations.RunPython.noop),
    ]
