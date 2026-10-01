from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0031_organization_address_state"),
        ("staffing", "0005_hppd_units_census_nursing_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="StaffTimeOffRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("off_request", "Time-off request"), ("emergency", "Emergency / call-out")], max_length=20)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("approved", "Approved"), ("denied", "Denied"), ("cancelled", "Cancelled"), ("open", "Open (needs cover)"), ("resolved", "Resolved (cover arranged)")], default="pending", max_length=20)),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                ("reason", models.TextField(blank=True, default="")),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                ("admin_note", models.TextField(blank=True, default="")),
                ("alert_sent_at", models.DateTimeField(blank=True, help_text="When the emergency alert went to admins. Null = not sent.", null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("cover_staff", models.ForeignKey(blank=True, help_text="Who is covering (set when an emergency is resolved).", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="covering_requests", to="staffing.staff")),
                ("decided_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="staffing_time_off_requests", to="users.organization")),
                ("reported_by", models.ForeignKey(blank=True, help_text="Who entered it: the staff member, or an admin on their behalf (phone call-out).", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("shift", models.ForeignKey(blank=True, help_text="Specific shift a call-out is for. Blank = every shift in the date range.", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="time_off_requests", to="staffing.staffshift")),
                ("staff", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="time_off_requests", to="staffing.staff")),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["organization", "start_date", "end_date"], name="staffing_to_org_dates_idx"),
                    models.Index(fields=["organization", "status"], name="staffing_to_org_status_idx"),
                ],
            },
        ),
    ]
