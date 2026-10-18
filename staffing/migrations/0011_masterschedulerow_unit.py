import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0010_master_schedule"),
    ]

    operations = [
        migrations.AddField(
            model_name="masterschedulerow",
            name="unit",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="master_schedule_rows",
                to="staffing.unit",
            ),
        ),
    ]
