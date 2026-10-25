from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0014_unitstaffingrule"),
    ]

    operations = [
        migrations.AddField(
            model_name="unit",
            name="custom_shifts",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Unit's own shifts when shift_pattern is 'custom': [{key, name, start, end, break_minutes}].",
            ),
        ),
        migrations.AlterField(
            model_name="unit",
            name="shift_pattern",
            field=models.CharField(
                choices=[
                    ("8h", "8-hour shifts (Day / Evening / Night)"),
                    ("12h", "12-hour shifts (Day / Night)"),
                    ("custom", "Custom hours (the unit's own shifts)"),
                ],
                default="8h",
                help_text="8-hour (Day/Evening/Night) or 12-hour (Day/Night) shifts for this unit.",
                max_length=10,
            ),
        ),
    ]
