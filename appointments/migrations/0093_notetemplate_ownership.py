from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("appointments", "0092_newborn_note_layout")]

    operations = [
        migrations.AddField(
            model_name="notetemplate",
            name="ownership",
            field=models.CharField(
                blank=True,
                choices=[("physician", "Physician"), ("nursing", "Nursing"), ("ancillary", "Ancillary")],
                default="",
                help_text="Document ownership: physician, nursing or ancillary; blank = not set",
                max_length=20,
            ),
        ),
    ]
