import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0047_patient_birth_details"),
        ("appointments", "0062_head_circumference_row"),
    ]

    operations = [
        migrations.CreateModel(
            name="TriageSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("danger_zone", models.JSONField(blank=True, help_text="Heart rate / respiratory rate limits by age band and the SpO2 limit", null=True)),
                ("fever", models.JSONField(blank=True, help_text="Fever limits by age", null=True)),
                ("reassess_minutes", models.JSONField(blank=True, default=dict, help_text='Minutes between rechecks per ESI level, e.g. {"3": 60}')),
                ("suicide_screen_min_age_years", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="triage_settings", to="users.organization")),
            ],
        ),
    ]
