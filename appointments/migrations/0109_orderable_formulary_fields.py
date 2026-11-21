# POWER Formulary: strength, form, default route and renal threshold on medication orderables.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0108_rx_claim_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderable",
            name="strength",
            field=models.CharField(blank=True, help_text="Medications: e.g. 500 mg", max_length=60),
        ),
        migrations.AddField(
            model_name="orderable",
            name="form",
            field=models.CharField(blank=True, help_text="Medications: tablet, capsule, ...", max_length=40),
        ),
        migrations.AddField(
            model_name="orderable",
            name="default_route",
            field=models.CharField(blank=True, help_text="Medications: PO, IV, ...", max_length=20),
        ),
        migrations.AddField(
            model_name="orderable",
            name="renal_threshold_crcl",
            field=models.PositiveSmallIntegerField(
                blank=True, help_text="Medications: review the dose when CrCl (mL/min) is below this; blank = no renal flag", null=True,
            ),
        ),
    ]
