from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0038_status_board_views"),
    ]

    operations = [
        migrations.AddField(
            model_name="registration",
            name="resident_provider",
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={"role": "doctor"},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="resident_registrations",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
