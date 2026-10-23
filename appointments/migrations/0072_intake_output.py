# Intake & Output flowsheet: the clinic's alert settings, plus the seeded "intake_output" flowsheet template.
# The template is only created if it does not exist (never overwritten), so a clinic's edits in the Flowsheet
# Builder survive. Reverse removes the template only when no visit has charted on it.

from django.db import migrations, models
import django.db.models.deletion

DICTIONARIES = {
    "io_urine_appearance": ("Urine appearance", [
        ("clear_yellow", "Clear, yellow"), ("dark_amber", "Dark amber"), ("cloudy", "Cloudy"),
        ("pink_red", "Pink or red (blood)"), ("tea_colored", "Tea or cola colored"), ("other", "Other"),
    ]),
}

# (section, key, label, unit, type, dictionary)
ROWS = [
    ("Intake", "oral_fluids", "Oral fluids", "mL", "numeric", None),
    ("Intake", "ice_chips", "Ice chips (frozen volume, counts half)", "mL", "numeric", None),
    ("Intake", "iv_fluids", "IV fluids", "mL", "numeric", None),
    ("Intake", "iv_fluid_name", "IV fluid and rate", "", "text", None),
    ("Intake", "blood_products", "Blood and blood products", "mL", "numeric", None),
    ("Intake", "blood_product_name", "Blood product and unit number", "", "text", None),
    ("Intake", "tpn_lipids", "TPN and lipids", "mL", "numeric", None),
    ("Intake", "tube_feeding", "Tube feeding", "mL", "numeric", None),
    ("Intake", "flushes", "Flushes (free water, medication)", "mL", "numeric", None),
    ("Intake", "irrigation_in", "Irrigation instilled (not intake)", "mL", "numeric", None),
    ("Output", "urine_voided", "Urine, voided", "mL", "numeric", None),
    ("Output", "urine_appearance", "Urine appearance", "", "dropdown", "io_urine_appearance"),
    ("Output", "incontinence_episodes", "Incontinent episodes", "count", "numeric", None),
    ("Output", "urine_catheter", "Urine, catheter drainage", "mL", "numeric", None),
    ("Output", "stool", "Stool, liquid or ostomy", "mL", "numeric", None),
    ("Output", "stool_description", "Stool consistency and color", "", "text", None),
    ("Output", "emesis", "Emesis", "mL", "numeric", None),
    ("Output", "emesis_description", "Emesis color and appearance", "", "text", None),
    ("Output", "drain_1", "Drain 1 (JP, chest tube, wound)", "mL", "numeric", None),
    ("Output", "drain_2", "Drain 2", "mL", "numeric", None),
    ("Output", "drain_3", "Drain 3", "mL", "numeric", None),
    ("Output", "suction", "Gastric or respiratory suction", "mL", "numeric", None),
    ("Output", "blood_loss", "Blood loss", "mL", "numeric", None),
    ("Notes", "io_comment", "Comment", "", "text", None),
]


def seed(apps, schema_editor):
    Dictionary = apps.get_model("appointments", "Dictionary")
    DictionaryItem = apps.get_model("appointments", "DictionaryItem")
    Template = apps.get_model("appointments", "FlowsheetTemplate")
    Row = apps.get_model("appointments", "FlowsheetRowDefinition")
    dictionaries = {}
    for code, (name, items) in DICTIONARIES.items():
        dictionary, _ = Dictionary.objects.get_or_create(code=code, defaults={"name": name})
        for i, (value, label) in enumerate(items):
            DictionaryItem.objects.get_or_create(dictionary=dictionary, value=value, defaults={"label": label, "sort_order": i * 10})
        dictionaries[code] = dictionary
    template, created = Template.objects.get_or_create(
        code="intake_output", defaults={"name": "Intake & Output", "sort_order": 20, "is_active": True}
    )
    if not created:
        return
    for i, (section, key, label, unit, ftype, dic) in enumerate(ROWS):
        Row.objects.get_or_create(
            template=template, key=key,
            defaults={"section_label": section, "label": label, "unit": unit, "field_type": ftype,
                      "dictionary": dictionaries.get(dic), "sort_order": (i + 1) * 10},
        )


def unseed(apps, schema_editor):
    Template = apps.get_model("appointments", "FlowsheetTemplate")
    Sheet = apps.get_model("appointments", "VitalSignsFlowsheet")
    template = Template.objects.filter(code="intake_output").first()
    if template and not Sheet.objects.filter(template=template).exists():
        template.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("appointments", "0071_seed_ambulatory_notes"),
        ("users", "0047_patient_birth_details"),
    ]
    operations = [
        migrations.CreateModel(
            name="IntakeOutputSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("shift_starts", models.JSONField(blank=True, default=list, help_text="Shift start times, 24-hour HH:MM; blank = 07:00 and 19:00")),
                ("low_urine_ml_kg_h", models.FloatField(blank=True, default=0.5, null=True, help_text="Alert below this urine rate (mL/kg/h); blank = off")),
                ("no_urine_hours", models.PositiveSmallIntegerField(blank=True, default=6, null=True, help_text="Alert after this many hours with no urine; blank = off")),
                ("low_urine_24h_ml", models.PositiveIntegerField(blank=True, default=800, null=True, help_text="Alert when 24-hour urine is below this (mL); blank = off")),
                ("positive_balance_24h_ml", models.PositiveIntegerField(blank=True, default=2000, null=True, help_text="Alert when 24-hour net is above this (mL); blank = off")),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="intake_output_settings", to="users.organization")),
            ],
        ),
        migrations.RunPython(seed, unseed),
    ]
