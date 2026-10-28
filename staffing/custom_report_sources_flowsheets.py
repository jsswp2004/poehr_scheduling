"""
Flowsheet data source for custom reports (vital signs, intake and output, and any other flowsheet type).

One row per charted value: a measure (Heart Rate, Urine output, ...) at one time on one visit. Group by the
measure to get averages, lowest and highest readings or total volumes. Patient names are masked by Hide PHI.
Access follows the "flowsheets.chart" right (chart and view flowsheets); a user assigned to specific facilities
only sees flowsheets from appointments in those facilities (or not tied to a location). Each run is audit-logged.
"""

import datetime
import re

from django.db.models import Q
from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "flowsheets.chart"
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_NUMBER = re.compile(r"^\s*[-+]?\d+(?:\.\d+)?")


def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def _number(value):
    m = _NUMBER.match(str(value))
    return float(m.group()) if m else None


def _stamp(text):
    try:
        dt = datetime.datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return _local(dt)


def load_flowsheets(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from appointments.models import VitalSignsFlowsheet

    qs = (
        VitalSignsFlowsheet.objects.filter(organization=org, updated_at__date__gte=start, created_at__date__lte=end)
        .select_related("patient", "template", "appointment__unit__facility")
        .prefetch_related("template__rows")
        .order_by("id")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))

    rows = []
    for sheet in qs:
        defs = {r.key: r for r in sheet.template.rows.all()}
        unit = sheet.appointment.unit if sheet.appointment.unit_id else None
        patient = _person(sheet.patient, "Unknown patient")
        for col in sheet.columns or []:
            when = _stamp(col.get("timestamp"))
            if when is None or not (start <= when.date() <= end):
                continue
            day = when.date()
            for key, cells in (sheet.data or {}).items():
                value = (cells or {}).get(col.get("id"))
                if value in (None, ""):
                    continue
                row = defs.get(key)
                num = _number(value)
                rows.append(
                    {
                        "date": day.isoformat(),
                        "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                        "month": day.strftime("%Y-%m"),
                        "weekday": WEEKDAYS[day.weekday()],
                        "hour": when.strftime("%H:00"),
                        "flowsheet": sheet.template.name,
                        "section": (row.section_label if row and row.section_label else "") or "Not set",
                        "item": row.label if row else key,
                        "units": (row.unit if row and row.unit else "") or "None",
                        "recorded_by": (col.get("recorded_by_name") or "").strip() or "Unknown",
                        "unit": unit.name if unit else "No location",
                        "facility": unit.facility.name if unit else "No location",
                        "patient": patient,
                        "_patient": sheet.patient_id,
                        "_sheet": sheet.pk,
                        "_column": f"{sheet.pk}:{col.get('id')}",
                        "readings": 1,
                        "numeric": 1 if num is not None else 0,
                        "avg_value": num,
                        "min_value": num,
                        "max_value": num,
                        "total_value": num,
                    }
                )
    return rows


register(
    "flowsheet_entries", "Flowsheet entries", "Flowsheets",
    "One row per charted value (vital signs, intake and output, ...). Group by the item to see averages, lowest, "
    "highest and total volumes. Each run is audit-logged.",
    [
        dim("date", "Date charted", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("hour", "Hour"), dim("flowsheet", "Flowsheet"), dim("section", "Section"), dim("item", "Item"),
        dim("units", "Units"), dim("recorded_by", "Charted by"), dim("unit", "Unit or clinic"), dim("facility", "Facility"),
        dim("patient", "Patient", phi="name"),
        measure("readings", "Charted values"), measure("numeric", "Numeric values"),
        measure("avg_value", "Average value", agg="avg"), measure("min_value", "Lowest value", agg="min"),
        measure("max_value", "Highest value", agg="max"), measure("total_value", "Total value (sum)"),
        measure("sheets", "Flowsheets", agg="distinct", of="_sheet"),
        measure("time_points", "Time points charted", agg="distinct", of="_column"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_flowsheets,
    default_columns=["item", "units", "readings", "avg_value", "min_value", "max_value", "patients"],
    default_group="item",
    module="flowsheets", right=RIGHT, scoped=True, patient_data=True,
)
