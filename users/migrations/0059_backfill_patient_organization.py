from django.db import migrations
from django.db.models import F


def backfill(apps, schema_editor):
    """Patients created through the register endpoint were left without an organization."""
    Patient = apps.get_model("users", "Patient")
    CustomUser = apps.get_model("users", "CustomUser")
    for patient in Patient.objects.filter(organization__isnull=True).select_related("user"):
        org_id = patient.user.organization_id
        if org_id:
            Patient.objects.filter(pk=patient.pk).update(organization_id=org_id)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0058_patient_mother"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
