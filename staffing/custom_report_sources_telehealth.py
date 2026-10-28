"""
Telehealth data source for custom reports (one row per video visit session).

Aggregated by design: no patient name or contact column, only counts of distinct patients. Access follows the
"telehealth.manage" right, and a user assigned to specific facilities only sees visits whose appointment is in
those facilities (or not placed anywhere yet).
"""

import datetime

from django.db.models import Q
from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "telehealth.manage"
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
STATUS = {"scheduled": "Scheduled", "waiting": "Waiting", "in_progress": "In progress", "ended": "Ended"}
MODALITY = {"audio_video": "Audio and video", "audio_only": "Audio only"}
LOCATION = {"home": "Patient at home", "other": "Patient somewhere else"}


def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user, blank="No provider"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def load_telehealth(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from telehealth.models import TelehealthSession

    qs = (
        TelehealthSession.objects.filter(organization=org, created_at__date__gte=start, created_at__date__lte=end)
        .select_related("appointment__provider", "appointment__unit__facility", "visit_record")
        .prefetch_related("participants")
        .order_by("created_at")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))

    rows = []
    for s in qs:
        day = _local(s.started_at or s.created_at).date()
        appt = s.appointment
        unit = appt.unit if appt.unit_id else None
        record = getattr(s, "visit_record", None)
        patient = next((p for p in s.participants.all() if p.role == "patient"), None)
        wait = None
        if patient and patient.arrived_at and patient.admitted_at:
            wait = max((patient.admitted_at - patient.arrived_at).total_seconds() / 60.0, 0)
        minutes = None
        if record and record.duration_seconds:
            minutes = record.duration_seconds / 60.0
        elif s.started_at and s.ended_at:
            minutes = max((s.ended_at - s.started_at).total_seconds() / 60.0, 0)
        audio_only = bool(record and record.modality == "audio_only")
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "provider": _person(appt.provider),
                "status": STATUS.get(s.status, s.status),
                "modality": MODALITY.get(record.modality, record.modality) if record else "Not recorded",
                "patient_location": LOCATION.get(record.patient_location, "Not confirmed") if record else "Not confirmed",
                "patient_state": (record.patient_state if record and record.patient_state else "Not recorded"),
                "unit": unit.name if unit else "No location",
                "facility": unit.facility.name if unit else "No location",
                "_patient": appt.patient_id,
                "sessions": 1,
                "completed": 1 if s.status == "ended" and s.started_at else 0,
                "never_started": 1 if s.status == "ended" and not s.started_at else 0,
                "consented": 1 if s.consent_at else 0,
                "audio_only": 1 if audio_only else 0,
                "patient_joined": 1 if patient and patient.joined_at else 0,
                "wait_minutes": wait,
                "visit_minutes": minutes,
            }
        )
    return rows


register(
    "telehealth", "Video visits", "Telehealth",
    "One row per video visit, with counts instead of patient names. Completion, consent, audio-only visits, "
    "waiting-room time and visit length.",
    [
        dim("date", "Date", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("provider", "Provider"), dim("status", "Status"), dim("modality", "Audio or video"),
        dim("patient_location", "Patient location"), dim("patient_state", "Patient state"),
        dim("unit", "Unit or clinic"), dim("facility", "Facility"),
        measure("sessions", "Video visits"), measure("completed", "Completed"), measure("never_started", "Never started"),
        measure("consented", "Consent recorded"), measure("audio_only", "Audio only"), measure("patient_joined", "Patient joined"),
        measure("completed_pct", "Completed %", "percent", ratio=("completed", "sessions")),
        measure("consent_pct", "Consent recorded %", "percent", ratio=("consented", "sessions")),
        measure("joined_pct", "Patient joined %", "percent", ratio=("patient_joined", "sessions")),
        measure("wait_minutes", "Average minutes in waiting room", agg="avg"),
        measure("visit_minutes", "Average visit (minutes)", agg="avg"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_telehealth,
    default_columns=["provider", "sessions", "completed", "never_started", "wait_minutes", "visit_minutes"],
    default_group="provider",
    module="telehealth", right=RIGHT, scoped=True,
)
