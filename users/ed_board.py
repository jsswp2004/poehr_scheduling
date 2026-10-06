"""
The ED board: a live status board for an emergency department.

One row per bed in the chosen emergency unit (empty beds show as Ready), plus the patients
who are in the ED but have no bed yet (waiting). Staff edit the triage level, status, nurse,
resident, comments and registration flag right on the board. Moving, admitting and discharging
use the admit / transfer / discharge views in admissions.py.
"""
from datetime import date

from django.db.models import Q
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.locations import bed_status
from appointments.models import Bed, Unit

from .admissions import ROLES, _bad, _org
from .models import CustomUser, Registration

# The ED statuses (a later step lets an admin edit this list from the board builder).
ED_STATUSES = [
    ("wtbs", "WTBS", "Waiting to be seen"),
    ("tip", "TIP", "Treatment in progress"),
    ("dispo", "DISPO", "Disposition pending"),
    ("admit_pending", "ADM", "Admit pending"),
    ("discharge_pending", "DC", "Discharge pending"),
]
STATUS_KEYS = {k for k, _a, _b in ED_STATUSES}


def _name(user):
    if user is None:
        return ""
    return f"{user.last_name}, {user.first_name}".strip(", ")


def _age(dob):
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def board_visit(visit):
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
        "location": visit.location_path() or visit.assigned_location,
    }


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
        base = {
            "departments": departments,
            "statuses": [{"value": k, "code": c, "label": label} for k, c, label in ED_STATUSES],
            "staff": {
                "nurses": [
                    {"id": u.pk, "name": _name(u)}
                    for u in CustomUser.objects.filter(organization=org, role="nurse", is_active=True).order_by("last_name", "first_name")
                ],
                "doctors": [
                    {"id": u.pk, "name": _name(u)}
                    for u in CustomUser.objects.filter(organization=org, role="doctor", is_active=True).order_by("last_name", "first_name")
                ],
            },
        }

        raw = request.query_params.get("unit")
        unit = next((u for u in units if str(u.pk) == str(raw)), None) if raw else (units[0] if units else None)
        if raw and unit is None:
            return _bad("That is not an emergency department in this clinic.", 404)
        if unit is None:
            return Response({**base, "unit": None, "rows": []})

        open_visits = Registration.objects.filter(discharge_datetime__isnull=True).select_related(*_RELATED)
        in_beds = {r.bed_id: r for r in open_visits.filter(bed__room__unit=unit)}

        rows = []
        beds = Bed.objects.filter(room__unit=unit, is_active=True, room__is_active=True).select_related("room").order_by("room__name", "name")
        occupied = {b: True for b in in_beds}
        for bed in beds:
            visit = in_beds.get(bed.pk)
            rows.append(
                {
                    "type": "bed",
                    "bed": bed.pk,
                    "loc": f"{bed.room.name}{bed.name}",
                    "bed_status": bed_status(bed, occupied),
                    "hold_reason": bed.hold_reason,
                    "visit": board_visit(visit) if visit else None,
                }
            )

        # in the ED but not in a bed yet (this department's, or not placed in any)
        waiting = (
            open_visits.filter(care_setting="emergency", bed__isnull=True)
            .filter(Q(unit=unit) | Q(unit__isnull=True))
            .filter(Q(organization=org) | Q(patient__user__organization=org))
            .order_by("arrival_time", "created_at")
        )
        for visit in waiting:
            rows.append({"type": "waiting", "bed": None, "loc": "", "bed_status": "", "hold_reason": "", "visit": board_visit(visit)})
        return Response({**base, "unit": unit.pk, "rows": rows})


def _staff(org, pk, role):
    return CustomUser.objects.filter(pk=pk, organization=org, role=role, is_active=True).first()


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
            if value and value not in STATUS_KEYS:
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
        visit.save()
        visit = Registration.objects.select_related(*_RELATED).get(pk=visit.pk)
        return Response(board_visit(visit))
