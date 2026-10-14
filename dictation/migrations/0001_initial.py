import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0046_organization_dictation"),
    ]

    operations = [
        migrations.CreateModel(
            name="DictationEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("stream_start", "Dictation started"),
                            ("stream_end", "Dictation ended"),
                            ("cleanup", "AI cleanup"),
                        ],
                        max_length=20,
                    ),
                ),
                ("session_id", models.UUIDField(db_index=True, default=uuid.uuid4)),
                ("seconds", models.PositiveIntegerField(blank=True, null=True)),
                ("chars", models.PositiveIntegerField(blank=True, null=True)),
                ("ok", models.BooleanField(default=True)),
                ("detail", models.CharField(blank=True, default="", max_length=60)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dictation_events",
                        to="users.organization",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="dictation_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [models.Index(fields=["organization", "-created_at"], name="dictation_d_organiz_9abfe9_idx")],
            },
        ),
    ]
