# Generated manually for adding arrived and no_show fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('appointments', '0018_autoemail'),
    ]

    operations = [
        migrations.AddField(
            model_name='appointment',
            name='arrived',
            field=models.BooleanField(default=False, help_text='Whether the patient has arrived for the appointment'),
        ),
        migrations.AddField(
            model_name='appointment',
            name='no_show',
            field=models.BooleanField(default=False, help_text='Whether the patient was a no-show for the appointment'),
        ),
    ]
