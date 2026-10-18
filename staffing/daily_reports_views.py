"""
GET daily-reports/<kind>/pdf/?date=YYYY-MM-DD&shift=day|evening|night&unit=<id>|all&tz=<IANA zone>

The facility's daily staffing forms as printable PDFs, filled in from the calendar
shifts (Calendar tab / Create schedule), the Units list and the daily census.

    kind         what it prints                                    needs
    assignment   Daily Staffing Assignment Sheet (a page per unit) shift, optional unit
    shift-sheet  Daily Staffing Sheet                              shift
    hours        Current Staffing Hours                            shift
    worksheet    Nursing Staffing Worksheet (all three shifts)

Header = the organization's logo (its name when no logo is stored). Footer = who
printed it, when (in the reader's time zone) and Page n of N. Managers can print.
"""

import datetime
from zoneinfo import ZoneInfo

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import daily_report_pdf as pdf
from . import org_scope
from .daily_report_data import SHIFTS, DayData, UnitInfo, people_for, unit_sort_key
from .models import StaffShift, Unit, UnitCensus
from .views import IsStaffingManager

KINDS = ("assignment", "shift-sheet", "hours", "worksheet")


def load_day(org, date):
    """DayData for one organization and date, straight from the database."""
    units = sorted(
        Unit.objects.filter(organization=org, is_active=True), key=lambda u: unit_sort_key(u.name)
    )
    census = {
        c.unit_id: c.census
        for c in UnitCensus.objects.filter(unit__organization=org, date=date)
    }
    records = [
        {
            "staff_id": s.staff_id,
            "first_name": s.staff.first_name,
            "last_name": s.staff.last_name,
            "profession": s.staff.profession,
            "nursing_role": s.staff.nursing_role,
            "unit_id": s.unit_id,
            "unit_name": s.unit.name if s.unit_id else "",
            "date": s.date,
            "shift_type": s.shift_type,
            "start_time": s.start_time,
            "end_time": s.end_time,
        }
        for s in StaffShift.objects.filter(
            organization=org,
            is_cancelled=False,
            date__gte=date - datetime.timedelta(days=1),
            date__lte=date,
        ).select_related("staff", "unit")
    ]
    return DayData(
        date=date,
        facility=org.name,
        units=[
            UnitInfo(id=u.id, name=u.name, beds=u.bed_capacity, census=census.get(u.id)) for u in units
        ],
        people={shift: people_for(records, date, shift) for shift in SHIFTS},
    )


def _logo_bytes(org):
    try:
        if org.logo:
            with org.logo.open("rb") as f:
                return f.read()
    except Exception:
        pass
    return None


def _zone(name):
    try:
        return ZoneInfo(name) if name else timezone.get_current_timezone()
    except Exception:
        return timezone.get_current_timezone()


def _stamp(now):
    hour = now.hour % 12 or 12
    clock = f"{hour}:{now:%M} {now:%p} {now.tzname() or ''}".strip()
    return f"{now:%A, %b} {now.day}, {now:%Y} at {clock}", clock


class DailyStaffingReportView(APIView):
    permission_classes = [IsStaffingManager]

    def get(self, request, kind):
        if kind not in KINDS:
            return Response({"error": f"Unknown report '{kind}'."}, status=status.HTTP_404_NOT_FOUND)
        org = org_scope.acting_org(request, allow_body=True)
        if org is None:
            return Response({"error": "No organization."}, status=status.HTTP_400_BAD_REQUEST)

        tz = _zone(request.query_params.get("tz"))
        now = timezone.now().astimezone(tz)
        raw_date = request.query_params.get("date")
        try:
            date = datetime.date.fromisoformat(raw_date) if raw_date else now.date()
        except ValueError:
            return Response({"error": "date must look like 2026-10-17."}, status=status.HTTP_400_BAD_REQUEST)
        shift = request.query_params.get("shift") or "day"
        if kind != "worksheet" and shift not in SHIFTS:
            return Response({"error": "shift must be day, evening or night."}, status=status.HTTP_400_BAD_REQUEST)

        day = load_day(org, date)
        unit_id = None
        raw_unit = request.query_params.get("unit")
        if kind == "assignment" and raw_unit not in (None, "", "all"):
            try:
                unit_id = int(raw_unit)
            except ValueError:
                return Response({"error": "unit must be a unit id or 'all'."}, status=status.HTTP_400_BAD_REQUEST)
            if day.unit(unit_id) is None:
                return Response({"error": "That unit was not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        printed_at, printed_time = _stamp(now)
        ctx = pdf.PrintContext(
            facility=org.name,
            printed_by=(user.get_full_name() or user.get_username() or "").strip() or "Unknown user",
            printed_at=printed_at,
            printed_time=printed_time,
            logo=_logo_bytes(org),
        )
        if kind == "assignment":
            data = pdf.render_assignment(ctx, day, shift, unit_id)
        elif kind == "shift-sheet":
            data = pdf.render_shift_sheet(ctx, day, shift)
        elif kind == "hours":
            data = pdf.render_hours(ctx, day, shift)
        else:
            data = pdf.render_worksheet(ctx, day)

        name = f"{kind}_{date.isoformat()}" + ("" if kind == "worksheet" else f"_{shift}") + ".pdf"
        response = HttpResponse(data, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{name}"'
        response["Cache-Control"] = "no-store"
        return response
