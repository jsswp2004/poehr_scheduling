import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0018_reportsubscription_start_date"),
        ("users", "0027_userrightoverride"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("description", models.CharField(blank=True, default="", max_length=300)),
                ("module", models.CharField(default="staffing", max_length=20)),
                ("source", models.CharField(max_length=40)),
                ("config", models.JSONField(blank=True, default=dict)),
                (
                    "audience",
                    models.CharField(
                        choices=[("me", "Only me"), ("roles", "People with a role"), ("org", "Everyone at the facility")],
                        default="me",
                        max_length=10,
                    ),
                ),
                ("audience_roles", models.JSONField(blank=True, default=list)),
                ("last_run_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="staffing_custom_reports",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="staffing_custom_reports",
                        to="users.organization",
                    ),
                ),
            ],
            options={"ordering": ["name", "id"]},
        ),
    ]
