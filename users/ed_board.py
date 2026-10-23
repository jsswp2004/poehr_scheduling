"""
The ED board: a live status board for an emergency department.

One row per bed in the chosen emergency unit (empty beds show as Ready), plus the patients
who are in the ED but have no bed yet (waiting). Staff edit the triage level, status, nurse,
resident, comments and registration flag right on the board. Moving, admitting and discharging
use the admit / transfer / discharge views in admissions.py.
"""
import re
from datetime import date, timedelta

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments import triage_service
from appointments.locations import bed_status
from appointments.models import Bed, LabReport, Order, Unit, VitalSignsFlowsheet

from .admissions import ROLES, _bad, _org
from .facility_scope import limit_to_facilities
from .board_config import BUILTIN_VIEW_KEYS, DEFAULT_FOLLOW_UP_DAYS, DEFAULT_STATUSES, MAX_FOLLOW_UP_DAYS, bed_label, all_view_payloads, get_settings, roster_for, status_keys
from .models import CustomUser, Registration, StatusBoardPreference, StatusBoardView

# The built-in ED statuses; an admin can change them per clinic or department in the Status Board Builder.
ED_STATUSES = [(x["value"], x["code"], x["label"]) for x in DEFAULT_STATUSES]


def _name(user):
    if user is None:
        return ""
    return f"{user.last_name}, {user.first_name}".strip(", ")


def _age(dob):
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def age_parts(dob, today=None):
    """(whole years, whole months, days) old, for babies and children where "0y" tells nothing."""
    if not dob:
        return None, None, None
    today = today or date.today()
    years = _age(dob) if today == date.today() else today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    months = (today.year - dob.year) * 12 + today.month - dob.month - (1 if today.day < dob.day else 0)
    return years, max(months, 0), max((today - dob).days, 0)


def age_text(dob, today=None):
    """"3 y", "8 mo" or "11 d": years from 2 on, months from 1 month, days before that."""
    years, months, days = age_parts(dob, today)
    if years is None:
        return ""
    if years >= 2:
        return f"{years} y"
    if months >= 1:
        return f"{months} mo"
    return f"{days} d"


# -- chart summary: last vitals and what has been ordered --------------------------------------
VITALS_TEMPLATE_CODE = "vital_signs"
# Order statuses that show on the board (drafts and discontinued orders do not)
_BOARD_ORDER_STATUSES = ("pending_cosign", "active", "in_progress", "completed")
_EKG = re.compile(r"\b(ekg|ecg|electrocardiogram)\b", re.I)
_URINE = re.compile(r"urin|\bua\b", re.I)
_CARDIAC = re.compile(r"troponin|\bbnp\b|ck-?mb|cardiac|\bkoe\b|echo", re.I)
# A disposition order is found by its name ("Admit to inpatient", "Discharge patient"); lab, imaging and
# medication orders are never one ("Admission labs" is a lab).
_ADMIT = re.compile(r"\badmit(ted)?\b|\badmission order\b", re.I)
_DISCHARGE = re.compile(r"\bdischarge\b", re.I)
_NOT_DISPOSITION = ("laboratory", "imaging", "medication")


def disposition_of(name, category):
    """"admit", "discharge" or None for an order."""
    if category in _NOT_DISPOSITION:
        return None
    if _DISCHARGE.search(name):
        return "discharge"
    if _ADMIT.search(name):
        return "admit"
    return None


def effective_status(visit, dispo, keys, waiting):
    """
    The status the board shows. Orders decide first (a discharge order -> DC, an admit order -> ADM, the latest
    wins), then a status someone picked by hand other than WTBS/TIP, then an assigned MD -> TIP, then a patient
    still waiting for a bed -> WTBS. A status the clinic removed from its list is never produced.
    """
    if dispo == "discharge" and "discharge_pending" in keys:
        return "discharge_pending"
    if dispo == "admit" and "admit_pending" in keys:
        return "admit_pending"
    stored = visit.ed_status
    if stored and stored not in ("wtbs", "tip"):
        return stored
    if visit.attending_provider_id and "tip" in keys:
        return "tip"
    if stored:
        return stored
    if waiting and "wtbs" in keys:
        return "wtbs"
    return stored


def order_icons(name, category):
    """Which board icons an order lights up: meds, lab, rad, urine, ekg, cardiac."""
    icons = set()
    if category == "medication":
        icons.add("meds")
    elif category == "laboratory":
        icons.add("lab")
        if _URINE.search(name):
            icons.add("urine")
        if _CARDIAC.search(name):
            icons.add("cardiac")
    elif category == "imaging":
        icons.add("rad")
    if _EKG.search(name):
        icons.add("ekg")
    elif category == "procedure" and _CARDIAC.search(name):
        icons.add("cardiac")
    return icons


def chart_summaries(visits, gaps=None):
    """{registration id: {"vitals_last_at": iso or None, "orders": {icon: "pending" | "done"}}} in two queries."""
    by_appt = {v.appointment_id: v.pk for v in visits if v.appointment_id}
    out = {v.pk: {"vitals_last_at": None, "orders": {}, "dispo": None, "triage": None} for v in visits}
    dispo_at = {}
    triage = triage_service.board_info(visits, gaps or {})
    for visit in visits:
        out[visit.pk]["triage"] = triage[visit.pk]
    if not by_appt:
        return out

    for sheet in VitalSignsFlowsheet.objects.filter(appointment_id__in=by_appt, template__code=VITALS_TEMPLATE_CODE):
        latest = None
        for col in sheet.columns or []:
            stamp = parse_datetime(str(col.get("timestamp") or ""))
            if stamp and (latest is None or stamp > latest):
                latest = stamp
        current = out[by_appt[sheet.appointment_id]]
        if latest and (current["vitals_last_at"] is None or latest > current["vitals_last_at"]):
            current["vitals_last_at"] = latest

    for appt_id, name, category, status, created in Order.objects.filter(
        appointment_id__in=by_appt, status__in=_BOARD_ORDER_STATUSES
    ).values_list("appointment_id", "orderable_name", "orderable_category", "status", "created_at"):
        visit_pk = by_appt[appt_id]
        kind = disposition_of(name, category)
        if kind and (visit_pk not in dispo_at or created >= dispo_at[visit_pk]):
            dispo_at[visit_pk] = created
            out[visit_pk]["dispo"] = kind
        icons = out[visit_pk]["orders"]
        for icon in order_icons(name, category):
            if status == "completed":
                icons.setdefault(icon, "done")
            else:
                icons[icon] = "pending"

    for item in out.values():
        if item["vitals_last_at"]:
            item["vitals_last_at"] = item["vitals_last_at"].isoformat()
    return out


def board_visit(visit, chart=None, keys=None, waiting=False):
    """One patient's row data on the board. With `keys` (the clinic's status values) the status follows orders, MD and waiting."""
    patient = visit.patient
    user = patient.user
    return {
        "registration": visit.pk,
        "visit_number": visit.visit_number,
        "patient": patient.pk,
        "user_id": user.pk,
        "name": f"{user.last_name.upper()}, {user.first_name}".strip(", "),
        "age": _age(patient.date_of_birth),
        "age_months": age_parts(patient.date_of_birth)[1],
        "age_days": age_parts(patient.date_of_birth)[2],
        "age_text": age_text(patient.date_of_birth),
        "sex": patient.legal_sex or "",
        "arrival_time": visit.arrival_time or visit.created_at,
        "reason": visit.reason_for_visit,
        "complaint": visit.presenting_problem,
        "esi": visit.esi,
        "ed_status": effective_status(visit, (chart or {}).get("dispo"), keys, waiting) if keys is not None else visit.ed_status,
        "md": {"id": visit.attending_provider_id, "name": _name(visit.attending_provider)} if visit.attending_provider_id else None,
        "rn": {"id": visit.assigned_nurse_id, "name": _name(visit.assigned_nurse)} if visit.assigned_nurse_id else None,
        "resident": {"id": visit.resident_provider_id, "name": _name(visit.resident_provider)} if visit.resident_provider_id else None,
        "resident_text": visit.resident,
        "comments": visit.board_comments,
        "registration_complete": visit.registration_complete,
        "custom": visit.board_custom or {},
        "location": visit.location_path() or visit.assigned_location,
        "vitals_last_at": (chart or {}).get("vitals_last_at"),
        "orders": (chart or {}).get("orders", {}),
        "triage": (chart or {}).get("triage"),
        "waiting": bool(waiting),
    }


def _roster(org, role, allowed):
    people = CustomUser.objects.filter(organization=org, role=role, is_active=True)
    if allowed is not None:
        people = people.filter(pk__in=allowed)
    return [{"id": u.pk, "name": _name(u)} for u in people.order_by("last_name", "first_name")]


def _default_view_key(user, org, views):
    """The view the board opens on: the person's last pick, else the clinic's default view, else ED All View."""
    keys = {v["key"] for v in views}
    pref = StatusBoardPreference.objects.filter(user=user).values_list("view_key", flat=True).first()
    if pref in keys:
        return pref
    default = StatusBoardView.objects.filter(organization=org, is_default=True).first()
    if default and f"v{default.pk}" in keys:
        return f"v{default.pk}"
    return "all"


def _default_follow_up_key(org, views):
    """The follow-up view the tab opens on: the clinic's default follow-up view if it made one, else the standard one."""
    keys = {v["key"] for v in views}
    default = StatusBoardView.objects.filter(organization=org, is_default=True).first()
    if default and f"v{default.pk}" in keys:
        return f"v{default.pk}"
    return "followup"


def _board_base(org, unit, departments, user, kind="live"):
    """The views, statuses and staff lists a department's board uses."""
    settings = get_settings(org)
    views = all_view_payloads(org, settings, kind)
    roster = roster_for(settings, unit.pk if unit else None)
    return {
        "departments": departments,
        "statuses": settings["statuses"],
        "views": views,
        "default_view": _default_view_key(user, org, views) if kind == "live" else _default_follow_up_key(org, views),
        "config": {"vitals_overdue_minutes": settings["vitals_overdue_minutes"]},
        "staff": {
            "nurses": _roster(org, "nurse", roster.get("nurses")),
            "doctors": _roster(org, "doctor", roster.get("doctors")),
        },
    }


class EdBoardPreferenceView(APIView):
    """PATCH {view}: remember which view this person picked ("all", "waiting", "mine" or "v<id>")."""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        if request.user.role not in ROLES:
            return _bad("You do not have permission to see the ED board.", 403)
        org = _org(request)
        if org is None:
            return _bad("No clinic is selected.")
        key = str(request.data.get("view") or "")
        valid = key in BUILTIN_VIEW_KEYS or (key.startswith("v") and key[1:].isdigit() and StatusBoardView.objects.filter(organization=org, pk=key[1:]).exists())
        if not valid:
            return _bad("That is not a view on this board.", 404)
        StatusBoardPreference.objects.update_or_create(user=request.user, defaults={"view_key": key})
        return Response({"view": key})


_RELATED = ("patient__user", "attending_provider", "assigned_nurse", "resident_provider", "bed__room", "room", "unit__facility")


def _departments(request, org):
    """The emergency departments this person can see, as (units, [{id, name, ...}])."""
    units = Unit.objects.filter(facility__organization=org, care_type="emergency", is_active=True, facility__is_active=True)
    if org.pk == request.user.organization_id:
        units = limit_to_facilities(units, request.user, "facility_id")  # only the user's own facilities
    units = list(units.select_related("facility").order_by("facility__name", "name"))
    departments = [{"id": u.pk, "name": u.name, "facility": u.facility_id, "facility_name": u.facility.name} for u in units]
    return units, departments


class EdBoardView(APIView):
    """GET ?unit=<emergency unit id>: the board for that department (default: the first one)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in ROLES:
            return _bad("You do not have permission to see the ED board.", 403)
        org = _org(request)
        if org is None:
            return _bad("No clinic is selected.")

        units, departments = _departments(request, org)
        raw = request.query_params.get("unit")
        unit = next((u for u in units if str(u.pk) == str(raw)), None) if raw else (units[0] if units else None)
        if raw and unit is None:
            return _bad("That is not an emergency department in this clinic.", 404)
        base = _board_base(org, unit, departments, request.user)
        keys = {s["value"] for s in base["statuses"]}
        if unit is None:
            return Response({**base, "unit": None, "rows": []})

        open_visits = Registration.objects.filter(discharge_datetime__isnull=True).select_related(*_RELATED)
        in_beds = {r.bed_id: r for r in open_visits.filter(bed__room__unit=unit)}
        waiting = list(
            open_visits.filter(care_setting="emergency", bed__isnull=True)
            .filter(Q(unit=unit) | Q(unit__isnull=True))
            .filter(Q(organization=org) | Q(patient__user__organization=org))
            .order_by("arrival_time", "created_at")
        )
        shown = list(in_beds.values()) + waiting
        for visit in shown:
            # visits registered before charting was linked get their chart appointment the first time they show here
            if not visit.appointment_id and visit.care_setting == "emergency":
                visit.ensure_chart_appointment()
        chart = chart_summaries(shown, triage_service.clinic_gaps(org))

        rows = []
        beds = Bed.objects.filter(room__unit=unit, is_active=True, room__is_active=True).select_related("room").order_by("room__name", "name")
        occupied = {b: True for b in in_beds}
        for bed in beds:
            visit = in_beds.get(bed.pk)
            rows.append(
                {
                    "type": "bed",
                    "bed": bed.pk,
                    "loc": bed_label(bed),
                    "bed_status": bed_status(bed, occupied),
                    "hold_reason": bed.hold_reason,
                    "visit": board_visit(visit, chart[visit.pk], keys) if visit else None,
                }
            )

        # in the ED but not in a bed yet (this department's, or not placed in any)
        for visit in waiting:
            rows.append({"type": "waiting", "bed": None, "loc": "", "bed_status": "", "hold_reason": "", "visit": board_visit(visit, chart[visit.pk], keys, waiting=True)})
        return Response({**base, "unit": unit.pk, "rows": rows})


# -- follow-up: patients discharged from the ED, and results that arrived after they left ---------------

def new_result_summaries(visits):
    """
    {registration id: {"state": "new" | "reviewed" | "none", "count": unreviewed results, "tests": [names]}}.

    A result counts when it belongs to the visit (filed to it, or answering an order on its chart), came in
    after the discharge time and is not marked entered in error. "new" means at least one of them has not been
    reviewed; once a clinician reviews them all the visit reads "reviewed". Two queries for any number of visits.
    """
    out = {v.pk: {"state": "none", "count": 0, "tests": []} for v in visits}
    by_appt = {v.appointment_id: v.pk for v in visits if v.appointment_id}
    if not out:
        return out
    wanted = Q(visit_id__in=list(out))
    if by_appt:
        wanted |= Q(order__appointment_id__in=list(by_appt))
    reports = (
        LabReport.objects.filter(wanted, resulted_at__isnull=False)
        .exclude(status="entered_in_error")
        .select_related("order")
        .order_by("resulted_at", "id")
    )
    discharged = {v.pk: v.discharge_datetime for v in visits}
    seen = set()
    for report in reports:
        owner = report.visit_id if report.visit_id in out else by_appt.get(report.order.appointment_id if report.order_id else None)
        if owner is None or report.pk in seen or report.resulted_at <= discharged[owner]:
            continue
        seen.add(report.pk)
        item = out[owner]
        if report.review_status == "unreviewed":
            item["count"] += 1
            name = (report.title or (report.order.orderable_name if report.order_id else "") or "Result").strip()
            if name not in item["tests"]:
                item["tests"].append(name)
            item["state"] = "new"
        elif item["state"] == "none":
            item["state"] = "reviewed"
    return out


def follow_up_days(raw):
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_FOLLOW_UP_DAYS
    return min(max(days, 1), MAX_FOLLOW_UP_DAYS)


def _discharged_visits(org, unit, days):
    since = timezone.now() - timedelta(days=days)
    return list(
        Registration.objects.filter(care_setting="emergency", discharge_datetime__isnull=False, discharge_datetime__gte=since)
        .filter(Q(unit=unit) | Q(unit__isnull=True))
        .filter(Q(organization=org) | Q(patient__user__organization=org))
        .select_related(*_RELATED)
        .order_by("-discharge_datetime", "-pk")[:500]
    )


class EdFollowUpView(APIView):
    """
    GET ?unit=<emergency unit id>&days=<1-30, default 7>&summary=1?

    The ED Follow-up board: ED visits discharged in the last `days` days, newest first, with when each patient
    was discharged and whether results arrived after they left. Patients with results nobody has reviewed come
    first. `summary=1` returns only {"needs_review": n} (the count on the tab).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in ROLES:
            return _bad("You do not have permission to see the ED board.", 403)
        org = _org(request)
        if org is None:
            return _bad("No clinic is selected.")
        units, departments = _departments(request, org)
        raw = request.query_params.get("unit")
        unit = next((u for u in units if str(u.pk) == str(raw)), None) if raw else (units[0] if units else None)
        if raw and unit is None:
            return _bad("That is not an emergency department in this clinic.", 404)
        days = follow_up_days(request.query_params.get("days"))
        summary = request.query_params.get("summary") in ("1", "true")
        base = {} if summary else _board_base(org, unit, departments, request.user, "follow_up")
        if unit is None:
            return Response({"needs_review": 0} if summary else {**base, "unit": None, "days": days, "needs_review": 0, "total": 0, "rows": []})

        visits = _discharged_visits(org, unit, days)
        results = new_result_summaries(visits)
        needs_review = sum(1 for r in results.values() if r["state"] == "new")
        if summary:
            return Response({"needs_review": needs_review})

        keys = {s["value"] for s in base["statuses"]}
        chart = chart_summaries(visits, triage_service.clinic_gaps(org))
        rows = []
        for visit in visits:
            data = board_visit(visit, chart[visit.pk], keys)
            data["discharged_at"] = visit.discharge_datetime
            data["new_results"] = results[visit.pk]
            rows.append({"type": "followup", "bed": None, "loc": "", "bed_status": "", "hold_reason": "", "visit": data})
        # patients with results nobody has looked at first, then the most recent discharge
        rows.sort(key=lambda r: (r["visit"]["new_results"]["state"] != "new",))
        return Response({**base, "unit": unit.pk, "days": days, "needs_review": needs_review, "total": len(rows), "rows": rows})


def _staff(org, pk, role):
    return CustomUser.objects.filter(pk=pk, organization=org, role=role, is_active=True).first()


def _clean_custom(values, settings, current):
    """(merged custom values, problem): checks each value against the custom column an admin built."""
    if not isinstance(values, dict):
        return None, "Custom values must be an object."
    columns = {c["key"]: c for c in settings["custom_columns"]}
    merged = dict(current or {})
    for key, value in values.items():
        column = columns.get(key)
        if column is None:
            return None, f"'{key}' is not a column on this board."
        kind = column.get("kind", "text")
        if kind == "checkbox":
            merged[key] = value in (True, "true", "True", "1", 1)
        elif kind == "dropdown":
            value = "" if value is None else str(value)
            if value and value not in column.get("options", []):
                return None, f"'{value}' is not a choice for {column['label']}."
            merged[key] = value
        else:
            merged[key] = ("" if value is None else str(value)).strip()[:200]
    return merged, None


class BoardUpdateView(APIView):
    """
    PATCH {esi?, ed_status?, assigned_nurse?, attending_provider?, resident?, reason?, complaint?, comments?, registration_complete?}

    Edits the board fields of an open visit. Send only what changed; null or "" clears a field.
    """

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in ROLES:
            return _bad("You do not have permission to edit the board.", 403)
        org = _org(request)
        if org is None:
            return _bad("No clinic is selected.")
        visit = Registration.objects.filter(pk=pk).filter(Q(organization=org) | Q(patient__user__organization=org)).select_related(*_RELATED).first()
        if visit is None:
            return _bad("Visit not found.", 404)
        if visit.discharge_datetime is not None:
            return _bad("This visit has been discharged, so it cannot be edited here.")
        data = request.data
        settings = get_settings(org)

        if "esi" in data:
            raw = data["esi"]
            if raw in (None, ""):
                visit.esi = None
            else:
                try:
                    level = int(raw)
                except (TypeError, ValueError):
                    return _bad("ESI must be a number from 1 to 5.")
                if not 1 <= level <= 5:
                    return _bad("ESI must be a number from 1 to 5.")
                visit.esi = level
        if "ed_status" in data:
            value = data["ed_status"] or ""
            if value and value not in status_keys(settings):
                return _bad("That is not a known ED status.")
            visit.ed_status = value
        if "assigned_nurse" in data:
            if data["assigned_nurse"] in (None, ""):
                visit.assigned_nurse = None
            else:
                nurse = _staff(org, data["assigned_nurse"], "nurse")
                if nurse is None:
                    return _bad("That nurse was not found.")
                visit.assigned_nurse = nurse
        if "attending_provider" in data:
            if data["attending_provider"] in (None, ""):
                visit.attending_provider = None
            else:
                doctor = _staff(org, data["attending_provider"], "doctor")
                if doctor is None:
                    return _bad("That doctor was not found.")
                visit.attending_provider = doctor
        if "resident" in data:
            if data["resident"] in (None, ""):
                visit.resident_provider = None
            else:
                resident = _staff(org, data["resident"], "doctor")
                if resident is None:
                    return _bad("That resident was not found.")
                visit.resident_provider = resident
            visit.resident = ""  # the old typed name is replaced by the pick (or cleared with it)
        if "reason" in data:
            visit.reason_for_visit = str(data["reason"] or "").strip()[:500]
        if "complaint" in data:
            visit.presenting_problem = str(data["complaint"] or "").strip()[:500]
        if "comments" in data:
            visit.board_comments = str(data["comments"] or "").strip()[:300]
        if "registration_complete" in data:
            visit.registration_complete = data["registration_complete"] in (True, "true", "True", "1", 1)
        if "custom" in data:
            custom, problem = _clean_custom(data["custom"], settings, visit.board_custom)
            if problem:
                return _bad(problem)
            visit.board_custom = custom
        visit.save()
        visit = Registration.objects.select_related(*_RELATED).get(pk=visit.pk)
        return Response(board_visit(visit, chart_summaries([visit], triage_service.clinic_gaps(org))[visit.pk], status_keys(settings), waiting=visit.bed_id is None))
