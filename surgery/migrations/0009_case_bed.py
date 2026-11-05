from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0087_unit_is_surgical"),
        ("surgery", "0008_link_existing_rooms"),
    ]

    operations = [
        migrations.AddField(
            model_name="surgerycase",
            name="bed",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="surgery_cases", to="appointments.bed",
            ),
        ),
        migrations.AddField(
            model_name="surgerycase",
            name="previous_place",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
