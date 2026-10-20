from django.db import migrations


def add_row(apps, schema_editor):
    """Head circumference under Body Measurements on the Vital Signs flowsheet, for the infant growth chart."""
    Template = apps.get_model("appointments", "FlowsheetTemplate")
    Row = apps.get_model("appointments", "FlowsheetRowDefinition")
    template = Template.objects.filter(code="vital_signs").first()
    if template is None:
        return
    Row.objects.get_or_create(
        template=template, key="head_circumference_cm",
        defaults={"section_label": "Body Measurements", "label": "Head circumference", "unit": "cm", "field_type": "numeric", "sort_order": 140},
    )


class Migration(migrations.Migration):
    dependencies = [("appointments", "0061_vaccine_manager")]
    operations = [migrations.RunPython(add_row, migrations.RunPython.noop)]
