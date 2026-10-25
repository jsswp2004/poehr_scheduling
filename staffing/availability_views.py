"""
"Who can be assigned" for a date -- feeds the Assign Schedule panel.

  GET /api/staffing/availability/?date=YYYY-MM-DD[&unit=<id>]

Every active staff member is put in exactly one state for the date:
  time_off     approved / pending off request, or an open call-out
  working      already has a non-cancelled shift that day
  no_schedule  no active recurring pattern (and not off / working)
  available    free to be assigned
"""

import datetime

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from . import org_scope
from .coverage import shift_hours
from .coverage_status import compute_coverage_status
from .models import Staff, StaffRecurringPattern, StaffShift, StaffTimeOffRequest
from .views import IsStaffingManager, _parse_date_cell

WEEKLY_CAP_HOURS = 36.0
NURSING_LABELS = {"rn": "RN", "lpn": "LPN", "cna": "CNA"}
TITLE_ABBREVIATIONS = {
    "physician": "MD",
    "doctor": "MD",
    "md": "MD",
    "nurse practitioner": "NP",
    "np": "NP",
    "physician assistant": "PA",
    "pa": "PA",
    "medical assistant": "MA",
    "ma": "MA",
    "technician": "Tech",
    "tech": "Tech",
}


def role_label(staff):
    """Short role for display: RN/LPN/CNA, else an abbreviated profession."""
    if staff.nursing_role in NURSING_LABELS:
        return NURSING_LABELS[staff.nursing_role]
    prof = (staff.profession or "").strip()
    return TITLE_ABBREVIATIONS.get(prof.lower(), prof or "Staff")


def role_key(staff):
    return role_label(staff).lower()


def _gaps(org, day, unit_id):
    """Open needs for the date: [{unit_id, unit_name, shift_type, label, kind, count}]."""
    cov = compute_coverage_status(org, day, day, unit_id=unit_id)
    items = ((cov.get("days") or {}).get(day.isoformat()) or {}).get("items") or []
    out = []
    for it in items:
        if it.get("status") in (None, "unknown", "met") or it.get("shift_type") is None:
            continue
        req, got = it.get("required"), it.get("assigned")
        if req is not None and got is not None and req > got:
            out.append({**_gap_base(it), "kind": "staff", "role": None, "count": req - got})
        rn_req, rn_got = it.get("required_rn"), it.get("rn_scheduled")
        if rn_req is not None and rn_got is not None and rn_req > rn_got:
            out.append({**_gap_base(it), "kind": "rn", "role": "rn", "count": rn_req - rn_got})
    return out


def _gap_base(it):
    return {
        "unit_id": it.get("unit_id"),
        "unit_name": it.get("unit_name"),
        "shift_type": it.get("shift_type"),
        "label": it.get("shift_label") or it.get("shift_type"),
    }


class AvailabilityView(APIView):
    permission_classes = [IsStaffingManager]

    def get(self, request):
        org = org_scope.acting_org(request)
        if org is None:
            return Response({"error": "No organization for this user."}, status=400)

        raw = request.query_params.get("date")
        try:
            day = _parse_date_cell(raw, "date") if raw else timezone.localdate()
            unit = request.query_params.get("unit")
            unit_id = int(unit) if unit else None
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        staff_list = list(Staff.objects.filter(organization=org, is_active=True))
        ids = [s.id for s in staff_list]

        # Week (Mon..Sun) containing the date, for hours and the overtime flag.
        wk_lo = day - datetime.timedelta(days=day.weekday())
        wk_hi = wk_lo + datetime.timedelta(days=6)
        week_hours, day_shifts = {}, {}
        for sh in StaffShift.objects.filter(
            organization=org, staff_id__in=ids, date__gte=wk_lo, date__lte=wk_hi, is_cancelled=False
        ).select_related("unit"):
            week_hours[sh.staff_id] = week_hours.get(sh.staff_id, 0.0) + shift_hours(sh)
            if sh.date == day:
                day_shifts.setdefault(sh.staff_id, []).append(sh)

        off = {}
        for r in StaffTimeOffRequest.objects.filter(
            organization=org, staff_id__in=ids, start_date__lte=day, end_date__gte=day
        ):
            if r.takes_staff_out or r.is_pending_off:
                prev = off.get(r.staff_id)
                if prev is None or (r.takes_staff_out and not prev.takes_staff_out):
                    off[r.staff_id] = r

        patterned = set(
            p.staff_id
            for p in StaffRecurringPattern.objects.filter(
                organization=org, staff_id__in=ids, is_active=True
            )
            if not p.end_date or p.end_date >= day
        )

        gaps = _gaps(org, day, unit_id)
        gap_roles = {g["role"] for g in gaps if g["role"]}
        has_staff_gap = any(g["kind"] == "staff" for g in gaps)

        people = []
        for st in staff_list:
            hrs = round(week_hours.get(st.id, 0.0), 1)
            row = {
                "id": st.id,
                "name": st.full_name,
                "role": role_label(st),
                "role_key": role_key(st),
                "nursing_role": st.nursing_role,
                "week_hours": hrs,
                "weekly_cap": WEEKLY_CAP_HOURS,
                "overtime": hrs >= WEEKLY_CAP_HOURS,
                "phone_number": st.phone_number,
                "state": "available",
                "detail": None,
                "fits_gap": False,
            }
            req = off.get(st.id)
            if req is not None:
                row["state"] = "time_off"
                row["detail"] = {
                    "request_id": req.id,
                    "kind": req.kind,
                    "status": req.status,
                    "pending": req.is_pending_off,
                    "start_date": req.start_date.isoformat(),
                    "end_date": req.end_date.isoformat(),
                    "reason": req.reason or "",
                }
            elif st.id in day_shifts:
                row["state"] = "working"
                row["detail"] = {
                    "shifts": [
                        {
                            "shift_type": s.shift_type,
                            "shift_label": s.get_shift_type_display(),
                            "unit_id": s.unit_id,
                            "unit_name": s.unit.name if s.unit_id else None,
                        }
                        for s in day_shifts[st.id]
                    ]
                }
            elif st.id not in patterned:
                row["state"] = "no_schedule"
            if row["state"] in ("available", "no_schedule"):
                row["fits_gap"] = (
                    st.nursing_role in gap_roles
                    or (has_staff_gap and st.nursing_role in NURSING_LABELS)
                )
            people.append(row)

        people.sort(key=lambda p: (p["state"] != "available", p["week_hours"], p["name"]))

        counts = {"available": 0, "time_off": 0, "no_schedule": 0, "working": 0}
        roles = {}
        for p in people:
            counts[p["state"]] += 1
            roles[p["role"]] = roles.get(p["role"], 0) + 1

        return Response(
            {
                "date": day.isoformat(),
                "unit": unit_id,
                "counts": counts,
                "roles": [{"role": r, "count": n} for r, n in sorted(roles.items(), key=lambda x: (-x[1], x[0]))],
                "gaps": gaps,
                "people": people,
            }
        )
