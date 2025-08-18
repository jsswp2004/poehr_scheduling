# Generated migration for adding organization field to Holiday model

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),  # Assuming users app exists for Organization model
        ('appointments', '0015_holiday_suppressed'),
    ]

    operations = [
        # Remove the old unique constraint
        migrations.RemoveConstraint(
            model_name='holiday',
            name='unique_holiday',
        ),
        
        # Add organization field (nullable initially for existing records)
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
        
        # Add new unique constraint for organization + name + date
        migrations.AddConstraint(
            model_name='holiday',
            constraint=models.UniqueConstraint(
                fields=['organization', 'name', 'date'], 
                name='unique_holiday_per_org'
            ),
        ),
    ]
