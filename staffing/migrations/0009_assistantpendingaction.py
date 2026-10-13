import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0031_organization_address_state"),
        ("staffing", "0008_assistantmessage"),
    ]

    operations = [
        migrations.CreateModel(
            name="AssistantPendingAction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("action_type", models.CharField(max_length=40)),
                ("params", models.JSONField(blank=True, default=dict)),
                ("summary", models.CharField(max_length=500)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Waiting for confirmation"),
                            ("confirmed", "Confirmed and done"),
                            ("cancelled", "Cancelled"),
                            ("failed", "Confirmed but failed"),
                        ],
                        default="pending",
                        max_length=12,
                    ),
                ),
                ("target_org_id", models.PositiveIntegerField(blank=True, null=True)),
                ("result_message", models.CharField(blank=True, default="", max_length=300)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("expires_at", models.DateTimeField()),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="users.organization",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="assistantpendingaction",
            index=models.Index(fields=["user", "status"], name="staffing_apa_user_status_idx"),
        ),
    ]
