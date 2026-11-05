"""
Scheduling data source for custom reports (appointments).

Aggregated by design: there is no patient name or contact column, only counts of distinct patients. Access
follows the "analytics.view" right (the one behind the Analytics page), and a user assigned to specific
facilities only sees appointments placed in those facilities (or not placed anywhere yet).
"""

import datetime

from django.db.models import Q
from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "analytics.view"

STATUS_LABELS = {
    "scheduled": "Scheduled",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "no_show": "No show",
    "rescheduled": "Rescheduled",
    "pending": "Pending request",
    "in_progress": "In progress",
}
RECURRENCE_LABELS = {"none": "One-time", "daily": "Daily", "weekly": "Weekly", "monthly": "Monthly"}
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user):
    if not user:
        return "No provider"
    return (user.get_full_name() or user.get_username() or "No provider").strip() or "No provider"


def load_appointments(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from appointments.models import Appointment

    qs = (
        Appointment.all_objects.filter(
            organization=org, appointment_datetime__date__gte=start, appointment_datetime__date__lte=end
        )
        .select_related("provider", "unit", "unit__facility")
        .order_by("appointment_datetime")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(unit__facility_id__in=ids) | Q(unit__isnull=True))

    rows = []
    for a in qs:
        when = _local(a.appointment_datetime)
        day = when.date()
        created = _local(a.created_at).date() if a.created_at else day
        no_show = a.status == "no_show" or bool(a.no_show)
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "hour": when.strftime("%H:00"),
                "provider": _person(a.provider),
                "unit": a.unit.name if a.unit_id else "No location",
                "facility": a.unit.facility.name if a.unit_id else "No location",
                "visit_type": "Video" if a.is_video else "In person",
                "status": "No show" if no_show else STATUS_LABELS.get(a.status, a.status.replace("_", " ").capitalize()),
                "recurrence": RECURRENCE_LABELS.get(a.recurrence, a.recurrence),
                "arrived": "Yes" if a.arrived else "No",
                "_patient": a.patient_id,
                "appointments": 1,
                "completed": 1 if a.status == "completed" else 0,
                "cancelled": 1 if a.status == "cancelled" else 0,
                "no_shows": 1 if no_show else 0,
                "arrivals": 1 if a.arrived else 0,
                "hours_booked": (a.duration_minutes or 0) / 60.0,
                "minutes": a.duration_minutes or 0,
                "lead_days": max((day - created).days, 0),
            }
        )
    return rows


register(
    "appointments", "Appointments", "Appointments",
    "One row per appointment, with counts instead of patient names. Booked time, outcomes and lead time.",
    [
        dim("date", "Date", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("hour", "Start hour"), dim("provider", "Provider"), dim("unit", "Unit or clinic"), dim("facility", "Facility"),
        dim("visit_type", "Visit type"), dim("status", "Status"), dim("recurrence", "Repeats"), dim("arrived", "Arrived"),
        measure("appointments", "Appointments"), measure("completed", "Completed"), measure("cancelled", "Cancelled"),
        measure("no_shows", "No shows"), measure("arrivals", "Arrived"),
        measure("completion_pct", "Completed %", "percent", ratio=("completed", "appointments")),
        measure("cancel_pct", "Cancelled %", "percent", ratio=("cancelled", "appointments")),
        measure("no_show_pct", "No-show %", "percent", ratio=("no_shows", "appointments")),
        measure("arrival_pct", "Arrived %", "percent", ratio=("arrivals", "appointments")),
        measure("hours_booked", "Hours booked", "hours"),
        measure("minutes", "Average visit (minutes)", agg="avg"),
        measure("lead_days", "Average days booked ahead", agg="avg"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_appointments,
    default_columns=["provider", "appointments", "completed", "cancelled", "no_shows", "no_show_pct"],
    default_group="provider",
    module="scheduling", right=RIGHT, scoped=True,
)
