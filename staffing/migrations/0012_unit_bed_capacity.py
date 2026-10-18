from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0011_masterschedulerow_unit"),
    ]

    operations = [
        migrations.AddField(
            model_name="unit",
            name="bed_capacity",
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                help_text="Beds on this unit; printed as the '/beds' part of the census on the daily staffing reports.",
            ),
        ),
    ]
