import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0029_alter_customuser_role_staff"),
        ("staffing", "0004_staff_user"),
    ]

    operations = [
        migrations.CreateModel(
            name="Unit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                (
                    "shift_pattern",
                    models.CharField(
                        choices=[
                            ("8h", "8-hour shifts (Day / Evening / Night)"),
                            ("12h", "12-hour shifts (Day / Night)"),
                        ],
                        default="8h",
                        help_text="8-hour (Day/Evening/Night) or 12-hour (Day/Night) shifts for this unit.",
                        max_length=10,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("notes", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="staffing_units",
                        to="users.organization",
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
                "unique_together": {("organization", "name")},
            },
        ),
        migrations.CreateModel(
            name="UnitCensus",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField()),
                (
                    "census",
                    models.PositiveIntegerField(
                        help_text="Occupied beds / residents on this unit for this date."
                    ),
                ),
                ("notes", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "entered_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "unit",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="census_entries",
                        to="staffing.unit",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "unit census entries",
                "ordering": ["-date"],
                "unique_together": {("unit", "date")},
            },
        ),
        migrations.AddField(
            model_name="staff",
            name="nursing_role",
            field=models.CharField(
                choices=[
                    ("rn", "RN"),
                    ("lpn", "LPN"),
                    ("cna", "CNA / support"),
                    ("other", "Other (not counted toward HPPD)"),
                ],
                default="other",
                help_text=(
                    "Direct-care role used by the HPPD checks. Only RN, LPN and CNA "
                    "count toward required hours and staff ratios; 'other' does not."
                ),
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="staffrecurringpattern",
            name="unit",
            field=models.ForeignKey(
                blank=True,
                help_text="Unit this duty pattern covers. Blank = not tied to a unit.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="recurring_patterns",
                to="staffing.unit",
            ),
        ),
        migrations.AddField(
            model_name="staffshift",
            name="unit",
            field=models.ForeignKey(
                blank=True,
                help_text="Unit this shift is worked on. Blank = not tied to a unit.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="shifts",
                to="staffing.unit",
            ),
        ),
        migrations.AddField(
            model_name="shiftcoveragerequirement",
            name="unit",
            field=models.ForeignKey(
                blank=True,
                help_text="Unit this requirement applies to. Blank = whole organization (existing behavior).",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="coverage_requirements",
                to="staffing.unit",
            ),
        ),
        migrations.AddField(
            model_name="shiftcoveragerequirement",
            name="mode",
            field=models.CharField(
                choices=[
                    ("fixed", "Fixed minimum staff"),
                    ("hppd", "Calculated from census (HPPD)"),
                ],
                default="fixed",
                help_text=(
                    "'fixed' uses min_staff_required as typed. 'hppd' calculates the "
                    "requirement from the unit's census (Maryland hours + 1:15 ratio + RN)."
                ),
                max_length=10,
            ),
        ),
    ]
