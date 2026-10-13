import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0023_add_account_cancellation_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("communicator", "0005_contact_sms_opt_out"),
    ]

    operations = [
        migrations.CreateModel(
            name="CommunicatorAssistantMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("user_role", models.CharField(blank=True, default="", max_length=20)),
                ("conversation_id", models.UUIDField(db_index=True)),
                ("question", models.TextField()),
                ("answer", models.TextField(blank=True, default="")),
                ("tools_used", models.JSONField(blank=True, default=list)),
                ("model", models.CharField(blank=True, default="", max_length=60)),
                ("input_tokens", models.PositiveIntegerField(default=0)),
                ("output_tokens", models.PositiveIntegerField(default=0)),
                ("error", models.CharField(blank=True, default="", max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
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
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.CreateModel(
            name="CommunicatorPendingAction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("action_type", models.CharField(max_length=40)),
                ("params", models.JSONField(blank=True, default=dict)),
                ("summary", models.CharField(max_length=500)),
                ("detail", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Waiting for confirmation"),
                            ("sending", "Being carried out"),
                            ("confirmed", "Confirmed and done"),
                            ("cancelled", "Cancelled"),
                            ("failed", "Confirmed but failed"),
                        ],
                        default="pending",
                        max_length=12,
                    ),
                ),
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
            model_name="communicatorassistantmessage",
            index=models.Index(fields=["user", "-created_at"], name="comm_as_user_created_idx"),
        ),
        migrations.AddIndex(
            model_name="communicatorpendingaction",
            index=models.Index(fields=["user", "status"], name="comm_apa_user_status_idx"),
        ),
    ]
