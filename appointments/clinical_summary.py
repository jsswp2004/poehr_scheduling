"""
Clinical Summary: one read-only screen with the pertinent facts about a patient, and the problem list
behind its Problems card.

* GET /api/clinical-summary/?patient=<id>   everything the screen shows, in one call
* GET/POST /api/problem-list/               the problem list
* PATCH /api/problem-list/<id>/             change a problem, resolve it, or mark it entered in error

Each card is built on its own, so a failure in one never blanks the others (that card says it could not
load). The summary only reads what other screens already record; nothing here changes the chart.
"""

import logging
from datetime import date

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from users.rights import user_has_right

from . import allergies as allergy_lib
from . import fishbone
from . import prescriptions as rxs
from .models import (
    Appointment,
    ClinicalNote,
    HomeMedication,
    LabReport,
    MedReview,
    Order,
    OrderTask,
    Prescription,
    ProblemListEntry,
    Referral,
    VitalSignsFlowsheet,
)
from .patient_header import SEX_LABELS, _age_text, _patient_for, _target_org, allergy_summary
from .prescription_views import _iso, _name
from users.models import Registration

log = logging.getLogger(__name__)

CLINICAL_ROLES = ("doctor", "nurse", "admin", "system_admin")
OPEN_PROBLEMS = ("active", "chronic")
OPEN_ORDER_STATUSES = ["draft", "pending_cosign", "active", "in_progress"]
CLOSED_REFERRALS = ["closed", "cancelled", "declined", "expired"]
STATUS_LABELS = dict(ProblemListEntry.STATUS_CHOICES)
ORDER_LABELS = dict(Order.STATUS_CHOICES)
REFERRAL_LABELS = dict(Referral.STATUS_CHOICES)
NOTE_LABELS = dict(ClinicalNote.NOTE_TYPE_CHOICES)
CRITICAL_FLAGS = ("LL", "HH")
CARE_SETTINGS = dict(Registration.CARE_SETTING_CHOICES)

VITAL_ROWS = {
    "temp": ["temperature_f", "temperature", "temp"],
    "hr": ["heart_rate", "hr", "pulse"],
    "rr": ["resp_rate", "respiratory_rate", "rr"],
    "spo2": ["spo2", "o2_sat"],
    "sbp": ["bp_systolic", "systolic"],
    "dbp": ["bp_diastolic", "diastolic"],
    "weight": ["weight_lb", "weight"],
    "height": ["height_in", "height"],
    "pain": ["pain_score"],
}
VITAL_UNITS = {"temp": "°F", "hr": "bpm", "rr": "/min", "spo2": "%", "sbp": "mmHg", "dbp": "mmHg", "weight": "lb", "height": "in", "pain": "/10"}
SERIES_POINTS = 8


def _need_clinical(request):
    if getattr(request.user, "role", None) not in CLINICAL_ROLES:
        return Response({"detail": "Not allowed."}, status=403)
    return None


# ------------------------------------------------------------------ problem list


def serialize_problem(p):
    return {
        "id": p.pk, "patient": p.patient_id, "description": p.description,
        "code_system": p.code_system, "code": p.code,
        "status": p.status, "status_label": STATUS_LABELS.get(p.status, p.status),
        "onset_date": p.onset_date.isoformat() if p.onset_date else None,
        "resolved_date": p.resolved_date.isoformat() if p.resolved_date else None,
        "note": p.note,
        "entered_by_name": _name(p.entered_by) if p.entered_by_id else "",
        "created_at": _iso(p.created_at), "updated_at": _iso(p.updated_at),
    }


def _date(value, field):
    """(date or None, error text or '')."""
    if value in (None, ""):
        return None, ""
    try:
        parsed = date.fromisoformat(str(value))
    except ValueError:
        return None, f"{field} must be a date (YYYY-MM-DD)."
    if parsed > date.today():
        return None, f"{field} can't be in the future."
    return parsed, ""


def _open_duplicate(patient, code, exclude=None):
    if not code:
        return None
    found = ProblemListEntry.objects.filter(patient=patient, code__iexact=code, status__in=OPEN_PROBLEMS)
    if exclude is not None:
        found = found.exclude(pk=exclude)
    return found.first()


class ProblemListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_clinical(request)
        if denied:
            return denied
        patient, error = _patient_for(request, request.query_params.get("patient"))
        if error:
            return error
        show = request.query_params.get("show", "open")
        rows = ProblemListEntry.objects.filter(patient=patient)
        if show == "open":
            rows = rows.filter(status__in=OPEN_PROBLEMS)
        elif show == "resolved":
            rows = rows.filter(status="resolved")
        elif show != "all":
            return Response({"detail": "show must be open, resolved or all."}, status=400)
        rows = sorted(rows, key=lambda p: (p.status != "active", p.status != "chronic", p.description.lower(), p.pk))
        counts = {s: ProblemListEntry.objects.filter(patient=patient, status=s).count() for s in ("active", "chronic", "resolved")}
        return Response({"results": [serialize_problem(p) for p in rows], "counts": counts})

    def post(self, request):
        denied = _need_clinical(request)
        if denied:
            return denied
        patient, error = _patient_for(request, request.data.get("patient"))
        if error:
            return error
        description = str(request.data.get("description") or "").strip()[:255]
        if not description:
            return Response({"detail": "Describe the problem."}, status=400)
        code = str(request.data.get("code") or "").strip().upper()[:20]
        status = str(request.data.get("status") or "active")
        if status not in OPEN_PROBLEMS and status != "resolved":
            return Response({"detail": "A new problem is active, chronic or resolved."}, status=400)
        onset, bad = _date(request.data.get("onset_date"), "Onset date")
        if bad:
            return Response({"detail": bad}, status=400)
        resolved = None
        if status == "resolved":
            resolved, bad = _date(request.data.get("resolved_date") or date.today().isoformat(), "Resolved date")
            if bad:
                return Response({"detail": bad}, status=400)
        if status in OPEN_PROBLEMS and _open_duplicate(patient, code):
            return Response({"detail": f"{code} is already on the problem list."}, status=409)
        org = patient.organization or _target_org(request)
        entry = ProblemListEntry.objects.create(
            organization=org, patient=patient, description=description,
            code_system="icd10cm" if code else "", code=code, status=status,
            onset_date=onset, resolved_date=resolved,
            note=str(request.data.get("note") or "").strip()[:300],
            entered_by=request.user, updated_by=request.user,
        )
        return Response(serialize_problem(entry), status=201)


class ProblemDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        denied = _need_clinical(request)
        if denied:
            return denied
        entry = ProblemListEntry.objects.filter(pk=pk).select_related("patient").first()
        if entry is None:
            return Response({"detail": "Not found."}, status=404)
        patient, error = _patient_for(request, entry.patient_id)
        if error:
            return Response({"detail": "Not found."}, status=404)
        if entry.status == "entered_in_error":
            return Response({"detail": "This entry was marked entered in error and can't be changed."}, status=409)
        data = request.data
        if "description" in data:
            description = str(data.get("description") or "").strip()[:255]
            if not description:
                return Response({"detail": "The problem needs a description."}, status=400)
            entry.description = description
        if "code" in data:
            entry.code = str(data.get("code") or "").strip().upper()[:20]
            entry.code_system = "icd10cm" if entry.code else ""
        if "note" in data:
            entry.note = str(data.get("note") or "").strip()[:300]
        if "onset_date" in data:
            entry.onset_date, bad = _date(data.get("onset_date"), "Onset date")
            if bad:
                return Response({"detail": bad}, status=400)
        if "status" in data:
            status = str(data.get("status") or "")
            if status not in STATUS_LABELS:
                return Response({"detail": "Unknown status."}, status=400)
            if status == "resolved" and entry.status != "resolved":
                entry.resolved_date, bad = _date(data.get("resolved_date") or date.today().isoformat(), "Resolved date")
                if bad:
                    return Response({"detail": bad}, status=400)
            elif status in OPEN_PROBLEMS:
                entry.resolved_date = None
            entry.status = status
        if entry.status in OPEN_PROBLEMS and _open_duplicate(entry.patient, entry.code, exclude=entry.pk):
            return Response({"detail": f"{entry.code} is already on the problem list."}, status=409)
        entry.updated_by = request.user
        entry.save()
        return Response(serialize_problem(entry))


# ------------------------------------------------------------------ the cards


def _header(patient):
    profile = getattr(patient, "patient_profile", None)
    visit = Registration.objects.filter(patient__user=patient).select_related("attending_provider").order_by("-created_at", "-pk").first()
    provider = (visit.attending_provider if visit and visit.attending_provider else None) or patient.provider
    text, emphasis, rows = allergy_summary(patient)
    org = patient.organization
    location = ""
    if visit:
        location = visit.location_path() or visit.assigned_location or ""
    return {
        "name": f"{patient.last_name}, {patient.first_name}".strip(", "),
        "mrn": getattr(profile, "mrn", "") or "",
        "age": _age_text(getattr(profile, "date_of_birth", None)),
        "sex": SEX_LABELS.get(getattr(profile, "legal_sex", ""), ""),
        "location": location or (org.name if org else ""),
        "attending": f"Dr. {provider.first_name} {provider.last_name}".strip() if provider else "",
        "care_setting": CARE_SETTINGS.get(visit.care_setting, "") if visit else "",
        "allergies": {
            "text": text, "emphasis": emphasis,
            "items": [{"substance": a.substance, "reaction": a.reaction, "severity": a.severity} for a in rows],
        },
    }


def _problems(patient):
    entries = list(ProblemListEntry.objects.filter(patient=patient, status__in=OPEN_PROBLEMS))
    entries.sort(key=lambda p: (p.status != "active", p.description.lower(), p.pk))
    listed = {p.code.upper() for p in entries if p.code}
    other, seen = [], set()

    def consider(code, description, source):
        key = (code or "").upper()
        if not key or key in listed or key in seen or len(other) >= 8:
            return
        seen.add(key)
        other.append({"code": key, "description": description or "", "source": source})

    for order in Order.objects.filter(patient=patient).exclude(status="discontinued").order_by("-created_at")[:25]:
        for dx in order.diagnosis_codes or []:
            if isinstance(dx, dict):
                consider(dx.get("code"), dx.get("description"), f"Order: {order.orderable_name}")
    for ref in Referral.objects.filter(patient=patient).exclude(diagnosis_code="").order_by("-created_at")[:10]:
        consider(ref.diagnosis_code, ref.diagnosis_text, "Referral")
    profile = getattr(patient, "patient_profile", None)
    return {
        "items": [serialize_problem(p) for p in entries],
        "resolved_count": ProblemListEntry.objects.filter(patient=patient, status="resolved").count(),
        "history_text": (getattr(profile, "medical_history", "") or "").strip()[:600],
        "other_sources": other,
    }


def _medications(patient, now):
    home = list(HomeMedication.objects.filter(patient=patient, status="active").order_by("drug_name", "pk"))
    review = MedReview.objects.filter(patient=patient).select_related("reviewed_by").first()
    meds = []
    for m in home[:12]:
        alerts = allergy_lib.check_order(patient, m.drug_name, m.code_system, m.code)
        meds.append({
            "id": m.pk, "drug_name": m.drug_name, "strength": m.strength, "sig": _sig(m),
            "source": m.source, "last_taken": m.last_taken.isoformat() if m.last_taken else None,
            "allergy_alerts": len(alerts),
        })
    running = []
    for rx in Prescription.objects.filter(patient=patient, status__in=["signed", "sent"]).order_by("-signed_at", "-pk"):
        end = rxs.runs_out_at(rx)
        if end is not None and end < now:
            continue
        running.append({
            "id": rx.pk, "drug_name": rx.drug_name, "strength": rx.strength, "sig": rx.sig,
            "status": rx.status, "runs_out_at": _iso(end), "renewal_due": rxs.renewal_due(rx, now),
        })
    return {
        "home": meds,
        "home_count": len(home),
        "prescriptions": running[:8],
        "prescription_count": len(running),
        "renewals_due": sum(1 for r in running if r["renewal_due"]),
        "drafts": Prescription.objects.filter(patient=patient, status="draft").count(),
        "last_review": {"at": _iso(review.reviewed_at), "by": _name(review.reviewed_by) if review.reviewed_by_id else ""} if review else None,
        "needs_reconciliation": bool(home) and (review is None or any(m.reviewed_at is None for m in home)),
    }


def _sig(med):
    from . import home_meds

    return home_meds.sig_of(med)


def _results(patient, user):
    if not user_has_right(user, "lab_results.view"):
        return {"hidden": True}
    reports = LabReport.objects.filter(patient=patient).exclude(status="entered_in_error").prefetch_related("items")
    recent = []
    for r in reports.order_by("-resulted_at", "-created_at")[:6]:
        flags = [fishbone.flag_of(i) for i in r.items.all()]
        recent.append({
            "id": r.pk, "title": r.title, "status": r.status, "review_status": r.review_status,
            "at": _iso(r.resulted_at or r.collected_at or r.created_at),
            "abnormal": sum(1 for f in flags if f), "critical": sum(1 for f in flags if f in CRITICAL_FLAGS),
        })
    return {
        "hidden": False,
        "recent": recent,
        "unreviewed": reports.filter(review_status="unreviewed").count(),
        "fishbone": fishbone.panels_for(patient),
    }


def _parse_when(text):
    when = parse_datetime(str(text or ""))
    if when is not None and timezone.is_naive(when):
        when = timezone.make_aware(when)
    return when


def _vitals(patient):
    points = {key: [] for key in VITAL_ROWS}
    for sheet in VitalSignsFlowsheet.objects.filter(patient=patient).only("columns", "data"):
        columns = {c.get("id"): _parse_when(c.get("timestamp")) for c in (sheet.columns or []) if isinstance(c, dict)}
        for key, names in VITAL_ROWS.items():
            for name in names:
                for column_id, raw in ((sheet.data or {}).get(name) or {}).items():
                    when = columns.get(column_id)
                    try:
                        value = float(str(raw).strip())
                    except (TypeError, ValueError):
                        continue
                    if when is not None:
                        points[key].append((when, value))
    latest, series = {}, {}
    for key, found in points.items():
        found = sorted(set(found))
        if not found:
            continue
        when, value = found[-1]
        latest[key] = {"value": value, "unit": VITAL_UNITS[key], "at": _iso(when)}
        series[key] = [{"at": _iso(w), "value": v} for w, v in found[-SERIES_POINTS:]]
    return {"latest": latest, "series": series}


def _orders_and_tasks(patient, user, now):
    out = {"orders": None, "tasks": None}
    if user_has_right(user, "orders.view"):
        open_orders = Order.objects.filter(patient=patient, status__in=OPEN_ORDER_STATUSES)
        out["orders"] = {
            "count": open_orders.count(),
            "awaiting_cosign": open_orders.filter(status="pending_cosign").count(),
            "items": [
                {"id": o.pk, "name": o.orderable_name, "category": o.orderable_category, "status": o.status,
                 "status_label": ORDER_LABELS.get(o.status, o.status), "priority": o.priority, "at": _iso(o.signed_at or o.created_at)}
                for o in open_orders.order_by("-created_at")[:6]
            ],
        }
    pending = OrderTask.objects.filter(patient=patient, status="pending")
    due = pending.filter(is_prn=False)
    out["tasks"] = {
        "count": pending.count(),
        "overdue": due.filter(due_at__lt=now).count(),
        "items": [
            {"id": t.pk, "title": t.title, "due_at": _iso(t.due_at), "overdue": (not t.is_prn) and t.due_at < now, "prn": t.is_prn}
            for t in pending.order_by("due_at")[:6]
        ],
    }
    return out


def _notes_and_referrals(patient):
    notes = ClinicalNote.objects.filter(patient=patient).select_related("author").order_by("-created_at")[:3]
    open_refs = Referral.objects.filter(patient=patient).exclude(status__in=CLOSED_REFERRALS).exclude(status="draft")
    return {
        "notes": [
            {"id": n.pk, "type": NOTE_LABELS.get(n.note_type, n.note_type), "documentation_type": n.documentation_type,
             "status": n.status, "author": _name(n.author), "at": _iso(n.signed_at or n.created_at)}
            for n in notes
        ],
        "referrals": [
            {"id": r.pk, "specialty": r.specialty, "destination": r.destination_name, "status": r.status,
             "status_label": REFERRAL_LABELS.get(r.status, r.status), "urgency": r.urgency}
            for r in open_refs.order_by("-created_at")[:5]
        ],
    }


def _upcoming(patient, now):
    # the tenant-scoped manager returns nothing outside a scoped request; the patient was already checked
    rows = Appointment.all_objects.filter(
        patient=patient, appointment_datetime__gte=now, status__in=["scheduled", "pending"]
    ).select_related("provider").order_by("appointment_datetime")[:3]
    return [
        {"id": a.pk, "title": a.title, "at": _iso(a.appointment_datetime), "status": a.status,
         "provider": _name(a.provider) if a.provider_id else ""}
        for a in rows
    ]


def _safe(name, build):
    """One card's data, or a plain 'could not load' marker, without hurting the other cards."""
    try:
        with transaction.atomic():
            return build()
    except Exception:  # noqa: BLE001 - a broken card must never blank the screen
        log.exception("clinical summary: %s failed", name)
        return {"error": "Could not load this section."}


class ClinicalSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_clinical(request)
        if denied:
            return denied
        patient, error = _patient_for(request, request.query_params.get("patient"))
        if error:
            return error
        now = timezone.now()
        user = request.user
        orders_tasks = _safe("orders_tasks", lambda: _orders_and_tasks(patient, user, now))
        return Response({
            "patient": patient.pk,
            "generated_at": _iso(now),
            "header": _safe("header", lambda: _header(patient)),
            "problems": _safe("problems", lambda: _problems(patient)),
            "medications": _safe("medications", lambda: _medications(patient, now)),
            "results": _safe("results", lambda: _results(patient, user)),
            "vitals": _safe("vitals", lambda: _vitals(patient)),
            "orders": orders_tasks.get("orders") if "error" not in orders_tasks else orders_tasks,
            "tasks": orders_tasks.get("tasks") if "error" not in orders_tasks else orders_tasks,
            "notes_referrals": _safe("notes_referrals", lambda: _notes_and_referrals(patient)),
            "upcoming": _safe("upcoming", lambda: {"items": _upcoming(patient, now)}),
        })
