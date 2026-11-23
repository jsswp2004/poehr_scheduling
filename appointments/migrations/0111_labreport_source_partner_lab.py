from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("appointments", "0110_prescriber_ptr_number"),
    ]

    operations = [
        migrations.AlterField(
            model_name="labreport",
            name="source",
            field=models.CharField(
                choices=[
                    ("manual", "Entered by hand"),
                    ("scan", "Scanned document"),
                    ("interface", "Lab interface"),
                    ("partner_lab", "Partner lab portal"),
                ],
                default="manual",
                max_length=12,
            ),
        ),
    ]
