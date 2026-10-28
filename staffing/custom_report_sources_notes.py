"""
Clinical documentation (Notes) source for custom reports.

Note text and patient names can be columns: access is limited to people who already hold the clinical-notes
right (the healthcare team), and every run is written to the report audit log. Access follows the
"clinical_notes.view_author" right, and a user assigned to specific facilities only sees notes from visits
in those facilities (or visits not placed anywhere yet).
"""

import datetime

from django.db.models import Q
from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "clinical_notes.view_author"
OVERDUE_HOURS = 24
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
NOTE_TYPE_LABELS = {"nursing_assessment": "Nursing assessment", "doctor_assessment": "Doctor assessment"}
STATUS_LABELS = {"draft": "Draft", "signed": "Signed"}
SOAP = [("subjective", "Subjective"), ("objective", "Objective"), ("assessment", "Assessment"), ("plan", "Plan")]


def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def _pretty(value):
    return (value or "").replace("_", " ").strip().capitalize()


def _value_text(v):
    if isinstance(v, (list, tuple)):
        return ", ".join(_value_text(x) for x in v if x not in (None, ""))
    if isinstance(v, dict):
        return "; ".join(f"{_pretty(k)}: {_value_text(x)}" for k, x in v.items() if x not in (None, ""))
    return "" if v is None else str(v).strip()


def _note_text(n):
    """The SOAP fields plus the values of a template note, as plain text."""
    parts = [f"{label}: {getattr(n, key).strip()}" for key, label in SOAP if (getattr(n, key) or "").strip()]
    for key, value in (n.structured_data or {}).items():
        text = _value_text(value)
        if text:
            parts.append(f"{_pretty(key)}: {text}")
    return "\n".join(parts)


def load_notes(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from appointments.models import ClinicalNote

    qs = (
        ClinicalNote.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
        .filter(Q(organization=org) | Q(organization__isnull=True, appointment__organization=org))
        .select_related("patient", "author", "template", "appointment__unit__facility")
        .order_by("created_at")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))

    now = timezone.now()
    rows = []
    for n in qs:
        made = _local(n.created_at)
        day = made.date()
        unit = n.appointment.unit if n.appointment_id and n.appointment.unit_id else None
        hours = None
        if n.signed_at:
            hours = max((n.signed_at - n.created_at).total_seconds() / 3600.0, 0)
        overdue = n.status == "draft" and not n.amends_id and (now - n.created_at) > datetime.timedelta(hours=OVERDUE_HOURS)
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "author": _person(n.author),
                "author_role": _pretty(n.author_role_at_signing or getattr(n.author, "role", "")) or "Unknown",
                "note_type": NOTE_TYPE_LABELS.get(n.note_type) or _pretty(n.note_type) or "Unknown",
                "documentation_type": (n.template.name if n.template_id else _pretty(n.documentation_type)) or "Not set",
                "status": STATUS_LABELS.get(n.status, _pretty(n.status)),
                "kind": "Addendum" if n.amends_id else "Note",
                "unit": unit.name if unit else "No location",
                "facility": unit.facility.name if unit else "No location",
                "signed_on": _local(n.signed_at).date().isoformat() if n.signed_at else None,
                "patient": _person(n.patient, "Unknown patient"),
                "note_text": _note_text(n) or None,
                "subjective": n.subjective or None,
                "objective": n.objective or None,
                "assessment": n.assessment or None,
                "plan": n.plan or None,
                "_patient": n.patient_id,
                "notes": 1,
                "signed": 1 if n.status == "signed" else 0,
                "drafts": 1 if n.status == "draft" else 0,
                "addenda": 1 if n.amends_id else 0,
                "overdue_drafts": 1 if overdue else 0,
                "hours_to_sign": hours,
            }
        )
    return rows


register(
    "notes_documentation", "Clinical notes", "Documentation",
    "One row per note: who wrote it, type, signed or draft, time to sign, and the note text. "
    "Each run is audit-logged.",
    [
        dim("date", "Date written", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("author", "Author"), dim("author_role", "Author role"), dim("note_type", "Note type"),
        dim("documentation_type", "Documentation type"), dim("status", "Status"), dim("kind", "Note or addendum"),
        dim("unit", "Unit or clinic"), dim("facility", "Facility"), dim("signed_on", "Signed on", "date"),
        dim("patient", "Patient"), dim("note_text", "Note text"),
        dim("subjective", "Subjective"), dim("objective", "Objective"), dim("assessment", "Assessment"), dim("plan", "Plan"),
        measure("notes", "Notes"), measure("signed", "Signed"), measure("drafts", "Drafts"), measure("addenda", "Addenda"),
        measure("overdue_drafts", f"Drafts over {OVERDUE_HOURS}h old"),
        measure("signed_pct", "Signed %", "percent", ratio=("signed", "notes")),
        measure("hours_to_sign", "Average hours to sign", agg="avg"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_notes,
    default_columns=["author", "notes", "signed", "drafts", "overdue_drafts", "signed_pct"],
    default_group="author",
    module="notes", right=RIGHT, scoped=True, patient_data=True,
)
