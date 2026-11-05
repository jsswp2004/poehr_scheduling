from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0074_seed_nursing_progress_note"),
    ]

    operations = [
        migrations.AddField(
            model_name="availability",
            name="series_id",
            field=models.UUIDField(
                blank=True,
                db_index=True,
                help_text="Schedules created together (a recurrence or a multi-day save) share this id",
                null=True,
            ),
        ),
    ]
