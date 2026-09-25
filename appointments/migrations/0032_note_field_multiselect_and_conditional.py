import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0031_seed_admission_note_template"),
    ]

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
                ],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="notefielddefinition",
            name="depends_on",
            field=models.ForeignKey(
                blank=True,
                help_text="Only show this field when depends_on's value contains depends_on_value",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="dependents",
                to="appointments.notefielddefinition",
            ),
        ),
        migrations.AddField(
            model_name="notefielddefinition",
            name="depends_on_value",
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
