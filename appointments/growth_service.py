"""Reads a patient's height, weight and head circumference from their flowsheets, ready for the growth charts."""
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from . import growth_engine as engine
from .models import VitalSignsFlowsheet

WEIGHT_ROWS = ["weight_lb", "weight"]            # pounds
HEIGHT_ROWS = ["height_in", "height"]            # inches
HEAD_ROWS = [("head_circumference_cm", 1.0), ("head_circumference_in", engine.CM_PER_IN)]
# Anything outside these is almost certainly a typing slip; it is left off the chart and counted instead.
PLAUSIBLE = {"weight_kg": (0.3, 300.0), "height_cm": (25.0, 250.0), "head_cm": (20.0, 70.0)}


def _day(text):
    when = parse_datetime(str(text or ""))
    if when is None:
        return None, None
    if timezone.is_aware(when):
        when = timezone.localtime(when)
    return when.date(), when


def _number(raw):
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        return None


def measurements_for(patient):
    """([{date, weight_kg, height_cm, head_cm}, ...] oldest first, number of values left off as implausible)."""
    found = {}  # (date, field) -> (time, value)

    def keep(day, when, field, value):
        if value is None:
            return
        low, high = PLAUSIBLE[field]
        if not low <= value <= high:
            found.setdefault("skipped", set()).add((day, field, round(value, 3)))
            return
        current = found.get((day, field))
        if current is None or when >= current[0]:
            found[(day, field)] = (when, value)

    for sheet in VitalSignsFlowsheet.objects.filter(patient=patient).only("columns", "data"):
        columns = {c.get("id"): _day(c.get("timestamp")) for c in (sheet.columns or []) if isinstance(c, dict)}
        data = sheet.data or {}
        for names, field, scale in (
            (WEIGHT_ROWS, "weight_kg", engine.KG_PER_LB),
            (HEIGHT_ROWS, "height_cm", engine.CM_PER_IN),
        ):
            for name in names:
                for column_id, raw in (data.get(name) or {}).items():
                    day, when = columns.get(column_id, (None, None))
                    value = _number(raw)
                    if day is not None and value is not None:
                        keep(day, when, field, value * scale)
        for name, scale in HEAD_ROWS:
            for column_id, raw in (data.get(name) or {}).items():
                day, when = columns.get(column_id, (None, None))
                value = _number(raw)
                if day is not None and value is not None:
                    keep(day, when, "head_cm", value * scale)
    skipped = len(found.pop("skipped", ()))
    days = sorted({day for (day, _field) in found})
    rows = []
    for day in days:
        row = {"date": day}
        for field in ("weight_kg", "height_cm", "head_cm"):
            hit = found.get((day, field))
            row[field] = round(hit[1], 3) if hit else None
        rows.append(row)
    return rows, skipped
