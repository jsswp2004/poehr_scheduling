"""
Dangerous drugs (RA 9165, Comprehensive Dangerous Drugs Act; regulated by PDEA and the Dangerous Drugs Board).

A medication counts as a dangerous drug when its orderable is flagged (`Orderable.is_dangerous_drug`) or its
generic name matches this list. The list is a starting point a clinic's pharmacist must review against the
current DDB schedules; it is configurable with the Django setting PHARMACY_DANGEROUS_DRUGS (a list of generic
names), which replaces this default. Tramadol is deliberately not listed: add it in the setting if the clinic
handles it as a dangerous drug.

Every other module asks `is_dangerous_drug()`; nothing else should keep its own list. Since the POWER Formulary,
the item's own flag decides (a pharmacist sets it in the Formulary); this list seeds new items and covers free-text
drugs that match no item.

REVIEW REQUIRED: before go-live, a licensed pharmacist must check DEFAULT_DANGEROUS_DRUGS (or the clinic's
PHARMACY_DANGEROUS_DRUGS setting) against the current PDEA / Dangerous Drugs Board schedules and regulations,
and repeat that check whenever the DDB amends them. This list is not a legal reference.
"""

import re

from django.conf import settings

# Starting list only; see REVIEW REQUIRED above.
DEFAULT_DANGEROUS_DRUGS = [
    "morphine",
    "hydromorphone",
    "oxycodone",
    "fentanyl",
    "methadone",
    "pethidine",
    "diazepam",
    "midazolam",
    "alprazolam",
    "lorazepam",
    "clonazepam",
    "phenobarbital",
    "methylphenidate",
]


def _norm(text):
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).split())


def dangerous_drug_names():
    configured = getattr(settings, "PHARMACY_DANGEROUS_DRUGS", None)
    names = configured if isinstance(configured, (list, tuple)) else DEFAULT_DANGEROUS_DRUGS
    return [_norm(n) for n in names if _norm(n)]


def is_dangerous_drug(name, orderable=None, organization=None):
    """
    Is this a dangerous drug? The formulary item decides when there is one (the orderable, else the item whose
    generic name the drug name contains), with the clinic's override; the name list is only the fallback for a
    free-text drug that matches no item.
    """
    if orderable is not None:
        if getattr(orderable, "pk", None) and getattr(orderable, "category", "") == "medication":
            from .formulary import flags_for

            return bool(flags_for(orderable, organization)[0])
        if getattr(orderable, "is_dangerous_drug", False):
            return True
    from .formulary import flags_for, match_item

    item = match_item(name, organization)
    if item is not None:
        return bool(flags_for(item, organization)[0])
    text = f" {_norm(name)} "
    return any(f" {n} " in text for n in dangerous_drug_names())
