from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("users", "0046_organization_dictation")]

    operations = [
        migrations.AddField(model_name="patient", name="gestational_age_weeks", field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(model_name="patient", name="gestational_age_days", field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(model_name="patient", name="birth_weight_g", field=models.PositiveIntegerField(blank=True, null=True)),
    ]
