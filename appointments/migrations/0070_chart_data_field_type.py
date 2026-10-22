from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("appointments", "0069_labreport_visit_scan_meta")]

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
                ],
                max_length=20,
            ),
        ),
    ]
