"""
Orders data source for custom reports (lab, imaging, procedure, nursing and other orders).

Patient names, the reason for the order, the result text and the discontinue reason are fields that Hide PHI
masks. Access follows the "orders.view" right; a user assigned to specific facilities only sees orders placed
from appointments in those facilities (or not tied to a location). Each run is audit-logged.
"""

import datetime

from django.db.models import Q
from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "orders.view"
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
CATEGORY = {
    "laboratory": "Laboratory", "imaging": "Imaging", "procedure": "Procedure", "referral": "Referral",
    "nursing": "Nursing", "medication": "Medication", "other": "Other",
}
PRIORITY = {"routine": "Routine", "urgent": "Urgent", "stat": "STAT"}
STATUS = {
    "draft": "Draft", "pending_cosign": "Pending cosign", "active": "Active", "in_progress": "In progress",
    "completed": "Completed", "discontinued": "Discontinued",
}
INTERFACE = {"not_sent": "Not sent", "queued": "Queued", "sent": "Sent", "acknowledged": "Acknowledged", "error": "Error"}


def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def _hours(a, b):
    return max((b - a).total_seconds() / 3600.0, 0) if a and b else None


def load_orders(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from appointments.models import Order

    qs = (
        Order.objects.filter(organization=org, created_at__date__gte=start, created_at__date__lte=end)
        .select_related("patient", "ordering_provider", "signed_by", "completed_by", "appointment__unit__facility")
        .order_by("created_at")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))

    rows = []
    for o in qs:
        day = _local(o.created_at).date()
        unit = o.appointment.unit if o.appointment_id and o.appointment.unit_id else None
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "category": CATEGORY.get(o.orderable_category, (o.orderable_category or "Other").capitalize()),
                "order": o.orderable_name or "Unknown",
                "priority": PRIORITY.get(o.priority, o.priority),
                "status": STATUS.get(o.status, o.status),
                "interface": INTERFACE.get(o.interface_status, o.interface_status),
                "ordered_by": _person(o.ordering_provider),
                "signed_by": _person(o.signed_by, "Not signed"),
                "completed_by": _person(o.completed_by, "Not completed"),
                "cosign": "Required" if o.cosign_required else "Not required",
                "unit": unit.name if unit else "No location",
                "facility": unit.facility.name if unit else "No location",
                "patient": _person(o.patient, "Unknown patient"),
                "indication": (o.indication or "").strip() or None,
                "result": (o.result_text or "").strip() or None,
                "discontinue_reason": (o.discontinue_reason or "").strip() or None,
                "_patient": o.patient_id,
                "orders": 1,
                "signed": 1 if o.signed_at else 0,
                "completed": 1 if o.status == "completed" else 0,
                "discontinued": 1 if o.status == "discontinued" else 0,
                "stat": 1 if o.priority == "stat" else 0,
                "awaiting_cosign": 1 if o.status == "pending_cosign" else 0,
                "interface_errors": 1 if o.interface_status == "error" else 0,
                "hours_to_sign": _hours(o.created_at, o.signed_at),
                "hours_to_complete": _hours(o.signed_at or o.created_at, o.completed_at),
            }
        )
    return rows


register(
    "orders", "Orders", "Orders",
    "One row per order: what was ordered, by whom, priority, status and turnaround. Each run is audit-logged.",
    [
        dim("date", "Date ordered", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("category", "Category"), dim("order", "Order"), dim("priority", "Priority"), dim("status", "Status"),
        dim("interface", "Interface status"), dim("ordered_by", "Ordered by"), dim("signed_by", "Signed by"),
        dim("completed_by", "Completed by"), dim("cosign", "Cosign"), dim("unit", "Unit or clinic"), dim("facility", "Facility"),
        dim("patient", "Patient", phi="name"), dim("indication", "Reason for order", phi="text"),
        dim("result", "Result text", phi="text"), dim("discontinue_reason", "Discontinue reason", phi="text"),
        measure("orders", "Orders"), measure("signed", "Signed"), measure("completed", "Completed"),
        measure("discontinued", "Discontinued"), measure("stat", "STAT orders"),
        measure("awaiting_cosign", "Awaiting cosign"), measure("interface_errors", "Interface errors"),
        measure("completed_pct", "Completed %", "percent", ratio=("completed", "orders")),
        measure("stat_pct", "STAT %", "percent", ratio=("stat", "orders")),
        measure("hours_to_sign", "Average hours to sign", agg="avg"),
        measure("hours_to_complete", "Average hours to complete", agg="avg"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_orders,
    default_columns=["category", "orders", "completed", "stat", "hours_to_complete"],
    default_group="category",
    module="orders", right=RIGHT, scoped=True, patient_data=True,
)
