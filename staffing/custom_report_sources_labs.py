"""
Lab results data source for custom reports (one row per lab report).

Patient names, the lab comment and the review comment are fields that Hide PHI masks. Access follows the
"lab_results.view" right; a user assigned to specific facilities only sees reports tied to a visit in those
facilities (or not tied to a location). Each run is audit-logged.
"""

import datetime

from django.db.models import Q
from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "lab_results.view"
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
SOURCE = {"manual": "Entered by hand", "scan": "Scanned document", "interface": "Lab interface"}
STATUS = {"preliminary": "Preliminary", "final": "Final", "corrected": "Corrected", "entered_in_error": "Entered in error"}
REVIEW = {"unreviewed": "Not yet reviewed", "reviewed": "Reviewed"}
CRITICAL = ("LL", "HH")


def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def _hours(a, b):
    return max((b - a).total_seconds() / 3600.0, 0) if a and b else None


def load_labs(org, start, end, user=None):
    from users.facility_scope import visit_facility_q

    from appointments.models import LabReport

    when = "resulted_at"
    qs = (
        LabReport.objects.filter(organization=org)
        .filter(
            Q(resulted_at__date__gte=start, resulted_at__date__lte=end)
            | Q(resulted_at__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
        )
        .select_related("patient", "entered_by", "reviewed_by", "visit__unit", "visit__facility")
        .prefetch_related("items")
        .order_by("id")
    )
    q = visit_facility_q(user, prefix="visit__")
    if q is not None:
        qs = qs.filter(q | Q(visit__isnull=True))

    rows = []
    for r in qs:
        stamp = _local(getattr(r, when) or r.created_at)
        day = stamp.date()
        items = list(r.items.all())
        v = r.visit if r.visit_id else None
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "panel": (r.title or "").strip() or "Untitled",
                "source": SOURCE.get(r.source, r.source),
                "status": STATUS.get(r.status, r.status),
                "review": REVIEW.get(r.review_status, r.review_status),
                "lab": (r.performing_lab or "").strip() or "Not set",
                "entered_by": _person(r.entered_by, "Interface or scan"),
                "reviewed_by": _person(r.reviewed_by, "Not reviewed"),
                "unit": v.unit.name if v and v.unit_id else "No location",
                "facility": v.facility.name if v and v.facility_id else "No location",
                "patient": _person(r.patient, "Unknown patient"),
                "comment": (r.comment or "").strip() or None,
                "review_comment": (r.review_comment or "").strip() or None,
                "_patient": r.patient_id,
                "reports": 1,
                "results": len(items),
                "abnormal": sum(1 for i in items if i.abnormal_flag),
                "critical": sum(1 for i in items if i.abnormal_flag in CRITICAL),
                "with_critical": 1 if any(i.abnormal_flag in CRITICAL for i in items) else 0,
                "unreviewed": 1 if r.review_status == "unreviewed" and r.status != "entered_in_error" else 0,
                "corrected": 1 if r.status == "corrected" else 0,
                "in_error": 1 if r.status == "entered_in_error" else 0,
                "hours_to_result": _hours(r.collected_at, r.resulted_at),
                "hours_to_review": _hours(r.resulted_at or r.created_at, r.reviewed_at),
            }
        )
    return rows


register(
    "lab_results", "Lab results", "Labs",
    "One row per lab report: panel, source, status, review and turnaround, with result and critical-value counts. "
    "Each run is audit-logged.",
    [
        dim("date", "Date resulted", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("panel", "Panel or test"), dim("source", "Source"), dim("status", "Status"), dim("review", "Review"),
        dim("lab", "Performing lab"), dim("entered_by", "Entered by"), dim("reviewed_by", "Reviewed by"),
        dim("unit", "Unit or clinic"), dim("facility", "Facility"),
        dim("patient", "Patient", phi="name"), dim("comment", "Lab comment", phi="text"),
        dim("review_comment", "Review comment", phi="text"),
        measure("reports", "Lab reports"), measure("results", "Results"), measure("abnormal", "Abnormal results"),
        measure("critical", "Critical results"), measure("with_critical", "Reports with a critical result"),
        measure("unreviewed", "Not yet reviewed"), measure("corrected", "Corrected"), measure("in_error", "Entered in error"),
        measure("abnormal_pct", "Abnormal %", "percent", ratio=("abnormal", "results")),
        measure("unreviewed_pct", "Not reviewed %", "percent", ratio=("unreviewed", "reports")),
        measure("hours_to_result", "Average hours collected to resulted", agg="avg"),
        measure("hours_to_review", "Average hours resulted to reviewed", agg="avg"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_labs,
    default_columns=["panel", "reports", "results", "abnormal", "critical", "unreviewed"],
    default_group="panel",
    module="labs", right=RIGHT, scoped=True, patient_data=True,
)
