from django.db import migrations, models
import django.db.models.deletion


def starter_locations(apps, schema_editor):
    """Give every clinic one starter location with a Main outpatient unit, so pickers are never empty
    and existing visits and appointments (which keep their older typed text) have somewhere to land."""
    Organization = apps.get_model("users", "Organization")
    Facility = apps.get_model("appointments", "Facility")
    Unit = apps.get_model("appointments", "Unit")
    for org in Organization.objects.all():
        if Facility.objects.filter(organization=org).exists():
            continue
        facility = Facility.objects.create(organization=org, name=(org.name or "Main")[:120], kind="clinic")
        Unit.objects.create(facility=facility, name="Main", care_type="outpatient")


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0034_patient_header"),
        ("appointments", "0047_patient_header"),
    ]

    operations = [
        migrations.CreateModel(
            name="Facility",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("code", models.CharField(blank=True, max_length=20)),
                ("kind", models.CharField(choices=[("hospital", "Hospital"), ("clinic", "Clinic"), ("other", "Other")], default="hospital", max_length=10)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="facilities", to="users.organization")),
            ],
            options={"verbose_name_plural": "facilities", "ordering": ["name", "id"], "unique_together": {("organization", "name")}},
        ),
        migrations.CreateModel(
            name="Unit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("code", models.CharField(blank=True, max_length=20)),
                ("care_type", models.CharField(choices=[("outpatient", "Outpatient"), ("inpatient", "Inpatient"), ("emergency", "Emergency")], default="outpatient", max_length=12)),
                ("is_active", models.BooleanField(default=True)),
                ("facility", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="units", to="appointments.facility")),
            ],
            options={"ordering": ["name", "id"], "unique_together": {("facility", "name")}},
        ),
        migrations.CreateModel(
            name="Room",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=60)),
                ("is_active", models.BooleanField(default=True)),
                ("unit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rooms", to="appointments.unit")),
            ],
            options={"ordering": ["name", "id"], "unique_together": {("unit", "name")}},
        ),
        migrations.CreateModel(
            name="Bed",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=60)),
                ("is_active", models.BooleanField(default=True)),
                ("hold", models.CharField(blank=True, choices=[("", "None"), ("blocked", "Blocked"), ("cleaning", "Cleaning")], default="", max_length=10)),
                ("hold_reason", models.CharField(blank=True, max_length=200)),
                ("room", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="beds", to="appointments.room")),
            ],
            options={"ordering": ["name", "id"], "unique_together": {("room", "name")}},
        ),
        migrations.AddField(
            model_name="appointment",
            name="unit",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="appointments", to="appointments.unit"),
        ),
        migrations.RunPython(starter_locations, migrations.RunPython.noop),
    ]
