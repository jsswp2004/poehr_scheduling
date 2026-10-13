"""
Changes the in-app assistant can PREPARE but never perform on its own.

HOW IT WORKS
------------
1. The model calls a "propose_*" tool. The tool validates the request with the
   SAME rules the app's own screens use, saves an AssistantPendingAction and
   returns a confirmation card. Nothing has been changed yet.
2. The app shows the card with Confirm / Cancel buttons.
3. Confirm calls POST /api/staffing/assistant/actions/<id>/confirm/ . That
   endpoint -- not the model -- runs the existing view AS THE SIGNED-IN USER
   (so role and organization rules apply again) and records the outcome.

The model has no tool that confirms. A pending action belongs to one user,
works once, and expires after EXPIRY_MINUTES.

Currently available (staff accounts, own data only):
  propose_time_off_request   -> POST me/time-off/ {kind: off_request}
  propose_emergency_callout  -> POST me/time-off/ {kind: emergency}
Admin actions (decide, assign cover, message staff) are added the same way.
"""

import datetime
import logging

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.test import force_authenticate

from . import assistant_tools as T
from .alerts import affected_shifts
from .models import AssistantPendingAction as P
from .models import StaffTimeOffRequest as R
from .timeoff_views import MyTimeOffView, _clean_request, _existing_open_emergency

logger = logging.getLogger(__name__)

EXPIRY_MINUTES = 10
MAX_OPEN_ACTIONS = 5   # waiting confirmations per user at once

ACTIONS = {}  # action_type -> {"tool", "title", "confirm_label", "execute"}


# --------------------------------------------------------------------------
# Formatting helpers (plain text for the card)
# --------------------------------------------------------------------------
def _day(d):
    return f"{d:%a %b} {d.day}"


def _clock(t):
    if t is None:
        return ""
    return f"{t.hour % 12 or 12}:{t:%M} {'am' if t.hour < 12 else 'pm'}"


def _shift_text(s):
    when = f"{_clock(s.start_time)}–{_clock(s.end_time)}"
    unit = f", {s.unit.name}" if getattr(s, "unit", None) else ""
    return f"{s.get_shift_type_display()} shift {_day(s.date)} ({when}{unit})"


def _error_text(response):
    data = getattr(response, "data", None)
    if isinstance(data, dict):
        return str(data.get("error") or data.get("detail") or "That could not be done.")
    return "That could not be done."


# --------------------------------------------------------------------------
# Creating and running pending actions
# --------------------------------------------------------------------------
def _create_pending(user, org_id, action_type, params, summary, warning=""):
    now = timezone.now()
    waiting = P.objects.filter(user=user, status=P.STATUS_PENDING, expires_at__gt=now).count()
    if waiting >= MAX_OPEN_ACTIONS:
        raise T.ToolError(
            "Several changes are already waiting for confirmation. Ask the user to confirm or cancel them first."
        )
    staff = getattr(user, "staff_profile", None)
    org = getattr(staff, "organization", None) or getattr(user, "organization", None)
    spec = ACTIONS[action_type]
    row = P.objects.create(
        organization=org,
        user=user,
        action_type=action_type,
        params=params,
        summary=summary[:500],
        target_org_id=org_id if org_id else None,
        expires_at=now + datetime.timedelta(minutes=EXPIRY_MINUTES),
    )
    card = {
        "id": str(row.id),
        "type": action_type,
        "title": spec["title"],
        "summary": row.summary,
        "warning": warning,
        "confirm_label": spec["confirm_label"],
        "expires_at": row.expires_at.isoformat(),
    }
    return {
        "status": "awaiting_confirmation",
        "prepared": row.summary,
        "pending_action": card,  # lifted out by the assistant; the model never sees the id
        "instructions": (
            "NOTHING HAS BEEN DONE YET. The app is showing the user a confirmation card. In one short sentence, "
            "say what you prepared and ask them to review it and tap Confirm. Do not say it was sent, submitted "
            "or done."
        ),
    }


def _run_view(view, user, body):
    request = T._factory.post("/api/staffing/", body, format="json")
    force_authenticate(request, user=user)
    return view(request)


def confirm(user, pk):
    """Run a pending action for the user who owns it. Returns (http_status, payload)."""
    try:
        with transaction.atomic():
            try:
                p = P.objects.select_for_update().get(pk=pk, user=user)
            except (P.DoesNotExist, ValidationError, ValueError):
                return 404, {"error": "That request wasn't found."}
            if p.status == P.STATUS_CONFIRMED:  # double tap / retry: report, do not run again
                return 200, {"status": "confirmed", "message": p.result_message, "already_done": True}
            if p.status == P.STATUS_CANCELLED:
                return 409, {"error": "That was cancelled."}
            if p.status == P.STATUS_FAILED:
                return 409, {"error": p.result_message or "That could not be done. Please ask again."}
            now = timezone.now()
            if p.expires_at <= now:
                p.status, p.decided_at = P.STATUS_CANCELLED, now
                p.result_message = "Expired before it was confirmed."
                p.save(update_fields=["status", "decided_at", "result_message"])
                return 410, {"error": "That confirmation expired. Ask me again and I'll prepare it fresh."}
            spec = ACTIONS.get(p.action_type)
            if spec is None or not T.allowed(user, spec["tool"]):
                return 403, {"error": "That isn't available with this account."}
            try:
                with transaction.atomic():
                    ok, message = spec["execute"](user, p.params)
            except Exception:  # noqa: BLE001 - safe message to the user, trace to the log
                logger.exception("assistant action %s failed", p.action_type)
                ok, message = False, "Something went wrong. Nothing was changed."
            p.status = P.STATUS_CONFIRMED if ok else P.STATUS_FAILED
            p.decided_at = now
            p.result_message = message[:300]
            p.save(update_fields=["status", "decided_at", "result_message"])
            if not ok:
                return 400, {"error": message}
            return 200, {"status": "confirmed", "message": message}
    except Exception:  # noqa: BLE001
        logger.exception("assistant confirm crashed")
        return 500, {"error": "Something went wrong. Please try again."}


def cancel(user, pk):
    try:
        p = P.objects.get(pk=pk, user=user)
    except (P.DoesNotExist, ValidationError, ValueError):
        return 404, {"error": "That request wasn't found."}
    if p.status == P.STATUS_PENDING:
        p.status, p.decided_at = P.STATUS_CANCELLED, timezone.now()
        p.result_message = "Cancelled by the user."
        p.save(update_fields=["status", "decided_at", "result_message"])
        return 200, {"status": "cancelled", "message": "Cancelled. Nothing was changed."}
    if p.status == P.STATUS_CANCELLED:
        return 200, {"status": "cancelled", "message": "Cancelled. Nothing was changed."}
    return 409, {"error": "That has already been done, so it can't be cancelled here."}


# --------------------------------------------------------------------------
# Staff: request time off
# --------------------------------------------------------------------------
def _execute_time_off(user, params):
    response = _run_view(
        MyTimeOffView.as_view(),
        user,
        {
            "kind": R.KIND_OFF_REQUEST,
            "start_date": params["start_date"],
            "end_date": params["end_date"],
            "reason": params.get("reason", ""),
        },
    )
    if response.status_code >= 400:
        return False, _error_text(response)
    return True, "Your time-off request was sent to your manager. It is pending approval."


ACTIONS["request_time_off"] = {
    "tool": "propose_time_off_request",
    "title": "Request time off",
    "confirm_label": "Send request",
    "execute": _execute_time_off,
}


@T.tool(
    "propose_time_off_request",
    "PREPARE (not submit) a planned time-off request for the signed-in staff member. The app then shows them a "
    "confirmation card and nothing is sent until they tap Confirm. Dates must be today or later (up to 60 days "
    "per request). Only include a reason if the user gave one; never ask for medical details. For being unable to "
    "work a shift today or tomorrow, use propose_emergency_callout instead.",
    {
        "start_date": {"type": "string", "description": "First day off, YYYY-MM-DD."},
        "end_date": {"type": "string", "description": "Last day off, YYYY-MM-DD. Defaults to start_date."},
        "reason": {"type": "string", "description": "Optional reason in the user's own words."},
    },
    required=["start_date"],
    modes=(T.MODE_STAFF,),
)
def propose_time_off_request(user, args, org_id):
    staff = user.staff_profile
    start = T._parse_date(args.get("start_date"), "start_date")
    end = T._parse_date(args.get("end_date"), "end_date") or start
    reason = str(args.get("reason") or "").strip()[:500]
    obj, err = _clean_request(
        staff,
        {
            "kind": R.KIND_OFF_REQUEST,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "reason": reason,
        },
        user,
    )
    if err is not None:
        raise T.ToolError(_error_text(err))
    clash = R.objects.filter(
        staff=staff,
        kind=R.KIND_OFF_REQUEST,
        status__in=[R.STATUS_PENDING, R.STATUS_APPROVED],
        start_date__lte=end,
        end_date__gte=start,
    ).first()
    if clash:
        raise T.ToolError(
            f"They already have a {clash.get_status_display().lower()} time-off request for "
            f"{_day(clash.start_date)} to {_day(clash.end_date)}. Tell the user instead of preparing a new one."
        )
    days = (end - start).days + 1
    when = _day(start) if days == 1 else f"{_day(start)} to {_day(end)} ({days} days)"
    summary = f"Time off: {when}."
    if reason:
        summary += f' Reason: "{reason[:150]}"'
    return _create_pending(
        user,
        org_id,
        "request_time_off",
        {"start_date": start.isoformat(), "end_date": end.isoformat(), "reason": reason},
        summary,
        warning="This goes to your manager as a pending request. You can withdraw it while it is pending.",
    )


# --------------------------------------------------------------------------
# Staff: "I can't make my shift"
# --------------------------------------------------------------------------
def _execute_callout(user, params):
    body = {"kind": R.KIND_EMERGENCY, "reason": params.get("reason", "")}
    if params.get("shift_id"):
        body["shift_id"] = params["shift_id"]
    else:
        body["start_date"] = body["end_date"] = params["date"]
    response = _run_view(MyTimeOffView.as_view(), user, body)
    if response.status_code >= 400:
        return False, _error_text(response)
    data = response.data if isinstance(response.data, dict) else {}
    if data.get("duplicate"):
        return True, "That was already reported. Your managers have been alerted."
    if data.get("alert_sent"):
        return True, "Reported. Your managers have been alerted."
    return True, "Reported, but no alert could be delivered. Please also call your unit right away."


ACTIONS["emergency_callout"] = {
    "tool": "propose_emergency_callout",
    "title": "Report: can't make my shift",
    "confirm_label": "Alert my managers",
    "execute": _execute_callout,
}


@T.tool(
    "propose_emergency_callout",
    "PREPARE (not submit) a report that the signed-in staff member cannot make a shift today or tomorrow (or an "
    "overnight shift that started yesterday). The app then shows them a confirmation card; their managers are "
    "alerted only after they tap Confirm. Pass shift_id (from get_my_shifts) for one shift, or just a date for all "
    "their shifts that day. For later dates use propose_time_off_request.",
    {
        "shift_id": {"type": "integer", "description": "The shift_id from get_my_shifts, for one specific shift."},
        "date": {"type": "string", "description": "YYYY-MM-DD when no shift_id is given. Defaults to today."},
        "reason": {"type": "string", "description": "Optional short reason in the user's words. No medical details."},
    },
    modes=(T.MODE_STAFF,),
)
def propose_emergency_callout(user, args, org_id):
    staff = user.staff_profile
    reason = str(args.get("reason") or "").strip()[:300]
    data = {"kind": R.KIND_EMERGENCY, "reason": reason}
    shift_id = args.get("shift_id")
    if shift_id not in (None, ""):
        try:
            data["shift_id"] = int(shift_id)
        except (TypeError, ValueError):
            raise T.ToolError("shift_id must be a number from get_my_shifts.")
    else:
        day = T._parse_date(args.get("date"), "date") or timezone.localdate()
        data["start_date"] = data["end_date"] = day.isoformat()
    obj, err = _clean_request(staff, data, user)
    if err is not None:
        raise T.ToolError(_error_text(err))
    shifts = affected_shifts(obj)
    if not shifts:
        raise T.ToolError("They have no scheduled shifts on that date, so there is nothing to report.")
    if _existing_open_emergency(staff, obj):
        raise T.ToolError("They already reported this and their managers were alerted. Tell the user.")
    shifts.sort(key=lambda s: (s.date, s.start_time))
    if len(shifts) == 1:
        what = _shift_text(shifts[0])
    else:
        what = f"all {len(shifts)} of your shifts on {_day(obj.start_date)}: " + "; ".join(
            f"{s.get_shift_type_display()} ({_clock(s.start_time)}–{_clock(s.end_time)})" for s in shifts
        )
    summary = f"You can't make: {what}."
    if reason:
        summary += f' Reason: "{reason[:150]}"'
    params = {"reason": reason}
    if "shift_id" in data:
        params["shift_id"] = data["shift_id"]
    else:
        params["date"] = data["start_date"]
    return _create_pending(
        user,
        org_id,
        "emergency_callout",
        params,
        summary,
        warning="Your managers are alerted right away by email, and by text where enabled. To change it afterwards, call your manager.",
    )
