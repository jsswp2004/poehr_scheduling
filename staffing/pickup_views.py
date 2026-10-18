"""
"Pick up a shift": a staff member volunteers for a short day from the Calendar.

    GET  /api/staffing/me/pickup/         who the signed-in user is on the roster
    POST /api/staffing/me/pick-up-shift/  create ONE shift for that person (source='pickup')
                                          and tell the admins by email + text

The Assign Schedule endpoints stay admin-only. This endpoint can only ever create a
single shift for the caller's own roster entry (Staff.user), never for anyone else.
"""

import datetime

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .alerts import notify_pickup
from .models import SHIFT_TYPE_CHOICES, StaffShift, Unit
from .views import MANAGER_ROLES, STAFF_LOGIN_ROLE, _staff_for_login

MAX_FUTURE_DAYS = 120
DEFAULT_TIMES = {
    "day": ("07:00", "15:00"),
    "evening": ("15:00", "23:00"),
    "night": ("23:00", "07:00"),
}
SHIFT_TYPES = [v for v, _ in SHIFT_TYPE_CHOICES]


class CanPickUp(permissions.BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.role in MANAGER_ROLES or u.role == STAFF_LOGIN_ROLE))


def _parse_time(raw, label):
    try:
        return datetime.time.fromisoformat(str(raw)[:5])
    except (TypeError, ValueError):
        raise ValueError(f"{label} must look like 07:00.")


def _span(start, end):
    """(start_minute, end_minute) with an overnight end rolled into the next day."""
    s = start.hour * 60 + start.minute
    e = end.hour * 60 + end.minute
    if e <= s:
        e += 1440
    return s, e


def _conflict(staff, date, start, end):
    """An existing, non-cancelled shift of this person that overlaps the new one, or None."""
    s, e = _span(start, end)
    same_day = StaffShift.objects.filter(staff=staff, date=date, is_cancelled=False)
    for other in same_day:
        if not (other.start_time and other.end_time):
            continue
        os_, oe = _span(other.start_time, other.end_time)
        if s < oe and os_ < e:
            return other
    # An overnight shift that started the evening before runs into this morning.
    for other in StaffShift.objects.filter(
        staff=staff, date=date - datetime.timedelta(days=1), is_cancelled=False
    ):
        if other.start_time and other.end_time:
            os_, oe = _span(other.start_time, other.end_time)
            if oe > 1440 and s < oe - 1440:
                return other
    return None


class MyPickupProfileView(APIView):
    permission_classes = [CanPickUp]

    def get(self, request):
        staff = _staff_for_login(request)
        if staff is None:
            return Response({"staff_id": None, "full_name": request.user.get_full_name() or request.user.get_username()})
        return Response(
            {"staff_id": staff.id, "full_name": staff.full_name, "profession": staff.profession}
        )


class PickUpShiftView(APIView):
    permission_classes = [CanPickUp]

    def post(self, request):
        staff = _staff_for_login(request)
        if staff is None:
            return Response(
                {"error": "Your login is not linked to a staff roster entry. Ask an admin to link it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not staff.is_active:
            return Response({"error": "Your roster entry is inactive."}, status=status.HTTP_400_BAD_REQUEST)
        d = request.data
        org = staff.organization

        try:
            date = datetime.date.fromisoformat(str(d.get("date") or ""))
        except ValueError:
            return Response({"error": "date must look like 2026-10-19."}, status=status.HTTP_400_BAD_REQUEST)
        today = timezone.localdate()
        if date < today:
            return Response({"error": "You can only pick up a shift from today onward."}, status=status.HTTP_400_BAD_REQUEST)
        if date > today + datetime.timedelta(days=MAX_FUTURE_DAYS):
            return Response({"error": f"You can pick up shifts up to {MAX_FUTURE_DAYS} days ahead."}, status=status.HTTP_400_BAD_REQUEST)

        shift_type = d.get("shift_type") or "day"
        if shift_type not in SHIFT_TYPES:
            return Response({"error": "Unknown shift type."}, status=status.HTTP_400_BAD_REQUEST)
        default = DEFAULT_TIMES.get(shift_type)
        try:
            start = _parse_time(d.get("start_time") or (default[0] if default else None), "Start time")
            end = _parse_time(d.get("end_time") or (default[1] if default else None), "End time")
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if start == end:
            return Response({"error": "Start and end time cannot be the same."}, status=status.HTTP_400_BAD_REQUEST)

        unit = None
        if d.get("unit") not in (None, ""):
            try:
                unit = Unit.objects.get(pk=int(d["unit"]), organization=org, is_active=True)
            except (Unit.DoesNotExist, ValueError, TypeError):
                return Response({"error": "That unit was not found."}, status=status.HTTP_400_BAD_REQUEST)

        clash = _conflict(staff, date, start, end)
        if clash is not None:
            return Response(
                {"error": f"You already have a {clash.get_shift_type_display().lower()} shift that overlaps this time on {date:%b %d}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shift = StaffShift.objects.create(
            organization=org,
            staff=staff,
            unit=unit,
            date=date,
            shift_type=shift_type,
            start_time=start,
            end_time=end,
            source="pickup",
            notes=(str(d.get("notes") or "").strip() or None),
        )
        alert = notify_pickup(shift)
        return Response(
            {
                "id": shift.id,
                "date": date.isoformat(),
                "shift_type": shift_type,
                "unit_name": unit.name if unit else None,
                "alert": {"emails": alert["emails"], "sms": alert["sms"]},
            },
            status=status.HTTP_201_CREATED,
        )
