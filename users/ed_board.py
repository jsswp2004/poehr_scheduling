"""
The ED board: a live status board for an emergency department.

One row per bed in the chosen emergency unit (empty beds show as Ready), plus the patients
who are in the ED but have no bed yet (waiting). Staff edit the triage level, status, nurse,
resident, comments and registration flag right on the board. Moving, admitting and discharging
use the admit / transfer / discharge views in admissions.py.
"""
import re
from datetime import date

from django.db.models import Q
from django.utils.dateparse import parse_datetime
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.locations import bed_status
from appointments.models import Bed, Order, Unit, VitalSignsFlowsheet

from .admissions import ROLES, _bad, _org
from .board_config import BUILTIN_VIEW_KEYS, DEFAULT_STATUSES, bed_label, all_view_payloads, get_settings, roster_for, status_keys
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


# -- chart summary: last vitals and what has been ordered --------------------------------------
VITALS_TEMPLATE_CODE = "vital_signs"
# Order statuses that show on the board (drafts and discontinued orders do not)
_BOARD_ORDER_STATUSES = ("pending_cosign", "active", "in_progress", "completed")
_EKG = re.compile(r"\b(ekg|ecg|electrocardiogram)\b", re.I)
_URINE = re.compile(r"urin|\bua\b", re.I)
_CARDIAC = re.compile(r"troponin|\bbnp\b|ck-?mb|cardiac|\bkoe\b|echo", re.I)


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


def chart_summaries(visits):
    """{registration id: {"vitals_last_at": iso or None, "orders": {icon: "pending" | "done"}}} in two queries."""
    by_appt = {v.appointment_id: v.pk for v in visits if v.appointment_id}
    out = {v.pk: {"vitals_last_at": None, "orders": {}} for v in visits}
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

    for appt_id, name, category, status in Order.objects.filter(
        appointment_id__in=by_appt, status__in=_BOARD_ORDER_STATUSES
    ).values_list("appointment_id", "orderable_name", "orderable_category", "status"):
        icons = out[by_appt[appt_id]]["orders"]
        for icon in order_icons(name, category):
            if status == "completed":
                icons.setdefault(icon, "done")
            else:
                icons[icon] = "pending"

    for item in out.values():
        if item["vitals_last_at"]:
            item["vitals_last_at"] = item["vitals_last_at"].isoformat()
    return out


def board_visit(visit, chart=None):
    """One patient's row data on the board."""
    patient = visit.patient
    user = patient.user
    return {
        "registration": visit.pk,
        "visit_number": visit.visit_number,
        "patient": patient.pk,
        "user_id": user.pk,
        "name": f"{user.last_name.upper()}, {user.first_name}".strip(", "),
        "age": _age(patient.date_of_birth),
        "sex": patient.legal_sex or "",
        "arrival_time": visit.arrival_time or visit.created_at,
        "reason": visit.reason_for_visit,
        "complaint": visit.presenting_problem,
        "esi": visit.esi,
        "ed_status": visit.ed_status,
        "md": {"id": visit.attending_provider_id, "name": _name(visit.attending_provider)} if visit.attending_provider_id else None,
        "rn": {"id": visit.assigned_nurse_id, "name": _name(visit.assigned_nurse)} if visit.assigned_nurse_id else None,
        "resident": visit.resident,
        "comments": visit.board_comments,
        "registration_complete": visit.registration_complete,
        "custom": visit.board_custom or {},
        "location": visit.location_path() or visit.assigned_location,
        "vitals_last_at": (chart or {}).get("vitals_last_at"),
        "orders": (chart or {}).get("orders", {}),
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


def _board_base(org, unit, departments, user):
    """The views, statuses and staff lists a department's board uses."""
    settings = get_settings(org)
    views = all_view_payloads(org, settings)
    roster = roster_for(settings, unit.pk if unit else None)
    return {
        "departments": departments,
        "statuses": settings["statuses"],
        "views": views,
        "default_view": _default_view_key(user, org, views),
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


_RELATED = ("patient__user", "attending_provider", "assigned_nurse", "bed__room", "room", "unit__facility")


class EdBoardView(APIView):
    """GET ?unit=<emergency unit id>: the board for that department (default: the first one)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in ROLES:
            return _bad("You do not have permission to see the ED board.", 403)
        org = _org(request)
        if org is None:
            return _bad("No clinic is selected.")

        units = list(
            Unit.objects.filter(facility__organization=org, care_type="emergency", is_active=True, facility__is_active=True)
            .select_related("facility")
            .order_by("facility__name", "name")
        )
        departments = [{"id": u.pk, "name": u.name, "facility": u.facility_id, "facility_name": u.facility.name} for u in units]
        raw = request.query_params.get("unit")
        unit = next((u for u in units if str(u.pk) == str(raw)), None) if raw else (units[0] if units else None)
        if raw and unit is None:
            return _bad("That is not an emergency department in this clinic.", 404)
        base = _board_base(org, unit, departments, request.user)
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
        chart = chart_summaries(shown)

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
                    "visit": board_visit(visit, chart[visit.pk]) if visit else None,
                }
            )

        # in the ED but not in a bed yet (this department's, or not placed in any)
        for visit in waiting:
            rows.append({"type": "waiting", "bed": None, "loc": "", "bed_status": "", "hold_reason": "", "visit": board_visit(visit, chart[visit.pk])})
        return Response({**base, "unit": unit.pk, "rows": rows})


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
    PATCH {esi?, ed_status?, assigned_nurse?, attending_provider?, resident?, comments?, registration_complete?}

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
            visit.resident = str(data["resident"] or "").strip()[:120]
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
        return Response(board_visit(visit, chart_summaries([visit])[visit.pk]))
