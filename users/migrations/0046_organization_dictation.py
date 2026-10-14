from django.db import migrations, models


class Migration(migrations.Migration):
    """Per-organization switches for voice dictation (see the `dictation` app). Off by default."""

    dependencies = [("users", "0045_mrn_required")]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="dictation_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Master switch for voice dictation into clinical notes. Off: no microphone "
                    "button is shown and the server refuses every dictation request."
                ),
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="dictation_cleanup_enabled",
            field=models.BooleanField(
                default=True,
                help_text="Offer the AI 'clean up & structure' step on dictated text (only if dictation is on).",
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="dictation_specialty",
            field=models.CharField(
                choices=[
                    ("PRIMARYCARE", "Primary care"),
                    ("CARDIOLOGY", "Cardiology"),
                    ("NEUROLOGY", "Neurology"),
                    ("ONCOLOGY", "Oncology"),
                    ("RADIOLOGY", "Radiology"),
                    ("UROLOGY", "Urology"),
                ],
                default="PRIMARYCARE",
                help_text="Medical vocabulary the speech engine favors.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="dictation_access",
            field=models.CharField(
                choices=[
                    ("authors", "Anyone who can author notes"),
                    ("doctors", "Doctors only"),
                ],
                default="authors",
                help_text="Who may dictate once it is on.",
                max_length=10,
            ),
        ),
    ]
