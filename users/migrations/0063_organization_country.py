# Organization.country: which country's rules a clinic follows (PH by default; US needs an NPI to sign prescriptions).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0062_alter_customuser_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='country',
            field=models.CharField(choices=[('PH', 'Philippines'), ('US', 'United States')], default='PH', max_length=2),
        ),
    ]
