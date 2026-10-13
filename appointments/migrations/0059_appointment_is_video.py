from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0058_scheduler_assistant"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="is_video",
            field=models.BooleanField(
                default=False, help_text="This visit is held by video (Telehealth)"
            ),
        ),
    ]
