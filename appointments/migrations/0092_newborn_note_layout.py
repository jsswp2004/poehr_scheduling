"""Lay out the Newborn Note in rows instead of one long column.

Sets each field's width (see NoteFieldDefinition.width) on the newborn_note template: numbers and dates take a quarter
of a row, dropdowns / short text / checkboxes a third, the exam status and its findings share a row, and long text, the
vital signs snapshot and the diagnoses stay full width. Only fields still on the default width are changed, so a clinic's
own layout edits are never overwritten.
"""

from django.db import migrations

NEWBORN_TEMPLATE_CODE = "newborn_note"


def width_for(key, field_type):
    """The width a Newborn Note field should have."""
    if field_type in ("textarea", "chart_data", "icd10"):
        return "full"
    if field_type == "radio" or key.endswith("_findings"):
        return "half"
    if field_type in ("numeric", "date"):
        return "quarter"
    return "third"  # dropdown, short text, checkbox, calculated


def apply_layout(apps, schema_editor):
    Field = apps.get_model("appointments", "NoteFieldDefinition")
    for field in Field.objects.filter(template__code=NEWBORN_TEMPLATE_CODE, width="full"):
        width = width_for(field.key, field.field_type)
        if width != "full":
            field.width = width
            field.save(update_fields=["width"])


def clear_layout(apps, schema_editor):
    apps.get_model("appointments", "NoteFieldDefinition").objects.filter(
        template__code=NEWBORN_TEMPLATE_CODE).update(width="full")


class Migration(migrations.Migration):
    dependencies = [("appointments", "0091_notefielddefinition_width")]
    operations = [migrations.RunPython(apply_layout, clear_layout)]
