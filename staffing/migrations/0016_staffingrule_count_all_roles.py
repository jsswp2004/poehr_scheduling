from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0015_unit_custom_shifts"),
    ]

    operations = [
        migrations.AddField(
            model_name="staffingrule",
            name="count_all_roles",
            field=models.BooleanField(
                default=False,
                help_text="Count every staff role (not only RN/LPN/CNA) toward this standard's hours and ratio.",
            ),
        ),
    ]
