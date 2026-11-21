# POWER Pharmacy: dangerous drugs (RA 9165) on the prescription writer -- the DDB yellow prescription and its
# serial number, and the prescriber's S2 license number (on the prescription and on the prescriber's profile).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0106_pharmacy_in_house"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescription",
            name="is_yellow_rx",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="prescription",
            name="yellow_rx_serial",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="prescription",
            name="s2_number",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="prescriberprofile",
            name="s2_number",
            field=models.CharField(blank=True, max_length=40),
        ),
    ]
