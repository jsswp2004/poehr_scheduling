# Calculated items: a field/row whose value is worked out from other items
# (a PHQ-9 total, a BMI, ...) instead of being typed in. The calculation lives
# in the new `calc` JSON column; see appointments/calculations.py.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0041_orders"),
    ]

    operations = [
        migrations.AddField(
            model_name="notefielddefinition",
            name="calc",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="flowsheetrowdefinition",
            name="calc",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name="notefielddefinition",
            name="field_type",
            field=models.CharField(
                choices=[
                    ("text", "Single-line Text"),
                    ("textarea", "Multi-line Text"),
                    ("radio", "Radio Button (dictionary)"),
                    ("dropdown", "Dropdown (dictionary)"),
                    ("multiselect", "Multi-select Checklist (dictionary)"),
                    ("checkbox", "Checkbox (yes/no)"),
                    ("numeric", "Numeric"),
                    ("date", "Date"),
                    ("calculated", "Calculated (total / result)"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="flowsheetrowdefinition",
            name="field_type",
            field=models.CharField(
                choices=[
                    ("numeric", "Numeric"),
                    ("text", "Text"),
                    ("dropdown", "Dropdown (dictionary)"),
                    ("calculated", "Calculated (total / result)"),
                ],
                default="numeric",
                max_length=20,
            ),
        ),
    ]
