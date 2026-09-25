from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0028_clinicalnote"),
    ]

    operations = [
        migrations.AddField(
            model_name="clinicalnote",
            name="documentation_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("initial_assessment", "Initial Assessment"),
                    ("progress_note", "Progress Note"),
                ],
                help_text="Further classification of the note (e.g. Initial Assessment, Progress Note)",
                max_length=30,
            ),
        ),
    ]
