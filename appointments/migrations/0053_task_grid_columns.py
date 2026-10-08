from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("appointments", "0052_order_tasks"),
    ]

    operations = [
        migrations.CreateModel(
            name="TaskGridColumns",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "minutes",
                    models.JSONField(blank=True, default=list, help_text="Minutes after midnight, e.g. [540, 585, 600]"),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="task_grid_columns",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
