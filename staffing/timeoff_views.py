"""
Time-off requests and emergency call-outs.

Staff (role 'staff' with a linked roster entry):
  GET/POST /api/staffing/me/time-off/              list mine / submit
  POST     /api/staffing/me/time-off/<id>/cancel/  withdraw a pending request

Managers (read) / admins (write):
  GET  /api/staffing/time-off/?status=&kind=&start=&end=&staff=
  POST /api/staffing/time-off/                     admin logs one on someone's behalf
  POST /api/staffing/time-off/<id>/decide/         {decision: approved|denied, admin_note}
  POST /api/staffing/time-off/<id>/resolve/        {cover_staff_id?, admin_note?, dismiss?}
  GET  /api/staffing/time-off/<id>/cover-candidates/
"""

import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .alerts import affected_shifts, cover_candidates, notify_emergency
from .models import Staff, StaffShift, StaffTimeOffRequest
from .views import (
    ADMIN_ROLES,
    IsStaffLogin,
    IsStaffingManager,
    _org_queryset,
    _parse_date_cell,
    _staff_for_login,
)

R = StaffTimeOffRequest
MAX_OFF_SPAN_DAYS = 60
MAX_FUTURE_DAYS = 400
LIST_LIMIT = 200


def _shift_brief(s):
    return {
        "id": s.id,
        "date": s.date.isoformat(),
        "shift_type": s.shift_type,
        "shift_type_display": s.get_shift_type_display(),
        "unit_id": s.unit_id,
        "unit_name": s.unit.name if s.unit_id else None,
        "start_time": s.start_time.strftime("%H:%M") if s.start_time else None,
        "end_time": s.end_time.strftime("%H:%M") if s.end_time else None,
    }


def serialize(req, with_shifts=False):
    data = {
        "id": req.id,
        "kind": req.kind,
        "kind_display": req.get_kind_display(),
        "status": req.status,
        "status_display": req.get_status_display(),
        "staff_id": req.staff_id,
        "staff_name": req.staff.full_name,
        "nursing_role": req.staff.nursing_role,
        "start_date": req.start_date.isoformat(),
        "end_date": req.end_date.isoformat(),
        "shift_id": req.shift_id,
        "reason": req.reason,
        "admin_note": req.admin_note,
        "cover_staff_id": req.cover_staff_id,
        "cover_staff_name": req.cover_staff.full_name if req.cover_staff_id else None,
        "created_at": req.created_at.isoformat(),
        "decided_at": req.decided_at.isoformat() if req.decided_at else None,
        "alert_sent": bool(req.alert_sent_at),
    }
    if with_shifts:
        data["affected_shifts"] = [_shift_brief(s) for s in affected_shifts(req)]
    return data


def _require_admin(request):
    if request.user.role not in ADMIN_ROLES:
        return Response({"error": "Only admins can do this."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _clean_request(staff, data, reported_by, admin_entry=False):
    """
    Validate the payload and build (but do not save) a StaffTimeOffRequest.
    Returns (request_obj, None) or (None, Response).
    """
    kind = (data.get("kind") or "").strip()
    if kind not in (R.KIND_OFF_REQUEST, R.KIND_EMERGENCY):
        return None, Response({"error": "kind must be 'off_request' or 'emergency'."}, status=400)

    today = timezone.localdate()
    shift = None
    shift_id = data.get("shift_id")
    if shift_id not in (None, ""):
        try:
            shift = StaffShift.objects.get(pk=shift_id, staff=staff, is_cancelled=False)
        except (StaffShift.DoesNotExist, ValueError, TypeError):
            return None, Response({"error": "That shift was not found for this staff member."}, status=400)

    try:
        start = _parse_date_cell(data.get("start_date"), "start_date") if data.get("start_date") else None
        end = _parse_date_cell(data.get("end_date"), "end_date") if data.get("end_date") else None
    except ValueError as e:
        return None, Response({"error": str(e)}, status=400)

    if shift is not None:
        start = end = shift.date
    if start is None:
        if kind == R.KIND_EMERGENCY:
            start = today
        else:
            return None, Response({"error": "start_date is required."}, status=400)
    end = end or start
    if end < start:
        return None, Response({"error": "end_date cannot be before start_date."}, status=400)

    if kind == R.KIND_OFF_REQUEST:
        if start < today and not admin_entry:
            return None, Response({"error": "Time-off requests must be for today or later."}, status=400)
        if (end - start).days + 1 > MAX_OFF_SPAN_DAYS:
            return None, Response({"error": f"A request can span at most {MAX_OFF_SPAN_DAYS} days."}, status=400)
        if (start - today).days > MAX_FUTURE_DAYS:
            return None, Response({"error": "That date is too far in the future."}, status=400)
        initial = R.STATUS_APPROVED if admin_entry else R.STATUS_PENDING
    else:
        # Emergencies are about now: yesterday (overnight shift still running) to tomorrow.
        if start < today - datetime.timedelta(days=1) or end > today + datetime.timedelta(days=2):
            return None, Response(
                {"error": "Emergency call-outs are for today or the next day. For later dates, submit a time-off request."},
                status=400,
            )
        initial = R.STATUS_OPEN

    obj = R(
        organization=staff.organization,
        staff=staff,
        kind=kind,
        status=initial,
        start_date=start,
        end_date=end,
        shift=shift,
        reason=(data.get("reason") or "").strip()[:2000],
        reported_by=reported_by,
    )
    if admin_entry and kind == R.KIND_OFF_REQUEST:
        obj.decided_by = reported_by
        obj.decided_at = timezone.now()
    return obj, None


def _existing_open_emergency(staff, obj):
    qs = R.objects.filter(
        staff=staff,
        kind=R.KIND_EMERGENCY,
        status=R.STATUS_OPEN,
        start_date__lte=obj.end_date,
        end_date__gte=obj.start_date,
    )
    qs = qs.filter(shift=obj.shift) if obj.shift_id else qs.filter(shift__isnull=True)
    return qs.first()


def _create(staff, data, user, admin_entry):
    obj, err = _clean_request(staff, data, user, admin_entry)
    if err:
        return err
    if obj.is_emergency:
        dup = _existing_open_emergency(staff, obj)
        if dup:  # double-tap / retry: do not alert twice
            return Response({**serialize(dup), "alert_sent": bool(dup.alert_sent_at), "duplicate": True})
    obj.save()
    payload = serialize(obj, with_shifts=True)
    if obj.is_emergency:
        summary = notify_emergency(obj)
        payload["alert_sent"] = bool(summary["emails"] or summary["sms"])
        obj.refresh_from_db()
    return Response(payload, status=status.HTTP_201_CREATED)


# --------------------------------------------------------------------------- staff
class MyTimeOffView(APIView):
    permission_classes = [IsStaffLogin]

    def get(self, request):
        staff = _staff_for_login(request)
        qs = R.objects.filter(staff=staff).select_related("staff", "cover_staff")[:LIST_LIMIT]
        return Response([serialize(r) for r in qs])

    def post(self, request):
        staff = _staff_for_login(request)
        return _create(staff, request.data, request.user, admin_entry=False)


class MyTimeOffCancelView(APIView):
    permission_classes = [IsStaffLogin]

    def post(self, request, pk):
        staff = _staff_for_login(request)
        try:
            req = R.objects.select_related("staff", "cover_staff").get(pk=pk, staff=staff)
        except R.DoesNotExist:
            return Response({"error": "Not found."}, status=404)
        if req.kind != R.KIND_OFF_REQUEST or req.status != R.STATUS_PENDING:
            return Response(
                {"error": "Only a pending time-off request can be withdrawn. For an emergency, call your manager."},
                status=400,
            )
        req.status = R.STATUS_CANCELLED
        req.save(update_fields=["status", "updated_at"])
        return Response(serialize(req))


# -------------------------------------------------------------------------- managers
class TimeOffListCreateView(APIView):
    permission_classes = [IsStaffingManager]

    def get(self, request):
        qs = _org_queryset(R, request).select_related("staff", "cover_staff")
        p = request.query_params
        if p.get("status"):
            qs = qs.filter(status__in=[s for s in p["status"].split(",") if s])
        if p.get("kind"):
            qs = qs.filter(kind=p["kind"])
        if p.get("staff"):
            qs = qs.filter(staff_id=p["staff"])
        try:
            if p.get("start"):
                qs = qs.filter(end_date__gte=_parse_date_cell(p["start"], "start"))
            if p.get("end"):
                qs = qs.filter(start_date__lte=_parse_date_cell(p["end"], "end"))
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        rows = list(qs[:LIST_LIMIT])
        # Emergencies first, then newest.
        rows.sort(key=lambda r: (r.kind != R.KIND_EMERGENCY, -r.created_at.timestamp()))
        return Response({
            "open_emergencies": sum(1 for r in rows if r.kind == R.KIND_EMERGENCY and r.status == R.STATUS_OPEN),
            "pending_requests": sum(1 for r in rows if r.status == R.STATUS_PENDING),
            "results": [serialize(r, with_shifts=(r.status == R.STATUS_OPEN)) for r in rows],
        })

    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        try:
            staff = _org_queryset(Staff, request).select_related("organization").get(
                pk=request.data.get("staff_id")
            )
        except (Staff.DoesNotExist, ValueError, TypeError):
            return Response({"error": "staff_id is required and must be a roster member."}, status=400)
        return _create(staff, request.data, request.user, admin_entry=True)


def _get_request(request, pk):
    try:
        return _org_queryset(R, request).select_related("staff", "cover_staff", "organization").get(pk=pk)
    except R.DoesNotExist:
        return None


class TimeOffDecideView(APIView):
    permission_classes = [IsStaffingManager]

    def post(self, request, pk):
        denied = _require_admin(request)
        if denied:
            return denied
        req = _get_request(request, pk)
        if not req:
            return Response({"error": "Not found."}, status=404)
        decision = request.data.get("decision")
        if decision not in (R.STATUS_APPROVED, R.STATUS_DENIED):
            return Response({"error": "decision must be 'approved' or 'denied'."}, status=400)
        if req.kind != R.KIND_OFF_REQUEST or req.status != R.STATUS_PENDING:
            return Response({"error": "Only pending time-off requests can be decided."}, status=400)
        req.status = decision
        req.decided_by = request.user
        req.decided_at = timezone.now()
        req.admin_note = (request.data.get("admin_note") or "").strip()[:2000]
        req.save()
        return Response(serialize(req, with_shifts=True))


class TimeOffResolveView(APIView):
    """Close out an emergency: arrange cover (creates the cover's shift) or dismiss."""

    permission_classes = [IsStaffingManager]

    @transaction.atomic
    def post(self, request, pk):
        denied = _require_admin(request)
        if denied:
            return denied
        req = _get_request(request, pk)
        if not req:
            return Response({"error": "Not found."}, status=404)
        if req.kind != R.KIND_EMERGENCY or req.status != R.STATUS_OPEN:
            return Response({"error": "Only an open emergency can be resolved."}, status=400)

        note = (request.data.get("admin_note") or "").strip()[:2000]
        if request.data.get("dismiss"):
            req.status = R.STATUS_CANCELLED
            req.admin_note = note
            req.decided_by, req.decided_at = request.user, timezone.now()
            req.save()
            return Response(serialize(req, with_shifts=True))

        cover = None
        cover_id = request.data.get("cover_staff_id")
        created = 0
        if cover_id not in (None, ""):
            try:
                cover = _org_queryset(Staff, request).get(pk=cover_id, is_active=True)
            except (Staff.DoesNotExist, ValueError, TypeError):
                return Response({"error": "Cover staff member not found."}, status=400)
            if cover.pk == req.staff_id:
                return Response({"error": "The person who called out cannot cover their own shift."}, status=400)
            for s in affected_shifts(req):
                already = StaffShift.objects.filter(
                    staff=cover, date=s.date, shift_type=s.shift_type, is_cancelled=False
                ).exists()
                if already:
                    continue
                StaffShift.objects.create(
                    organization=req.organization,
                    staff=cover,
                    unit=s.unit,
                    date=s.date,
                    shift_type=s.shift_type,
                    start_time=s.start_time,
                    end_time=s.end_time,
                    source="manual",
                    notes=f"Cover for {req.staff.full_name} (emergency call-out)",
                )
                created += 1

        req.status = R.STATUS_RESOLVED
        req.cover_staff = cover
        req.admin_note = note
        req.decided_by, req.decided_at = request.user, timezone.now()
        req.save()
        payload = serialize(req, with_shifts=True)
        payload["cover_shifts_created"] = created
        return Response(payload)


class TimeOffCoverCandidatesView(APIView):
    permission_classes = [IsStaffingManager]

    def get(self, request, pk):
        denied = _require_admin(request)
        if denied:
            return denied
        req = _get_request(request, pk)
        if not req:
            return Response({"error": "Not found."}, status=404)
        return Response({"request": serialize(req, with_shifts=True), "candidates": cover_candidates(req)})
