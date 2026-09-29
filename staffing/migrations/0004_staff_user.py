import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0003_staff_reminders_enabled_staffshift_reminder_sent_at_and_more"),
        ("users", "0029_alter_customuser_role_staff"),
    ]

    operations = [
        migrations.AddField(
            model_name="staff",
            name="user",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="staff_profile",
                to=settings.AUTH_USER_MODEL,
                help_text=(
                    "Optional app login for this roster entry (role 'staff'), created "
                    "via the Invite flow. Lets the staff member see the schedule in "
                    "the mobile app. Null means no login."
                ),
            ),
        ),
    ]
