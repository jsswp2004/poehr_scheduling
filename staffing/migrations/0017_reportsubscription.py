import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0027_userrightoverride"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("staffing", "0016_staffingrule_count_all_roles"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReportSubscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("report", models.CharField(max_length=40)),
                ("params", models.JSONField(blank=True, default=dict)),
                (
                    "frequency",
                    models.CharField(
                        choices=[("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly")],
                        default="weekly",
                        max_length=10,
                    ),
                ),
                ("weekday", models.PositiveSmallIntegerField(default=0)),
                ("month_day", models.PositiveSmallIntegerField(default=1)),
                ("send_hour", models.PositiveSmallIntegerField(default=7)),
                ("timezone", models.CharField(default="America/New_York", max_length=64)),
                ("covers", models.CharField(default="previous_week", max_length=20)),
                ("formats", models.JSONField(default=list)),
                ("recipients", models.JSONField(default=list)),
                ("is_active", models.BooleanField(default=True)),
                ("next_run_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("last_run_at", models.DateTimeField(blank=True, null=True)),
                ("last_status", models.CharField(blank=True, default="", max_length=10)),
                ("last_detail", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="staffing_report_subscriptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="staffing_report_subscriptions",
                        to="users.organization",
                    ),
                ),
            ],
            options={"ordering": ["report", "id"]},
        ),
    ]
