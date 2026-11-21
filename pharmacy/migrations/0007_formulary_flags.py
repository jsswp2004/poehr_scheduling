# POWER Formulary: move the dangerous-drug and renal lists onto the items (one time).
#
# Every existing medication orderable whose generic name (or name) is on the reference lists gets the dangerous-drug
# flag and/or the renal CrCl threshold, and the change is written to the formulary history (source "migration").
# Only flags are turned ON / thresholds filled in where blank: nothing a clinic already set is changed. A clinic that
# replaced the lists with the PHARMACY_DANGEROUS_DRUGS / PHARMACY_RENAL_DRUGS settings gets those instead.
# The lists below are frozen copies of pharmacy/dangerous_drugs.py and pharmacy/renal_drugs.py as of this migration.

import re

from django.conf import settings
from django.db import migrations

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


def seed_flags(apps, schema_editor):
    Orderable = apps.get_model("appointments", "Orderable")
    FormularyChange = apps.get_model("pharmacy", "FormularyChange")
    configured_dd = getattr(settings, "PHARMACY_DANGEROUS_DRUGS", None)
    configured_renal = getattr(settings, "PHARMACY_RENAL_DRUGS", None)
    dangerous = [_norm(n) for n in (configured_dd if isinstance(configured_dd, (list, tuple)) else DANGEROUS)]
    renal = {_norm(k): int(v) for k, v in (configured_renal if isinstance(configured_renal, dict) else RENAL).items()}
    for item in Orderable.objects.filter(category="medication"):
        text = f" {_norm(item.generic_name)} {_norm(item.name)} "
        changes = {}
        if not item.is_dangerous_drug and any(f" {n} " in text for n in dangerous if n):
            item.is_dangerous_drug = True
            changes["dangerous_drug"] = [False, True]
        if item.renal_threshold_crcl is None:
            threshold = next((v for n, v in renal.items() if n and f" {n} " in text), None)
            if threshold is not None:
                item.renal_threshold_crcl = threshold
                changes["renal_threshold_crcl"] = [None, threshold]
        if changes:
            item.save(update_fields=["is_dangerous_drug", "renal_threshold_crcl"])
            FormularyChange.objects.create(organization_id=item.organization_id, orderable=item, source="migration", changes=changes)


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0006_formulary"),
    ]

    operations = [
        migrations.RunPython(seed_flags, migrations.RunPython.noop),
    ]
