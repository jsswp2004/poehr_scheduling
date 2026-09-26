# Phase 2 of the flowsheet feature: the flowsheet-builder engine.
#
# Adds FlowsheetTemplate / FlowsheetRowDefinition (mirroring
# NoteTemplate / NoteFieldDefinition), converts VitalSignsFlowsheet from a
# single hardcoded flowsheet type to a generic flowsheet-instance model
# (appointment goes from OneToOneField to ForeignKey since a visit can now
# have more than one flowsheet type at once), and seeds a "Vital Signs"
# FlowsheetTemplate + its rows from the layout that used to live in the
# VITAL_SIGNS_FLOWSHEET_SECTIONS constant, backfilling every existing
# VitalSignsFlowsheet row to point at it.
#
# template is added nullable first, backfilled by the data migration, then
# tightened to non-nullable in the same migration's final AlterField -- by
# the time that runs, every row has a value.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


VITAL_SIGNS_ROWS = [
    # (section_label, key, label, unit, field_type)
    ("Vital Signs", "temperature_f", "Temperature", "°F", "numeric"),
    ("Vital Signs", "heart_rate", "Heart Rate", "beats/min", "numeric"),
    ("Vital Signs", "resp_rate", "Respiratory Rate", "breaths/min", "numeric"),
    ("Vital Signs", "spo2", "SpO2", "%", "numeric"),
    ("Vital Signs", "bp_systolic", "Blood Pressure - Systolic", "mmHg", "numeric"),
    ("Vital Signs", "bp_diastolic", "Blood Pressure - Diastolic", "mmHg", "numeric"),
    ("Pain Assessment", "pain_score", "Pain Score", "0-10", "numeric"),
    ("Pain Assessment", "pain_location", "Pain Location", "", "text"),
    ("Pain Assessment", "pain_intervention", "Pain Intervention", "", "text"),
    ("Oxygen Therapy", "o2_fio2", "FiO2", "%", "numeric"),
    ("Oxygen Therapy", "o2_flow", "Flow", "L/min", "numeric"),
    ("Oxygen Therapy", "o2_device", "Device", "", "text"),
    ("Body Measurements", "height_in", "Height", "in", "numeric"),
    ("Body Measurements", "weight_lb", "Weight", "lbs", "numeric"),
]


def seed_vital_signs_template(apps, schema_editor):
    FlowsheetTemplate = apps.get_model("appointments", "FlowsheetTemplate")
    FlowsheetRowDefinition = apps.get_model("appointments", "FlowsheetRowDefinition")
    VitalSignsFlowsheet = apps.get_model("appointments", "VitalSignsFlowsheet")

    template, _ = FlowsheetTemplate.objects.get_or_create(
        code="vital_signs",
        defaults={"name": "Vital Sign Flowsheet", "sort_order": 0, "is_active": True},
    )

    for idx, (section_label, key, label, unit, field_type) in enumerate(VITAL_SIGNS_ROWS):
        FlowsheetRowDefinition.objects.get_or_create(
            template=template,
            key=key,
            defaults={
                "section_label": section_label,
                "label": label,
                "unit": unit,
                "field_type": field_type,
                "sort_order": idx * 10,
            },
        )

    # Every flowsheet instance that existed before this migration was a
    # Vital Signs flowsheet (it was the only type) -- point them all at the
    # template just seeded so the AlterField below can make it non-nullable.
    VitalSignsFlowsheet.objects.filter(template__isnull=True).update(template=template)


def noop_reverse(apps, schema_editor):
    # Nothing to undo -- reversing this migration drops the template FK
    # (AlterField/RemoveField below) before this would run anyway.
    pass


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0026_customuser_add_nurse_role"),
        ("appointments", "0037_vitalsignsflowsheet_created_by"),
    ]

    operations = [
        migrations.CreateModel(
            name="FlowsheetTemplate",
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
                    "code",
                    models.SlugField(
                        help_text="Stable machine key, e.g. 'vital_signs'",
                        max_length=64,
                        unique=True,
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        help_text="Display name, e.g. 'Vital Sign Flowsheet'",
                        max_length=128,
                    ),
                ),
                ("version", models.PositiveIntegerField(default=1)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "sort_order",
                    models.PositiveIntegerField(
                        default=0,
                        help_text="Controls this type's position in the Flowsheet dropdown",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        help_text="Leave blank for a template available to all organizations",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="flowsheet_templates",
                        to="users.organization",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.CreateModel(
            name="FlowsheetRowDefinition",
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
                    "section_label",
                    models.CharField(
                        help_text="Groups rows under a section header, e.g. 'Vital Signs'",
                        max_length=128,
                    ),
                ),
                (
                    "key",
                    models.SlugField(
                        help_text="Stable key this row's values are stored under in a flowsheet instance's data blob",
                        max_length=64,
                    ),
                ),
                ("label", models.CharField(max_length=200)),
                ("unit", models.CharField(blank=True, max_length=32)),
                (
                    "field_type",
                    models.CharField(
                        choices=[
                            ("numeric", "Numeric"),
                            ("text", "Text"),
                            ("dropdown", "Dropdown (dictionary)"),
                        ],
                        default="numeric",
                        max_length=20,
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "dictionary",
                    models.ForeignKey(
                        blank=True,
                        help_text="Required when field_type is 'dropdown'",
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        to="appointments.dictionary",
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rows",
                        to="appointments.flowsheettemplate",
                    ),
                ),
            ],
            options={
                "ordering": ["template", "sort_order"],
                "unique_together": {("template", "key")},
            },
        ),
        migrations.AlterField(
            model_name="vitalsignsflowsheet",
            name="appointment",
            field=models.ForeignKey(
                help_text="The visit this flowsheet charts readings for",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="vital_signs_flowsheets",
                to="appointments.appointment",
            ),
        ),
        migrations.AddField(
            model_name="vitalsignsflowsheet",
            name="template",
            field=models.ForeignKey(
                help_text="Which flowsheet type (row/section layout) this instance charts",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="instances",
                to="appointments.flowsheettemplate",
            ),
        ),
        migrations.RunPython(seed_vital_signs_template, noop_reverse),
        migrations.AlterField(
            model_name="vitalsignsflowsheet",
            name="template",
            field=models.ForeignKey(
                help_text="Which flowsheet type (row/section layout) this instance charts",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="instances",
                to="appointments.flowsheettemplate",
            ),
        ),
        migrations.AlterUniqueTogether(
            name="vitalsignsflowsheet",
            unique_together={("appointment", "template")},
        ),
    ]
