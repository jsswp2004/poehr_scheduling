# Lab results: reports, their result lines, and the audit trail (appointments/lab_results.py).

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0032_organization_lab_interface_enabled"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("appointments", "0042_calculated_items"),
    ]

    operations = [
        migrations.CreateModel(
            name="LabReport",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "title",
                    models.CharField(
                        help_text="Panel or test name, e.g. Basic metabolic panel",
                        max_length=255,
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("manual", "Entered by hand"),
                            ("scan", "Scanned document"),
                            ("interface", "Lab interface"),
                        ],
                        default="manual",
                        max_length=12,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("preliminary", "Preliminary"),
                            ("final", "Final"),
                            ("corrected", "Corrected"),
                            ("entered_in_error", "Entered in error"),
                        ],
                        default="final",
                        max_length=20,
                    ),
                ),
                ("performing_lab", models.CharField(blank=True, max_length=120)),
                ("accession_number", models.CharField(blank=True, max_length=64)),
                ("collected_at", models.DateTimeField(blank=True, null=True)),
                ("resulted_at", models.DateTimeField(blank=True, null=True)),
                ("comment", models.TextField(blank=True)),
                (
                    "review_status",
                    models.CharField(
                        choices=[
                            ("unreviewed", "Not yet reviewed"),
                            ("reviewed", "Reviewed"),
                        ],
                        default="unreviewed",
                        max_length=12,
                    ),
                ),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("review_comment", models.TextField(blank=True)),
                ("error_reason", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "entered_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="lab_reports_entered",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "order",
                    models.ForeignKey(
                        blank=True,
                        help_text="The order this answers, if known",
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="lab_reports",
                        to="appointments.order",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lab_reports",
                        to="users.organization",
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="lab_reports",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "reviewed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="lab_reports_reviewed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-resulted_at", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="LabResultItem",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("test_name", models.CharField(max_length=255)),
                ("loinc_code", models.CharField(blank=True, max_length=20)),
                (
                    "value",
                    models.CharField(
                        help_text="As reported, e.g. 5.4 or Negative", max_length=255
                    ),
                ),
                (
                    "value_numeric",
                    models.DecimalField(
                        blank=True, decimal_places=6, max_digits=18, null=True
                    ),
                ),
                ("units", models.CharField(blank=True, max_length=50)),
                ("reference_range", models.CharField(blank=True, max_length=100)),
                (
                    "ref_low",
                    models.DecimalField(
                        blank=True, decimal_places=6, max_digits=18, null=True
                    ),
                ),
                (
                    "ref_high",
                    models.DecimalField(
                        blank=True, decimal_places=6, max_digits=18, null=True
                    ),
                ),
                (
                    "abnormal_flag",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("", "Normal / not flagged"),
                            ("L", "Low"),
                            ("H", "High"),
                            ("LL", "Critical low"),
                            ("HH", "Critical high"),
                            ("A", "Abnormal"),
                        ],
                        default="",
                        max_length=2,
                    ),
                ),
                ("comment", models.TextField(blank=True)),
                (
                    "report",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="appointments.labreport",
                    ),
                ),
            ],
            options={
                "ordering": ["report", "sort_order", "id"],
            },
        ),
        migrations.CreateModel(
            name="LabReportEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("event_type", models.CharField(max_length=30)),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("user", "User"),
                            ("interface", "Interface"),
                            ("system", "System"),
                        ],
                        default="user",
                        max_length=10,
                    ),
                ),
                ("detail", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "report",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="events",
                        to="appointments.labreport",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="lab_report_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["created_at", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="labreport",
            index=models.Index(
                fields=["organization", "patient"],
                name="appointment_organiz_d21f2e_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="labreport",
            index=models.Index(
                fields=["organization", "review_status"],
                name="appointment_organiz_fc48fe_idx",
            ),
        ),
    ]
