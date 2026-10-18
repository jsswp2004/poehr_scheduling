import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0039_registration_resident_provider"),
        ("appointments", "0059_appointment_is_video"),
    ]

    operations = [
        migrations.CreateModel(
            name="DocumentationAssistantMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("user_role", models.CharField(blank=True, default="", max_length=20)),
                ("conversation_id", models.UUIDField(db_index=True)),
                ("question", models.TextField()),
                ("answer", models.TextField(blank=True, default="")),
                ("tools_used", models.JSONField(blank=True, default=list)),
                ("model", models.CharField(blank=True, default="", max_length=120)),
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
            name="DocumentationAssistantAccess",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("patient_id", models.PositiveIntegerField(db_index=True)),
                ("tool", models.CharField(max_length=40)),
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
        migrations.AddIndex(
            model_name="documentationassistantmessage",
            index=models.Index(fields=["user", "-created_at"], name="doc_as_user_created_idx"),
        ),
        migrations.AddIndex(
            model_name="documentationassistantaccess",
            index=models.Index(fields=["patient_id", "-created_at"], name="doc_acc_patient_created_idx"),
        ),
    ]
