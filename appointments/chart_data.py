"""
Chart data for note fields.

A note template field of type "chart_data" shows part of the patient's chart inside the note, read-only:
the problem list, allergies, home medications, recent results, the latest vital signs, immunizations that
were given, or what Health Manager says is due. The field's calc says which: {"source": "problems"}.

    GET /api/note-chart-data/?patient=<id>&source=<key>

returns {"source", "title", "columns": [{"key", "label"}], "rows": [{...}], "empty": "text", "hidden": bool}.
Every source reads what other screens already record; nothing here changes the chart. A source the
caller has no right to see answers {"hidden": true} instead of an error, so a note still opens.
"""

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.rights import user_has_right

from . import fishbone
from . import immunization_engine as engine
from . import immunization_service as service
from .models import (
    HomeMedication,
    LabReport,
    PatientAllergy,
    PatientAllergyStatus,
    Order,
    PatientImmunization,
    ProblemListEntry,
    VitalSignsFlowsheet,
)
from .patient_header import _patient_for

CLINICAL_ROLES = ("doctor", "nurse", "admin", "system_admin")
OPEN_PROBLEMS = ("active", "chronic")
FLAG_TEXT = {"L": "Low", "H": "High", "LL": "Critical low", "HH": "Critical high", "A": "Abnormal"}
VITAL_LABELS = [
    ("temp", "Temperature"), ("hr", "Heart rate"), ("rr", "Respiratory rate"), ("spo2", "Oxygen saturation"),
    ("sbp", "BP systolic"), ("dbp", "BP diastolic"), ("weight", "Weight"), ("height", "Height"), ("pain", "Pain score"),
]


def _col(key, label):
    return {"key": key, "label": label}


def _date(value):
    return value.isoformat() if value else ""


def problems(patient, user):
    rows = sorted(
        ProblemListEntry.objects.filter(patient=patient, status__in=OPEN_PROBLEMS),
        key=lambda p: (p.status != "active", p.description.lower(), p.pk),
    )
    return {
        "title": "Problem list",
        "columns": [_col("description", "Problem"), _col("code", "ICD-10"), _col("onset", "Onset"), _col("status", "Status")],
        "rows": [{"description": p.description, "code": p.code, "onset": _date(p.onset_date),
                  "status": p.get_status_display()} for p in rows],
        "empty": "No active problems on the chart.",
    }


def allergies(patient, user):
    rows = list(PatientAllergy.objects.filter(patient=patient, status="active").order_by("substance", "id"))
    empty = "Not documented."
    if not rows and PatientAllergyStatus.objects.filter(patient=patient, no_known_allergies=True).exists():
        empty = "No known allergies."
    return {
        "title": "Allergies",
        "columns": [_col("substance", "Allergen"), _col("reaction", "Reaction"), _col("severity", "Severity")],
        "rows": [{"substance": a.substance, "reaction": a.reaction, "severity": a.get_severity_display() if a.severity else ""}
                 for a in rows],
        "empty": empty,
    }


def medications(patient, user):
    from . import home_meds

    rows = HomeMedication.objects.filter(patient=patient, status="active").order_by("drug_name", "pk")
    return {
        "title": "Outpatient medications",
        "columns": [_col("drug", "Medication"), _col("sig", "Directions"), _col("last_taken", "Last taken")],
        "rows": [{"drug": " ".join(x for x in (m.drug_name, m.strength) if x), "sig": home_meds.sig_of(m),
                  "last_taken": _date(m.last_taken)} for m in rows],
        "empty": "No home medications recorded.",
    }


def inpatient_meds(patient, user):
    """Medication orders that are active now (the Orders module), for acute-care notes."""
    if not user_has_right(user, "orders.view"):
        return {"title": "Active medication orders", "hidden": True}
    from .order_tasks import FREQUENCY_LABELS

    orders = Order.objects.filter(
        patient=patient, orderable_category="medication", status__in=("active", "in_progress")
    ).order_by("orderable_name", "pk")
    rows = []
    for order in orders:
        schedule = order.schedule or {}
        rows.append({
            "drug": order.orderable_name,
            "dose": " ".join(x for x in (schedule.get("dose"), schedule.get("route")) if x),
            "frequency": FREQUENCY_LABELS.get(schedule.get("frequency"), schedule.get("frequency") or ""),
            "started": _date(order.signed_at.date()) if order.signed_at else "",
        })
    return {
        "title": "Active medication orders",
        "columns": [_col("drug", "Medication"), _col("dose", "Dose and route"), _col("frequency", "Frequency"), _col("started", "Started")],
        "rows": rows,
        "empty": "No active medication orders.",
    }


def intake_output(patient, user):
    """The 24-hour totals from the patient's latest Intake & Output flowsheet."""
    from . import intake_output as io
    from .intake_output_views import settings_for, weight_kg

    title = "Intake and output, last 24 hours"
    sheet = VitalSignsFlowsheet.objects.filter(patient=patient, template__code="intake_output").order_by("-pk").first()
    if sheet is None:
        return {"title": title, "columns": [], "rows": [], "empty": "No intake and output charted."}
    summary = io.summarize(sheet.columns or [], sheet.data or {}, timezone.localtime(), settings_for(user), weight_kg(patient))
    day = summary["periods"]["day"]
    ml = lambda v: "--" if v is None else f"{v:,} mL"
    rows = [
        {"measure": "Intake", "value": ml(day["intake"])},
        {"measure": "Output", "value": ml(day["output"])},
        {"measure": "Net", "value": (f"+{day['net']:,} mL" if day["net"] > 0 else ml(day["net"]))},
    ]
    if summary["urine_ml_kg_h"] is not None:
        rows.append({"measure": "Urine, last 6 hours", "value": f"{summary['urine_ml_kg_h']} mL/kg/h"})
    for alert in summary["alerts"]:
        rows.append({"measure": "Alert", "value": alert["message"]})
    return {"title": title, "columns": [_col("measure", "Measure"), _col("value", "Value")], "rows": rows, "empty": "No intake and output charted."}


def labs(patient, user):
    if not user_has_right(user, "lab_results.view"):
        return {"title": "Laboratory results", "hidden": True}
    reports = (LabReport.objects.filter(patient=patient).exclude(status="entered_in_error")
               .prefetch_related("items").order_by("-resulted_at", "-created_at")[:4])
    rows = []
    for report in reports:
        when = report.resulted_at or report.collected_at or report.created_at
        for item in report.items.all():
            flag = fishbone.flag_of(item)
            rows.append({"test": item.test_name, "value": " ".join(x for x in (item.value, item.units) if x),
                         "range": item.reference_range, "flag": FLAG_TEXT.get(flag, ""),
                         "date": when.date().isoformat() if when else ""})
    return {
        "title": "Laboratory results",
        "columns": [_col("test", "Test"), _col("value", "Result"), _col("range", "Reference"), _col("flag", "Flag"), _col("date", "Date")],
        "rows": rows[:30],
        "empty": "No results on the chart.",
    }


def vitals(patient, user):
    from .clinical_summary import _vitals

    latest = _vitals(patient)["latest"]
    rows = [{"measure": label, "value": f"{latest[key]['value']:g} {latest[key]['unit']}".strip(), "at": (latest[key]["at"] or "")[:16].replace("T", " ")}
            for key, label in VITAL_LABELS if key in latest]
    return {
        "title": "Latest vital signs",
        "columns": [_col("measure", "Measure"), _col("value", "Value"), _col("at", "Taken")],
        "rows": rows,
        "empty": "No vital signs charted.",
    }


def immunizations(patient, user):
    if not user_has_right(user, "immunizations.view"):
        return {"title": "Immunizations given", "hidden": True}
    org = patient.organization
    done = (PatientImmunization.objects.filter(organization=org, patient=patient, status="done")
            .select_related("item", "product").order_by("-given_on", "-id")[:15])
    return {
        "title": "Immunizations given",
        "columns": [_col("vaccine", "Vaccine"), _col("dose", "Dose"), _col("given_on", "Given")],
        "rows": [{"vaccine": r.item.display_name or r.item.name, "dose": str(r.dose_number), "given_on": _date(r.given_on)} for r in done],
        "empty": "No immunizations recorded.",
    }


def health_manager(patient, user):
    if not user_has_right(user, "immunizations.view"):
        return {"title": "Health Manager", "hidden": True}
    data = service.recommend_for_patient(patient, patient.organization)
    labels = {engine.OVERDUE: "Overdue", engine.DUE: "Due now"}
    due = [r for r in data["recommendations"] if r.status in labels]
    return {
        "title": "Health Manager: due and overdue",
        "columns": [_col("item", "Item"), _col("status", "Status"), _col("last_done", "Last done"), _col("next_due", "Due")],
        "rows": [{"item": r.name, "status": labels[r.status], "last_done": _date(r.last_done), "next_due": _date(r.next_due)} for r in due],
        "empty": "Nothing is due." if not data.get("problem") else "No date of birth on file, so nothing can be recommended.",
    }


SOURCES = {
    "problems": problems,
    "allergies": allergies,
    "medications": medications,
    "labs": labs,
    "vitals": vitals,
    "immunizations": immunizations,
    "health_manager": health_manager,
    "inpatient_meds": inpatient_meds,
    "intake_output": intake_output,
}
SOURCE_LABELS = {
    "problems": "Problem list",
    "allergies": "Allergies",
    "medications": "Outpatient medications",
    "labs": "Laboratory results",
    "vitals": "Latest vital signs",
    "immunizations": "Immunizations given",
    "health_manager": "Health Manager (due and overdue)",
    "inpatient_meds": "Active medication orders",
    "intake_output": "Intake and output (24 hours)",
}


def snapshot(source, patient, user):
    """What a note keeps of one chart source at the moment it is saved or signed."""
    body = SOURCES[source](patient, user)
    out = {key: body[key] for key in ("title", "columns", "rows", "empty") if key in body}
    out.update({"source": source, "hidden": bool(body.get("hidden")), "captured_at": timezone.now().isoformat()})
    return out


def capture(values, fields, patient, user):
    """Put a fresh snapshot of the chart under every chart_data field's key in `values`.

    The server does this on every save and again when the note is signed, so a signed note always
    keeps what the chart said then, and a client can never send its own version of the chart.
    """
    for field in fields:
        if field.field_type != "chart_data":
            continue
        source = (field.calc or {}).get("source")
        if source in SOURCES:
            values[field.key] = snapshot(source, patient, user)
    return values


class ChartDataView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if getattr(request.user, "role", None) not in CLINICAL_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        source = request.query_params.get("source", "")
        build = SOURCES.get(source)
        if build is None:
            return Response({"detail": "Unknown chart data source."}, status=400)
        patient, error = _patient_for(request, request.query_params.get("patient"))
        if error:
            return error
        body = build(patient, request.user)
        body.update({"source": source, "hidden": bool(body.get("hidden")), "generated_at": timezone.now().isoformat()})
        return Response(body)
