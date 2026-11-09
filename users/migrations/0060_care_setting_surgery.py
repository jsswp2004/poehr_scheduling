from django.db import migrations, models


def surgery_visits(apps, schema_editor):
    """Patients now in an operating-room unit (PreOp, OR, PACU) are in the Surgery care setting."""
    Registration = apps.get_model("users", "Registration")
    Registration.objects.filter(discharge_datetime__isnull=True, unit__is_surgical=True).exclude(
        care_setting="surgery"
    ).update(care_setting="surgery")


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0059_backfill_patient_organization"),
        ("appointments", "0087_unit_is_surgical"),
    ]

    operations = [
        migrations.AlterField(
            model_name="registration",
            name="care_setting",
            field=models.CharField(
                blank=True,
                choices=[
                    ("ambulatory", "Ambulatory Care"),
                    ("emergency", "Emergency Care"),
                    ("acute", "Acute Care"),
                    ("surgery", "Surgery"),
                ],
                max_length=12,
            ),
        ),
        migrations.RunPython(surgery_visits, migrations.RunPython.noop),
    ]
