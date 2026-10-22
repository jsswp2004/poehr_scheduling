import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("appointments", "0068_note_type_from_dictionary"),
        ("users", "0047_patient_birth_details"),
    ]

    operations = [
        migrations.AddField(
            model_name="labreport",
            name="visit",
            field=models.ForeignKey(
                blank=True,
                help_text="The visit (Registration, shown as its Visit Number) this document was filed to, if one was chosen",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="lab_reports",
                to="users.registration",
            ),
        ),
        migrations.AddField(
            model_name="labreport",
            name="scan_meta",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
