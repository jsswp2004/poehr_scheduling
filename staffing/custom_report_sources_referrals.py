"""
Referrals data source for custom reports (one row per referral).

Patient names, the reason, the clinical question and the specialist's report are fields that Hide PHI masks.
Access follows the Staffing report roles (admin, doctor, nurse, registrar). Referrals are not tied to a facility,
so they are not narrowed by a user's facility assignment. Each run is audit-logged.
"""

import datetime

from django.utils import timezone

from .custom_reports import dim, measure, register

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
STATUS = {
    "draft": "Draft", "sent": "Sent", "scheduled": "Scheduled", "seen": "Seen", "report_received": "Report received",
    "closed": "Closed", "declined": "Declined", "needs_info": "Needs more info", "cancelled": "Cancelled", "expired": "Expired",
}
URGENCY = {"routine": "Routine", "urgent": "Urgent", "emergent": "Emergent"}
OPEN = {"sent", "scheduled", "seen", "needs_info"}


def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def _days(a, b):
    return max((b - a).total_seconds() / 86400.0, 0) if a and b else None


def load_referrals(org, start, end, user=None):
    from appointments.models import Referral

    qs = (
        Referral.objects.filter(organization=org, created_at__date__gte=start, created_at__date__lte=end)
        .select_related("patient", "referring_provider", "assigned_to", "destination")
        .order_by("id")
    )
    now = timezone.now()
    rows = []
    for r in qs:
        day = _local(r.created_at).date()
        waiting_schedule = r.status == "sent" and r.schedule_due and r.schedule_due < now
        waiting_report = r.status in ("scheduled", "seen") and r.report_due and r.report_due < now
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "specialty": (r.specialty or "").strip() or "Not set",
                "destination": (r.destination_name or (r.destination.name if r.destination_id else "")).strip() or "Not set",
                "urgency": URGENCY.get(r.urgency, r.urgency),
                "status": STATUS.get(r.status, r.status),
                "referred_by": _person(r.referring_provider),
                "assigned_to": _person(r.assigned_to, "Unassigned"),
                "diagnosis": (r.diagnosis_text or r.diagnosis_code or "").strip() or "Not set",
                "patient": _person(r.patient, "Unknown patient"),
                "reason": (r.reason or "").strip() or None,
                "clinical_question": (r.clinical_question or "").strip() or None,
                "report": (r.report_text or "").strip() or None,
                "_patient": r.patient_id,
                "referrals": 1,
                "sent": 1 if r.sent_at else 0,
                "scheduled": 1 if r.scheduled_for else 0,
                "seen": 1 if r.seen_at else 0,
                "reports": 1 if r.report_received_at else 0,
                "declined": 1 if r.status == "declined" else 0,
                "open": 1 if r.status in OPEN else 0,
                "overdue_schedule": 1 if waiting_schedule else 0,
                "overdue_report": 1 if waiting_report else 0,
                "days_to_schedule": _days(r.sent_at, r.scheduled_for),
                "days_to_seen": _days(r.sent_at, r.seen_at),
                "days_to_report": _days(r.sent_at, r.report_received_at),
            }
        )
    return rows


register(
    "referrals", "Referrals", "Referrals",
    "One row per referral: specialty, destination, urgency, status and how long each step took. "
    "Each run is audit-logged.",
    [
        dim("date", "Date created", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("specialty", "Specialty"), dim("destination", "Sent to"), dim("urgency", "Urgency"), dim("status", "Status"),
        dim("referred_by", "Referred by"), dim("assigned_to", "Assigned to"), dim("diagnosis", "Diagnosis"),
        dim("patient", "Patient", phi="name"), dim("reason", "Reason", phi="text"),
        dim("clinical_question", "Clinical question", phi="text"), dim("report", "Specialist report", phi="text"),
        measure("referrals", "Referrals"), measure("sent", "Sent"), measure("scheduled", "Scheduled"), measure("seen", "Seen"),
        measure("reports", "Reports received"), measure("declined", "Declined"), measure("open", "Still open"),
        measure("overdue_schedule", "Overdue to schedule"), measure("overdue_report", "Report overdue"),
        measure("seen_pct", "Seen %", "percent", ratio=("seen", "sent")),
        measure("report_pct", "Report received %", "percent", ratio=("reports", "sent")),
        measure("declined_pct", "Declined %", "percent", ratio=("declined", "referrals")),
        measure("days_to_schedule", "Average days sent to scheduled", agg="avg"),
        measure("days_to_seen", "Average days sent to seen", agg="avg"),
        measure("days_to_report", "Average days sent to report", agg="avg"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_referrals,
    default_columns=["specialty", "referrals", "sent", "seen", "reports", "open", "days_to_report"],
    default_group="specialty",
    module="referrals", patient_data=True,
)
