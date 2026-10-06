from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0048_locations"),
        ("users", "0034_patient_header"),
    ]

    operations = [
        migrations.AddField(
            model_name="registration",
            name="facility",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="registrations", to="appointments.facility"),
        ),
        migrations.AddField(
            model_name="registration",
            name="unit",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="registrations", to="appointments.unit"),
        ),
        migrations.AddField(
            model_name="registration",
            name="room",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="registrations", to="appointments.room"),
        ),
        migrations.AddField(
            model_name="registration",
            name="bed",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="registrations", to="appointments.bed"),
        ),
        migrations.AddField(
            model_name="registration",
            name="discharge_datetime",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
