"""Show the chart's allergies inside notes that only had a blank allergy text box.

The Admission Note (and any note a clinic built the same way) had a required free-text "Allergies" box, so a
patient with penicillin already on the chart still showed an empty allergy section in the note. Each such
template now gets a read-only "Chart data" allergy list just above the text box; the text box stays for
comments and is no longer required. Templates that already show the chart's allergies are left alone.
"""

from django.db import migrations
from django.db.models import F

LIST_KEY = "allergy_list"


def add_allergy_list(apps, schema_editor):
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    NoteFieldDefinition = apps.get_model("appointments", "NoteFieldDefinition")
    for template in NoteTemplate.objects.filter(kind="note"):
        fields = list(template.fields.all().order_by("sort_order", "id"))
        if any(f.field_type == "chart_data" and (f.calc or {}).get("source") == "allergies" for f in fields):
            continue
        text = next((f for f in fields if f.key == "allergies" and f.field_type in ("text", "textarea")), None)
        if text is None or any(f.key == LIST_KEY for f in fields):
            continue
        template.fields.filter(sort_order__gte=text.sort_order).update(sort_order=F("sort_order") + 1)
        NoteFieldDefinition.objects.create(
            template=template,
            tab_label=text.tab_label,
            section_label=text.section_label,
            key=LIST_KEY,
            label="Allergies on the chart",
            field_type="chart_data",
            required=False,
            sort_order=text.sort_order,
            help_text="From the patient's chart. Use Allergy Manager to add or change one.",
            width="full",
            calc={"source": "allergies"},
        )
        text.refresh_from_db()
        text.label = "Allergy comments"
        text.required = False
        text.help_text = "Anything to add beyond the chart's allergies (optional)"
        text.save(update_fields=["label", "required", "help_text"])


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0096_note_template_locations"),
    ]

    operations = [
        migrations.RunPython(add_allergy_list, migrations.RunPython.noop),
    ]
