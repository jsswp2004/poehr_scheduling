import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0047_patient_birth_details"),
        ("appointments", "0064_seed_triage_note"),
    ]

    operations = [
        migrations.CreateModel(
            name="TriageReassessment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("recorded_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("vitals", models.JSONField(blank=True, default=dict, help_text="hr, rr, spo2, temp_f, sbp, dbp, pain as entered")),
                ("change", models.TextField(blank=True, help_text="What changed since the last look")),
                ("level_before", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("level_after", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("appointment", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="triage_reassessments", to="appointments.appointment")),
                ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="triage_reassessments", to="users.organization")),
                ("patient", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="triage_reassessments", to=settings.AUTH_USER_MODEL)),
                ("recorded_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="triage_reassessments_recorded", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["recorded_at", "pk"]},
        ),
        migrations.AddIndex(
            model_name="triagereassessment",
            index=models.Index(fields=["appointment", "recorded_at"], name="appointment_appoint_034bfa_idx"),
        ),
    ]
