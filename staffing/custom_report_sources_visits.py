"""
Visits data source for custom reports (registrations: ED, clinic and inpatient visits).

Aggregated by design: no patient name, contact or free text, only counts of distinct patients. Access follows
the "analytics.view" right, and a user assigned to specific facilities only sees visits placed in those
facilities (or not placed anywhere yet).
"""

import datetime

from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "analytics.view"

CARE = {"ambulatory": "Clinic", "emergency": "ED", "acute": "Inpatient"}
ADMISSION = {"scheduled": "Scheduled", "emergency": "Emergency", "direct": "Direct"}
ED_STATUS = {
    "wtbs": "Waiting to be seen", "tip": "Treatment in progress", "dispo": "Disposition pending",
    "admit_pending": "Admit pending", "discharge_pending": "Discharge pending",
}
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user, blank):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def load_visits(org, start, end, user=None):
    from django.db.models import Q

    from users.facility_scope import visit_facility_q
    from users.models import Registration

    qs = (
        Registration.objects.filter(organization=org)
        .filter(
            Q(arrival_time__date__gte=start, arrival_time__date__lte=end)
            | Q(arrival_time__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
        )
        .select_related("patient", "unit", "facility", "assigned_nurse", "attending_provider", "resident_provider")
        .order_by("id")
    )
    q = visit_facility_q(user)
    if q is not None:
        qs = qs.filter(q)

    rows = []
    for v in qs:
        when = _local(v.arrival_time or v.created_at)
        day = when.date()
        stay = None
        if v.arrival_time and v.discharge_datetime:
            stay = max((v.discharge_datetime - v.arrival_time).total_seconds() / 3600.0, 0)
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "hour": when.strftime("%H:00"),
                "care": CARE.get(v.care_setting, "Not set"),
                "admission": ADMISSION.get(v.admission_type, "Not set"),
                "facility": v.facility.name if v.facility_id else "No location",
                "unit": v.unit.name if v.unit_id else "No location",
                "status": "Discharged" if v.discharge_datetime else "In department",
                "ed_status": ED_STATUS.get(v.ed_status, "Not set") if v.ed_status else "Not set",
                "esi": "ESI %s" % v.esi if v.esi else "Not triaged",
                "attending": _person(v.attending_provider, "No attending"),
                "resident": _person(v.resident_provider, "No resident"),
                "nurse": _person(v.assigned_nurse, "No nurse"),
                "registered": "Complete" if v.registration_complete else "Incomplete",
                "_patient": v.patient.user_id,
                "visits": 1,
                "discharged": 1 if v.discharge_datetime else 0,
                "in_department": 0 if v.discharge_datetime else 1,
                "complete": 1 if v.registration_complete else 0,
                "los_hours": stay,
                "esi_level": v.esi or None,
            }
        )
    return rows


register(
    "visits", "Visits", "Visits",
    "One row per visit (ED, clinic or inpatient), with counts instead of patient names. Volume, acuity and length of stay.",
    [
        dim("date", "Date", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("hour", "Arrival hour"), dim("care", "Care setting"), dim("admission", "Admission type"),
        dim("facility", "Facility"), dim("unit", "Unit or clinic"), dim("status", "Status"), dim("ed_status", "ED status"),
        dim("esi", "Acuity (ESI)"), dim("attending", "Attending"), dim("resident", "Resident"), dim("nurse", "Assigned nurse"),
        dim("registered", "Registration"),
        measure("visits", "Visits"), measure("discharged", "Discharged"), measure("in_department", "Still in department"),
        measure("complete", "Registration complete"),
        measure("discharged_pct", "Discharged %", "percent", ratio=("discharged", "visits")),
        measure("complete_pct", "Registration complete %", "percent", ratio=("complete", "visits")),
        measure("los_hours", "Average stay (hours)", "hours", agg="avg"),
        measure("esi_level", "Average ESI level", agg="avg"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_visits,
    default_columns=["care", "visits", "patients", "discharged", "los_hours"],
    default_group="care",
    module="visits", right=RIGHT, scoped=True,
)
