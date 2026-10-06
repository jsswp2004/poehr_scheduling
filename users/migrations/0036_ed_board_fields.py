from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0035_registration_location"),
    ]

    operations = [
        migrations.AddField(
            model_name="registration",
            name="esi",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="registration",
            name="ed_status",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="registration",
            name="assigned_nurse",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="nurse_registrations", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="registration",
            name="resident",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="registration",
            name="board_comments",
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name="registration",
            name="registration_complete",
            field=models.BooleanField(default=False),
        ),
    ]
