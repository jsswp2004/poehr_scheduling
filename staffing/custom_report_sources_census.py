"""
Bed census data source for custom reports: a snapshot of every bed right now (not a date range).

No patient name or contact is a field, only whether a bed is occupied and for how long. Access follows the
"analytics.view" right, and a user assigned to specific facilities only sees beds in those facilities.
"""

from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "analytics.view"
CARE = {"outpatient": "Outpatient", "inpatient": "Inpatient", "emergency": "Emergency"}
STATUS = {"occupied": "Occupied", "available": "Available", "blocked": "Blocked", "cleaning": "Cleaning", "inactive": "Inactive"}


def load_census(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from appointments.locations import bed_status, occupied_beds
    from appointments.models import Bed

    qs = Bed.objects.filter(room__unit__facility__organization=org).select_related("room__unit__facility")
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(room__unit__facility_id__in=ids)
    occupied = occupied_beds(org)
    now = timezone.now()
    rows = []
    for b in qs.order_by("room__unit__facility__name", "room__unit__name", "room__name", "name"):
        unit = b.room.unit
        status = bed_status(b, occupied)
        reg = occupied.get(b.pk)
        stamp = (reg.arrival_time or reg.created_at) if reg else None
        rows.append(
            {
                "facility": unit.facility.name,
                "unit": unit.name,
                "care": CARE.get(unit.care_type, unit.care_type),
                "room": b.room.name,
                "bed": b.name,
                "status": STATUS.get(status, status),
                "beds": 1,
                "in_service": 0 if status == "inactive" else 1,
                "occupied": 1 if status == "occupied" else 0,
                "available": 1 if status == "available" else 0,
                "blocked": 1 if status == "blocked" else 0,
                "cleaning": 1 if status == "cleaning" else 0,
                "inactive": 1 if status == "inactive" else 0,
                "hours_occupied": max((now - stamp).total_seconds() / 3600.0, 0) if stamp else None,
            }
        )
    return rows


register(
    "bed_census", "Bed census (right now)", "Census",
    "A snapshot of every bed: occupied, available, blocked or cleaning, with no patient names. "
    "It shows today's picture, so the date range does not apply.",
    [
        dim("facility", "Facility"), dim("unit", "Unit"), dim("care", "Care type"), dim("room", "Room"), dim("bed", "Bed"),
        dim("status", "Status"),
        measure("beds", "Beds"), measure("in_service", "In service"), measure("occupied", "Occupied"),
        measure("available", "Available"), measure("blocked", "Blocked"), measure("cleaning", "Cleaning"),
        measure("inactive", "Inactive"),
        measure("occupancy_pct", "Occupancy %", "percent", ratio=("occupied", "in_service")),
        measure("available_pct", "Available %", "percent", ratio=("available", "in_service")),
        measure("hours_occupied", "Average hours occupied", agg="avg"),
    ],
    load_census,
    dated=False,
    default_columns=["unit", "beds", "occupied", "available", "blocked", "cleaning", "occupancy_pct"],
    default_group="unit",
    module="census", right=RIGHT, scoped=True,
)
