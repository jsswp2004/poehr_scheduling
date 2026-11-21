"""
Renally cleared drugs: the creatinine clearance (mL/min, Cockcroft-Gault) below which an order needs a dose or
interval review. Ordering one of these for a patient whose CrCl is below its threshold raises a HIGH-severity
renal alert, which the pharmacist must acknowledge with a reason before verifying. Any other medication for a
patient with CrCl below 30 still gets a moderate renal warning.

This is a starting list, not a dosing reference. A pharmacist must review it (drugs and thresholds) against the
clinic's references and formulary before relying on it. Replace it with the Django setting PHARMACY_RENAL_DRUGS,
a dict of {generic name: CrCl threshold}.

Every other module asks `renal_threshold()`; nothing else should keep its own list.
"""

import re

from django.conf import settings

DEFAULT_RENAL_DRUGS = {
    "enoxaparin": 30,
    "metformin": 30,
    "dabigatran": 30,
    "rivaroxaban": 30,
    "nitrofurantoin": 30,
    "sulfamethoxazole": 30,
    "piperacillin": 40,
    "meropenem": 50,
    "imipenem": 50,
    "vancomycin": 50,
    "levofloxacin": 50,
    "ciprofloxacin": 50,
    "acyclovir": 50,
    "valacyclovir": 50,
    "ganciclovir": 70,
    "fluconazole": 50,
    "digoxin": 50,
    "lithium": 50,
    "allopurinol": 50,
    "gabapentin": 60,
    "pregabalin": 60,
    "cefepime": 60,
    "gentamicin": 60,
    "amikacin": 60,
}


def _norm(text):
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).split())


def renal_drugs():
    configured = getattr(settings, "PHARMACY_RENAL_DRUGS", None)
    table = configured if isinstance(configured, dict) else DEFAULT_RENAL_DRUGS
    return {_norm(k): float(v) for k, v in table.items() if _norm(k)}


def renal_threshold(name):
    """(generic name, CrCl threshold) for the first listed drug the name contains, else (None, None)."""
    text = f" {_norm(name)} "
    for drug, threshold in renal_drugs().items():
        if f" {drug} " in text:
            return drug, threshold
    return None, None
