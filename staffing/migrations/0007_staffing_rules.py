import datetime
from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


# Seed values (kept inline so this migration never depends on later code changes).
SEEDS = [
    dict(
        state="MD", name="Maryland", hppd_min=Decimal("3.00"), min_licensed_hppd=None,
        min_cna_hppd=None, max_residents_per_staff=15, min_rn_per_shift=1,
        source="COMAR 10.07.02.19 (nursing homes) -- verify current text",
        notes="3.0 hrs per resident per day, 1 staff per 15 residents, RN on duty every shift.",
        effective_date=None, last_verified_date=None, needs_verification=False,
    ),
    dict(
        state="NY", name="New York", hppd_min=Decimal("3.50"), min_licensed_hppd=Decimal("1.10"),
        min_cna_hppd=Decimal("2.20"), max_residents_per_staff=None, min_rn_per_shift=0,
        source="N.Y. Pub. Health Law 2895-b; 10 NYCRR 415.13(b)(2)",
        notes=(
            "3.5 hrs/resident/day: at least 1.1 from RNs/LPNs and 2.2 from CNAs. The state "
            "measures compliance as a quarterly average, so a single day is a planning target."
        ),
        effective_date=datetime.date(2022, 4, 1), last_verified_date=datetime.date(2026, 10, 3),
        needs_verification=False,
    ),
    dict(
        state="CT", name="Connecticut", hppd_min=Decimal("3.00"), min_licensed_hppd=Decimal("0.84"),
        min_cna_hppd=None, max_residents_per_staff=None, min_rn_per_shift=0,
        source="Regs. Conn. State Agencies 19-13-D8t(m)(6); Conn. Gen. Stat. 19a-563h",
        notes=(
            "3.0 hrs/resident/day with at least 0.84 from licensed nurses. Day (7a-9p) 2.17 total / "
            "0.57 licensed; night (9p-7a) 0.83 total / 0.27 licensed -- the day/night split is shown "
            "for reference and is not enforced separately."
        ),
        effective_date=None, last_verified_date=None, needs_verification=True,
    ),
]


def seed_rules(apps, schema_editor):
    StaffingRule = apps.get_model("staffing", "StaffingRule")
    for seed in SEEDS:
        StaffingRule.objects.get_or_create(
            organization=None, state=seed["state"], is_seed=True,
            defaults=dict(seed, facility_type="nursing_home", status="active"),
        )


def unseed_rules(apps, schema_editor):
    apps.get_model("staffing", "StaffingRule").objects.filter(is_seed=True, organization__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0031_organization_address_state"),
        ("staffing", "0006_stafftimeoffrequest"),
    ]

    operations = [
        migrations.CreateModel(
            name="StaffingRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("state", models.CharField(blank=True, default="", help_text="Two-letter state code; blank for a custom standard.", max_length=2)),
                ("name", models.CharField(max_length=120)),
                ("facility_type", models.CharField(default="nursing_home", max_length=30)),
                ("hppd_min", models.DecimalField(decimal_places=2, help_text="Total care hours per resident per day.", max_digits=5)),
                ("min_licensed_hppd", models.DecimalField(blank=True, decimal_places=2, help_text="Minimum RN + LPN hours per resident per day.", max_digits=5, null=True)),
                ("min_cna_hppd", models.DecimalField(blank=True, decimal_places=2, help_text="Minimum CNA / aide hours per resident per day.", max_digits=5, null=True)),
                ("max_residents_per_staff", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("min_rn_per_shift", models.PositiveSmallIntegerField(default=0)),
                ("source", models.TextField(blank=True, default="", help_text="Regulation citation shown to admins.")),
                ("notes", models.TextField(blank=True, default="")),
                ("effective_date", models.DateField(blank=True, null=True)),
                ("last_verified_date", models.DateField(blank=True, null=True)),
                ("needs_verification", models.BooleanField(default=False)),
                ("status", models.CharField(choices=[("active", "Active"), ("draft", "Draft (not applied)"), ("inactive", "Inactive")], default="active", max_length=10)),
                ("is_seed", models.BooleanField(default=False, help_text="Created by the built-in seed data.")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(blank=True, help_text="Empty = shared state rule (system admins only).", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="staffing_rules", to="users.organization")),
            ],
            options={"ordering": ["state", "name", "id"]},
        ),
        migrations.AddIndex(
            model_name="staffingrule",
            index=models.Index(fields=["state", "status"], name="staffing_rule_state_idx"),
        ),
        migrations.CreateModel(
            name="StaffingRuleAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("rule_name", models.CharField(blank=True, default="", max_length=120)),
                ("action", models.CharField(choices=[("created", "Created"), ("updated", "Updated"), ("deactivated", "Deactivated"), ("duplicated", "Duplicated"), ("verified", "Marked verified"), ("selected", "Selected for organization")], max_length=20)),
                ("changes", models.JSONField(blank=True, default=dict)),
                ("changed_at", models.DateTimeField(auto_now_add=True)),
                ("changed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="users.organization")),
                ("rule", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_entries", to="staffing.staffingrule")),
            ],
            options={"ordering": ["-changed_at", "-id"]},
        ),
        migrations.CreateModel(
            name="OrgStaffingRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="staffing_rule_choice", to="users.organization")),
                ("rule", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="+", to="staffing.staffingrule")),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.RunPython(seed_rules, unseed_rules),
    ]
