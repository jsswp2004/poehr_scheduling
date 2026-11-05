import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0020_reportauditlog"),
    ]

    operations = [
        migrations.AddField(
            model_name="reportsubscription",
            name="custom_report",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name="subscriptions", to="staffing.customreport",
            ),
        ),
        migrations.AddField(
            model_name="reportsubscription",
            name="hide_phi",
            field=models.BooleanField(default=True),
        ),
    ]
