# POWER Formulary: a STARTER shared formulary of common Philippine National Formulary (PNF) essential medicines.
#
# STARTER, PHARMACIST REVIEW REQUIRED: these are well-established generic products and strengths only, loaded so a
# new clinic does not start from an empty formulary. A licensed pharmacist must review every item (strength, form,
# route, flags) against the current PNF before relying on it. Prices are deliberately left blank, and RxNorm codes
# are left blank rather than guessed (add them in the Formulary or by CSV).
#
# Why a data migration: Render runs `migrate` on every deploy, so the starter set arrives with the deploy and needs
# no one to run a command by hand (`python manage.py load_starter_formulary` re-runs the same load on demand).
# It is idempotent and never overwrites anything: an item is skipped when its code exists anywhere, or when a shared
# medication with the same generic name, strength and form already exists. Clinic overrides are never touched.
# Dangerous-drug and renal flags follow the same frozen reference lists as 0007.

import re

from django.db import migrations

NOTE = "starter, pharmacist review required"

# (generic name, strength, form, route, unit)
STARTER = [
    ("Paracetamol", "500 mg", "tablet", "PO", "tablet"),
    ("Ibuprofen", "400 mg", "tablet", "PO", "tablet"),
    ("Mefenamic acid", "500 mg", "capsule", "PO", "capsule"),
    ("Aspirin", "80 mg", "tablet", "PO", "tablet"),
    ("Amoxicillin", "500 mg", "capsule", "PO", "capsule"),
    ("Amoxicillin + clavulanic acid", "500 mg/125 mg", "tablet", "PO", "tablet"),
    ("Cefalexin", "500 mg", "capsule", "PO", "capsule"),
    ("Azithromycin", "500 mg", "tablet", "PO", "tablet"),
    ("Ciprofloxacin", "500 mg", "tablet", "PO", "tablet"),
    ("Metronidazole", "500 mg", "tablet", "PO", "tablet"),
    ("Sulfamethoxazole + trimethoprim", "800 mg/160 mg", "tablet", "PO", "tablet"),
    ("Ceftriaxone", "1 g", "injection", "IV", "vial"),
    ("Vancomycin", "500 mg", "injection", "IV", "vial"),
    ("Gentamicin", "40 mg/mL", "injection", "IM", "ampule"),
    ("Fluconazole", "150 mg", "capsule", "PO", "capsule"),
    ("Acyclovir", "400 mg", "tablet", "PO", "tablet"),
    ("Metformin", "500 mg", "tablet", "PO", "tablet"),
    ("Gliclazide", "80 mg", "tablet", "PO", "tablet"),
    ("Amlodipine", "5 mg", "tablet", "PO", "tablet"),
    ("Amlodipine", "10 mg", "tablet", "PO", "tablet"),
    ("Losartan potassium", "50 mg", "tablet", "PO", "tablet"),
    ("Captopril", "25 mg", "tablet", "PO", "tablet"),
    ("Metoprolol tartrate", "50 mg", "tablet", "PO", "tablet"),
    ("Hydrochlorothiazide", "25 mg", "tablet", "PO", "tablet"),
    ("Furosemide", "40 mg", "tablet", "PO", "tablet"),
    ("Furosemide", "10 mg/mL", "injection", "IV", "ampule"),
    ("Atorvastatin", "20 mg", "tablet", "PO", "tablet"),
    ("Simvastatin", "20 mg", "tablet", "PO", "tablet"),
    ("Clopidogrel", "75 mg", "tablet", "PO", "tablet"),
    ("Digoxin", "250 mcg", "tablet", "PO", "tablet"),
    ("Enoxaparin", "40 mg/0.4 mL", "injection", "SC", "prefilled syringe"),
    ("Omeprazole", "20 mg", "capsule", "PO", "capsule"),
    ("Loperamide", "2 mg", "capsule", "PO", "capsule"),
    ("Salbutamol", "100 mcg/dose", "inhaler", "Inhaled", "inhaler"),
    ("Prednisone", "10 mg", "tablet", "PO", "tablet"),
    ("Dexamethasone", "4 mg/mL", "injection", "IV", "ampule"),
    ("Cetirizine", "10 mg", "tablet", "PO", "tablet"),
    ("Allopurinol", "100 mg", "tablet", "PO", "tablet"),
    ("Ferrous sulfate", "325 mg", "tablet", "PO", "tablet"),
    ("Folic acid", "5 mg", "tablet", "PO", "tablet"),
    ("Ketorolac", "30 mg/mL", "injection", "IV", "ampule"),
    ("Morphine sulfate", "10 mg/mL", "injection", "IV", "ampule"),
    ("Diazepam", "5 mg", "tablet", "PO", "tablet"),
    ("Diazepam", "5 mg/mL", "injection", "IV", "ampule"),
    ("Midazolam", "1 mg/mL", "injection", "IV", "ampule"),
    ("Phenobarbital", "30 mg", "tablet", "PO", "tablet"),
]

DANGEROUS = [
    "morphine", "hydromorphone", "oxycodone", "fentanyl", "methadone", "pethidine", "diazepam", "midazolam",
    "alprazolam", "lorazepam", "clonazepam", "phenobarbital", "methylphenidate",
]
RENAL = {
    "enoxaparin": 30, "metformin": 30, "dabigatran": 30, "rivaroxaban": 30, "nitrofurantoin": 30, "sulfamethoxazole": 30,
    "piperacillin": 40, "meropenem": 50, "imipenem": 50, "vancomycin": 50, "levofloxacin": 50, "ciprofloxacin": 50,
    "acyclovir": 50, "valacyclovir": 50, "ganciclovir": 70, "fluconazole": 50, "digoxin": 50, "lithium": 50,
    "allopurinol": 50, "gabapentin": 60, "pregabalin": 60, "cefepime": 60, "gentamicin": 60, "amikacin": 60,
}


def _norm(text):
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).split())


def code_for(generic, strength, form):
    return ("pnf_" + re.sub(r"[^a-z0-9]+", "_", f"{generic} {strength} {form}".lower()).strip("_"))[:64]


def load_starter(apps, schema_editor=None):
    """Create the starter items that are missing. Returns how many were created."""
    Orderable = apps.get_model("appointments", "Orderable")
    FormularyChange = apps.get_model("pharmacy", "FormularyChange")
    created = 0
    for generic, strength, form, route, unit in STARTER:
        code = code_for(generic, strength, form)
        if Orderable.objects.filter(code__iexact=code).exists():
            continue
        if Orderable.objects.filter(organization__isnull=True, category="medication", generic_name__iexact=generic,
                                    strength__iexact=strength, form__iexact=form).exists():
            continue
        text = f" {_norm(generic)} "
        item = Orderable.objects.create(
            code=code, name=f"{generic} {strength} {form}", category="medication", organization=None,
            generic_name=generic, strength=strength, form=form, default_route=route, code_system="local",
            is_dangerous_drug=any(f" {d} " in text for d in DANGEROUS),
            renal_threshold_crcl=next((v for d, v in RENAL.items() if f" {d} " in text), None),
            description=f"POWER starter formulary ({NOTE}). Dispensing unit: {unit}.",
            default_priority="routine", is_active=True,
        )
        FormularyChange.objects.create(
            organization=None, orderable=item, source="starter",
            changes={"created": [None, f"{generic} {strength} {form}"], "note": [None, NOTE]},
        )
        created += 1
    return created


def forwards(apps, schema_editor):
    load_starter(apps, schema_editor)


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0007_formulary_flags"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
