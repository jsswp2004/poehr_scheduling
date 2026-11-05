"""
Allergies data source for custom reports (one row per allergy on a chart).

Patient names are masked by Hide PHI. Access follows the Staffing report roles (admin, doctor, nurse, registrar).
Allergies are not tied to a facility, so they are not narrowed by a user's facility assignment. Each run is
audit-logged.
"""

import datetime

from django.db.models import Q
from django.utils import timezone

from .custom_reports import dim, measure, register

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
SEVERITY = {"mild": "Mild", "moderate": "Moderate", "severe": "Severe"}
CATEGORY = {"medication": "Medication", "food": "Food", "environment": "Environment", "biologic": "Biologic", "other": "Other"}


def _person(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def load_allergies(org, start, end, user=None):
    from appointments.models import PatientAllergy

    qs = (
        PatientAllergy.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
        .filter(Q(organization=org) | Q(organization__isnull=True, patient__organization=org))
        .select_related("patient", "entered_by")
        .order_by("id")
    )
    rows = []
    for a in qs:
        day = timezone.localtime(a.created_at).date()
        severe = a.severity == "severe"
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "substance": (a.substance or "").strip() or "Unknown",
                "category": CATEGORY.get(a.category, (a.category or "Not set").capitalize()),
                "severity": SEVERITY.get(a.severity, "Not set"),
                "status": "Active" if a.status == "active" else "Inactive",
                "kind": "Intolerance" if a.reaction_type == "intolerance" else "Allergy",
                "reaction": (a.reaction or "").strip() or "Not recorded",
                "coded": "Coded" if a.code else "Free text",
                "entered_by": _person(a.entered_by, "Not recorded"),
                "patient": _person(a.patient, "Unknown patient"),
                "_patient": a.patient_id,
                "allergies": 1,
                "active": 1 if a.status == "active" else 0,
                "severe": 1 if severe and a.status == "active" else 0,
                "coded_count": 1 if a.code else 0,
            }
        )
    return rows


register(
    "allergies", "Allergies", "Allergies",
    "One row per allergy or intolerance recorded: substance, category, severity and who entered it. "
    "Each run is audit-logged.",
    [
        dim("date", "Date recorded", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("substance", "Substance"), dim("category", "Category"), dim("severity", "Severity"), dim("status", "Status"),
        dim("kind", "Allergy or intolerance"), dim("reaction", "Reaction"), dim("coded", "Coding"),
        dim("entered_by", "Entered by"), dim("patient", "Patient", phi="name"),
        measure("allergies", "Allergies"), measure("active", "Active"), measure("severe", "Active and severe"),
        measure("coded_count", "Coded"),
        measure("severe_pct", "Severe %", "percent", ratio=("severe", "active")),
        measure("coded_pct", "Coded %", "percent", ratio=("coded_count", "allergies")),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_allergies,
    default_columns=["substance", "allergies", "active", "severe", "patients"],
    default_group="substance",
    module="allergies", patient_data=True,
)
