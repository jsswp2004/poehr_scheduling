"""
Fishbone lab panels: the latest value of each analyte of the basic metabolic panel (BMP), the
complete blood count (CBC) and a few other labs a clinician wants at a glance.

The values come from the patient's lab reports (LabResultItem). An analyte is found by its LOINC code
first, then by its name (labs name things differently: "Sodium", "Sodium, Serum", "Na"). Only the
newest report with the analyte counts; the one before it is kept so the screen can show a trend arrow.
Reports marked "entered in error" are never used.
"""

import re
from decimal import Decimal, InvalidOperation

from .models import LabResultItem

# key, label, LOINC codes, names (normalised, see _norm)
BMP = [
    ("na", "Na", ["2951-2", "2947-0"], ["sodium", "na"]),
    ("k", "K", ["2823-3", "6298-4"], ["potassium", "k"]),
    ("cl", "Cl", ["2075-0", "2069-3"], ["chloride", "cl"]),
    ("co2", "CO2", ["2028-9", "1963-8"], ["co2", "carbon dioxide", "bicarbonate", "hco3"]),
    ("bun", "BUN", ["3094-0"], ["bun", "urea nitrogen", "urea nitrogen blood", "blood urea nitrogen"]),
    ("cr", "Cr", ["2160-0", "38483-4"], ["creatinine", "cr"]),
    ("glu", "Glu", ["2345-7", "2339-0", "41653-7"], ["glucose", "glu"]),
]
CBC = [
    ("wbc", "WBC", ["6690-2", "26464-8"], ["wbc", "white blood cell", "white cell", "leukocytes"]),
    ("hgb", "Hgb", ["718-7"], ["hemoglobin", "hgb", "hb"]),
    ("hct", "Hct", ["4544-3", "20570-8"], ["hematocrit", "hct"]),
    ("plt", "Plt", ["777-3", "26515-7"], ["platelet", "platelets", "plt"]),
]
OTHER = [
    ("ca", "Ca", ["17861-6"], ["calcium", "ca"]),
    ("mg", "Mg", ["19123-9"], ["magnesium", "mg"]),
    ("phos", "Phos", ["2777-1"], ["phosphorus", "phosphate", "phos"]),
    ("inr", "INR", ["6301-6", "34714-6"], ["inr"]),
    ("lactate", "Lactate", ["2524-7", "32693-4"], ["lactate", "lactic acid"]),
    ("a1c", "A1c", ["4548-4", "17856-6"], ["hemoglobin a1c", "a1c", "hba1c"]),
    ("tsh", "TSH", ["3016-3"], ["tsh", "thyroid stimulating hormone"]),
]
PANELS = [("bmp", "BMP", BMP), ("cbc", "CBC", CBC), ("other", "Other labs", OTHER)]

_FILLER = {"serum", "plasma", "level", "count", "total", "whole", "venous"}
CRITICAL = {"LL", "HH"}


def _norm(name):
    """'Sodium, Serum' -> 'sodium'; 'WBC Count' -> 'wbc'; 'Hemoglobin A1c' stays as it is."""
    words = re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).split()
    return " ".join(w for w in words if w not in _FILLER)


def _number(item):
    if item.value_numeric is not None:
        return item.value_numeric
    try:
        return Decimal(str(item.value).strip())
    except (InvalidOperation, ValueError):
        return None


def flag_of(item):
    """The flag the lab sent, or H / L worked out from the reference range when it sent none."""
    if item.abnormal_flag:
        return item.abnormal_flag
    number = _number(item)
    if number is None:
        return ""
    if item.ref_low is not None and number < item.ref_low:
        return "L"
    if item.ref_high is not None and number > item.ref_high:
        return "H"
    return ""


def _when(report):
    return report.collected_at or report.resulted_at or report.created_at


def _index():
    by_loinc, by_name = {}, {}
    for panel_key, _title, cells in PANELS:
        for key, _label, codes, names in cells:
            for code in codes:
                by_loinc[code] = key
            for name in names:
                by_name[name] = key
    return by_loinc, by_name


_BY_LOINC, _BY_NAME = _index()


def _trend(latest, previous):
    a, b = _number(latest), _number(previous) if previous is not None else None
    if a is None or b is None:
        return ""
    return "up" if a > b else "down" if a < b else "same"


def latest_values(patient, limit=800):
    """{analyte key: {'latest': item, 'previous': item or None}} for the patient's newest results."""
    items = (
        LabResultItem.objects.filter(report__patient=patient)
        .exclude(report__status="entered_in_error")
        .select_related("report")
        .order_by("-report__created_at", "report_id", "sort_order", "id")[:limit]
    )
    ranked = sorted(items, key=lambda i: (_when(i.report), i.report_id, -i.sort_order), reverse=True)
    found = {}
    for item in ranked:
        key = _BY_LOINC.get((item.loinc_code or "").strip()) or _BY_NAME.get(_norm(item.test_name))
        if not key:
            continue
        slot = found.setdefault(key, {"latest": None, "previous": None})
        if slot["latest"] is None:
            slot["latest"] = item
        elif slot["previous"] is None and item.report_id != slot["latest"].report_id:
            slot["previous"] = item
    return found


def _cell(key, label, slot):
    item = slot["latest"] if slot else None
    if item is None:
        return {"key": key, "label": label, "value": None}
    prev = slot["previous"]
    return {
        "key": key,
        "label": label,
        "value": item.value,
        "units": item.units,
        "reference": item.reference_range,
        "flag": flag_of(item),
        "critical": flag_of(item) in CRITICAL,
        "at": _when(item.report).isoformat(),
        "report": item.report_id,
        "report_title": item.report.title,
        "previous": {"value": prev.value, "at": _when(prev.report).isoformat()} if prev is not None else None,
        "trend": _trend(item, prev),
    }


def panels_for(patient):
    """The fishbone panels that have at least one value, each with its cells in a fixed order."""
    found = latest_values(patient)
    out = []
    for panel_key, title, cells in PANELS:
        built = [_cell(key, label, found.get(key)) for key, label, _codes, _names in cells]
        have = [c for c in built if c["value"] is not None]
        if not have:
            continue
        out.append({"key": panel_key, "title": title, "at": max(c["at"] for c in have), "cells": built})
    return out
