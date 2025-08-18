# Simple migration - just add organization field without constraint changes

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),  
        ('appointments', '0015_holiday_suppressed'),
    ]

    operations = [
        # Just add the organization field - no constraint changes
        migrations.AddField(
            model_name='holiday',
            name='organization',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='holidays',
                to='users.organization'
            ),
        ),
    ]
