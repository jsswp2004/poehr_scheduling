# Generated manually to mirror 0018_autoemail.py, for the new fully
# independent AutoSMS model (separate Enabled/frequency/day/start-date
# from AutoEmail).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('appointments', '0038_flowsheet_templates'),
        ('users', '0015_add_subscription_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='AutoSMS',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('auto_message_frequency', models.CharField(choices=[('daily', 'Daily'), ('weekly', 'Weekly'), ('bi-weekly', 'Bi-weekly'), ('monthly', 'Monthly')], default='weekly', help_text='How often automated SMS reminders should be sent', max_length=20)),
                ('auto_message_day_of_week', models.IntegerField(choices=[(0, 'Sunday'), (1, 'Monday'), (2, 'Tuesday'), (3, 'Wednesday'), (4, 'Thursday'), (5, 'Friday'), (6, 'Saturday')], default=1, help_text='Day of the week when automated SMS reminders should be sent')),
                ('auto_message_start_date', models.DateField(blank=True, help_text='When to start sending automated SMS reminders', null=True)),
                ('is_active', models.BooleanField(default=True, help_text='Whether automated SMS reminders are enabled')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.ForeignKey(blank=True, help_text='Organization this auto SMS setting belongs to', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='auto_sms_settings', to='users.organization')),
            ],
        ),
    ]
