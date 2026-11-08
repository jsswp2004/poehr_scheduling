from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("appointments", "0088_seed_general_pediatric_note")]

    operations = [
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
                    ("chart_data", "Chart data (read-only)"),
                    ("icd10", "Diagnosis codes (ICD-10)"),
                ],
                max_length=20,
            ),
        ),
    ]
