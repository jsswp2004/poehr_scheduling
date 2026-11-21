# POWER Pharmacy: an order the pharmacist rejects is cancelled (never given), a status of its own.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0104_order_pharmacy_verification"),
    ]

    operations = [
        migrations.AlterField(
            model_name="order",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("pending_cosign", "Pending cosign"),
                    ("active", "Active"),
                    ("in_progress", "In progress"),
                    ("completed", "Completed"),
                    ("discontinued", "Discontinued"),
                    ("cancelled", "Cancelled"),
                ],
                default="draft",
                max_length=20,
            ),
        ),
    ]
