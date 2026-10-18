from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0012_unit_bed_capacity"),
    ]

    operations = [
        migrations.AlterField(
            model_name="staffshift",
            name="source",
            field=models.CharField(
                choices=[
                    ("recurring", "Generated from recurring pattern"),
                    ("manual", "Manually assigned"),
                    ("override", "One-off override of a recurring occurrence"),
                    ("pickup", "Picked up by the staff member"),
                ],
                default="manual",
                max_length=20,
            ),
        ),
    ]
