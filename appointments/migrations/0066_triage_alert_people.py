from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("appointments", "0065_triage_reassessment")]

    operations = [
        migrations.AddField(
            model_name="triagesettings",
            name="alert_user_ids",
            field=models.JSONField(blank=True, default=list, help_text="People told at once when a signed triage note has a positive suicide screen or an unsafe-at-home answer"),
        ),
    ]
