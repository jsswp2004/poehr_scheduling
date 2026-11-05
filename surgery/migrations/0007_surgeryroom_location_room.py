import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0087_unit_is_surgical"),
        ("surgery", "0006_case_documents"),
    ]

    operations = [
        migrations.AddField(
            model_name="surgeryroom",
            name="location_room",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="surgery_room",
                to="appointments.room",
            ),
        ),
    ]
