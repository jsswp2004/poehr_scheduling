# POWER Pharmacy Portal: the claim code printed on a prescription, and portal delivery.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0107_rx_yellow_prescription"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescription",
            name="claim_code",
            field=models.CharField(blank=True, db_index=True, max_length=12),
        ),
        migrations.AlterField(
            model_name="prescription",
            name="delivery_method",
            field=models.CharField(
                blank=True,
                choices=[("", "Not yet"), ("print", "Printed"), ("fax", "Faxed"), ("erx", "Electronic"), ("portal", "POWER Pharmacy Portal")],
                max_length=6,
            ),
        ),
    ]
