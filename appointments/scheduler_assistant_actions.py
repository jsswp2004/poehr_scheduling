"""
Changes the Scheduler assistant can PREPARE but never perform on its own.

HOW IT WORKS
------------
1. The model calls a "propose_*" tool. The tool checks the request against what the user can see, saves a
   SchedulerPendingAction and returns a confirmation card. Nothing has been changed yet.
2. The app shows the card with Confirm / Cancel buttons.
3. Confirm calls POST /api/scheduler-assistant/actions/<id>/confirm/ . That endpoint -- not the model -- runs
   the EXISTING view AS THE SIGNED-IN USER (so the right checks and the "only pending requests" rules apply again)
   and records the outcome.

The model has no tool that confirms. A pending action belongs to one user, works once, and expires after
EXPIRY_MINUTES.

Currently available:
  propose_approve_request -> POST appointments/<id>/approve/        (needs appointments.manage_requests)
  propose_deny_request    -> POST appointments/<id>/deny/           (needs appointments.manage_requests)
  propose_mark_arrival    -> PATCH appointments/<id>/status/        (needs checkin.manage)
Creating, moving and cancelling appointments are deliberately NOT available to the assistant.
"""

import datetime
import logging

from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import force_authenticate

from . import scheduler_assistant_tools as T
from .models import SchedulerPendingAction as P
from .views import AppointmentViewSet, update_appointment_status

logger = logging.getLogger(__name__)

EXPIRY_MINUTES = 10
MAX_OPEN_ACTIONS = 5      # waiting confirmations per user at once
MAX_REASON_CHARS = 300

ACTIONS = {}  # action_type -> {"tool", "title", "confirm_label", "execute"}


def _error_text(response):
    data = getattr(response, "data", None)
    if isinstance(data, dict):
        for key in ("error", "detail"):
            if data.get(key):
                return str(data[key])
        for value in data.values():
            if isinstance(value, list) and value:
                return str(value[0])
    return "That could not be done."


# --------------------------------------------------------------------------
# Creating and running pending actions
# --------------------------------------------------------------------------
def _create_pending(user, action_type, params, summary, detail="", warning="", model_summary=None):
    now = timezone.now()
    waiting = P.objects.filter(user=user, status=P.STATUS_PENDING, expires_at__gt=now).count()
    if waiting >= MAX_OPEN_ACTIONS:
        raise T.ToolError(
            "Several changes are already waiting for confirmation. Ask the user to confirm or cancel them first."
        )
    spec = ACTIONS[action_type]
    # One card per appointment at a time: a retry or reworded request replaces the earlier waiting card, so the
    # user can never act twice on the same appointment by confirming two cards.
    for old in P.objects.filter(user=user, status=P.STATUS_PENDING):
        if old.params.get("appointment_id") == params.get("appointment_id"):
            P.objects.filter(pk=old.pk, status=P.STATUS_PENDING).update(
                status=P.STATUS_CANCELLED, decided_at=now, result_message="Replaced by a newer request."
            )
    row = P.objects.create(
        organization=getattr(user, "organization", None),
        user=user,
        action_type=action_type,
        params=params,
        summary=summary[:500],
        detail=detail,
        expires_at=now + datetime.timedelta(minutes=EXPIRY_MINUTES),
    )
    card = {
        "id": str(row.id),
        "type": action_type,
        "title": spec["title"],
        "summary": row.summary,
        "detail": detail,
        "warning": warning,
        "confirm_label": spec["confirm_label"],
        "expires_at": row.expires_at.isoformat(),
    }
    return {
        "status": "awaiting_confirmation",
        "prepared": model_summary or row.summary,
        "pending_action": card,  # lifted out by the assistant; the model never sees the id
        "instructions": (
            "NOTHING HAS BEEN DONE YET. The app is showing the user a confirmation card. In one short sentence, "
            "say what you prepared and ask them to review it and tap the confirm button. Do not say it was "
            "approved, denied or done."
        ),
    }


def confirm(user, pk):
    """
    Run a pending action for the user who owns it. Returns (http_status, payload).

    The action is CLAIMED first (pending -> sending, in one conditional UPDATE that commits at once), then runs with
    no lock held, so two taps or a retry can never run it twice. A worker that dies mid-way leaves the row
    "sending", which is reported as "check the schedule" and is never retried automatically.
    """
    try:
        p = P.objects.get(pk=pk, user=user)
    except (P.DoesNotExist, ValidationError, ValueError):
        return 404, {"error": "That request wasn't found."}
    if p.status == P.STATUS_CONFIRMED:
        return 200, {"status": "confirmed", "message": p.result_message, "already_done": True}
    if p.status == P.STATUS_CANCELLED:
        return 409, {"error": "That was cancelled."}
    if p.status == P.STATUS_FAILED:
        return 409, {"error": p.result_message or "That could not be done. Please ask again."}
    if p.status == P.STATUS_SENDING:
        return 409, {"error": "That is already being carried out. Check the schedule before trying again."}

    now = timezone.now()
    if p.expires_at <= now:
        P.objects.filter(pk=p.pk, status=P.STATUS_PENDING).update(
            status=P.STATUS_CANCELLED, decided_at=now, result_message="Expired before it was confirmed."
        )
        return 410, {"error": "That confirmation expired. Ask me again and I'll prepare it fresh."}
    spec = ACTIONS.get(p.action_type)
    if spec is None or not T.allowed(user, spec["tool"]):
        return 403, {"error": "That isn't available with this account."}

    claimed = P.objects.filter(pk=p.pk, user=user, status=P.STATUS_PENDING, expires_at__gt=now).update(
        status=P.STATUS_SENDING
    )
    if not claimed:
        return 409, {"error": "That was already handled. Check the schedule before trying again."}

    try:
        ok, message = spec["execute"](user, p.params)
    except Exception:  # noqa: BLE001 - safe message to the user, trace to the log
        logger.exception("scheduler assistant action %s failed", p.action_type)
        ok, message = False, "Something went wrong. Please check the schedule before trying again."
    P.objects.filter(pk=p.pk).update(
        status=P.STATUS_CONFIRMED if ok else P.STATUS_FAILED,
        decided_at=timezone.now(),
        result_message=message[:300],
    )
    if not ok:
        return 400, {"error": message}
    return 200, {"status": "confirmed", "message": message}


def cancel(user, pk):
    try:
        p = P.objects.get(pk=pk, user=user)
    except (P.DoesNotExist, ValidationError, ValueError):
        return 404, {"error": "That request wasn't found."}
    changed = P.objects.filter(pk=p.pk, user=user, status=P.STATUS_PENDING).update(
        status=P.STATUS_CANCELLED, decided_at=timezone.now(), result_message="Cancelled by the user."
    )
    if changed:
        return 200, {"status": "cancelled", "message": "Cancelled. Nothing was changed."}
    p.refresh_from_db()
    if p.status == P.STATUS_CANCELLED:
        return 200, {"status": "cancelled", "message": "Cancelled. Nothing was changed."}
    return 409, {"error": "That has already been done or is being carried out, so it can't be cancelled here."}


# --------------------------------------------------------------------------
# Shared by the propose tools
# --------------------------------------------------------------------------
def _target(user, args, must_be_pending=False):
    row = T.get_appointment(user, args.get("appointment_id"))
    if must_be_pending and row.get("status") != "pending":
        raise T.ToolError(
            f"That appointment is not a pending request (it is {T.visit_state(row)}). Tell the user."
        )
    return row


def _describe(row):
    return f"{row.get('patient_name') or 'the patient'} with {row.get('provider_name') or 'an unassigned provider'}, {T.when_text(row.get('appointment_datetime'))}"


def _post(user, appointment_id, verb, body=None):
    request = T._factory.post("/api/appointments/", body or {}, format="json")
    force_authenticate(request, user=user)
    return AppointmentViewSet.as_view({"post": verb})(request, pk=int(appointment_id))


# --------------------------------------------------------------------------
# Approve a request
# --------------------------------------------------------------------------
def _execute_approve(user, params):
    response = _post(user, params["appointment_id"], "approve")
    if response.status_code >= 400:
        return False, _error_text(response)
    return True, f"Approved the request for {params['label']}. The patient was emailed."


ACTIONS["approve_request"] = {
    "tool": "propose_approve_request",
    "title": "Approve request",
    "confirm_label": "Approve",
    "execute": _execute_approve,
}


@T.tool(
    "propose_approve_request",
    "PREPARE (not perform) approval of ONE pending patient appointment request. The app shows a confirmation card "
    "and the request is approved only after the user taps Approve. Use the appointment id from "
    "get_pending_requests or search_appointments.",
    {"appointment_id": {"type": "integer"}},
    required=["appointment_id"],
    right="appointments.manage_requests",
)
def propose_approve_request(user, args):
    row = _target(user, args, must_be_pending=True)
    label = _describe(row)
    return _create_pending(
        user,
        "approve_request",
        {"appointment_id": row["id"], "label": label},
        f"Approve the request for {label}.",
        warning="The patient will get an approval email.",
        model_summary=f"Approve the request for {label}.",
    )


# --------------------------------------------------------------------------
# Deny a request
# --------------------------------------------------------------------------
def _execute_deny(user, params):
    response = _post(user, params["appointment_id"], "deny", {"reason": params.get("reason", "")})
    if response.status_code >= 400:
        return False, _error_text(response)
    return True, f"Denied the request for {params['label']}. The patient was emailed."


ACTIONS["deny_request"] = {
    "tool": "propose_deny_request",
    "title": "Deny request",
    "confirm_label": "Deny request",
    "execute": _execute_deny,
}


@T.tool(
    "propose_deny_request",
    "PREPARE (not perform) denial of ONE pending patient appointment request. A denied request is deleted and the "
    "patient is emailed; this cannot be undone. The app shows a confirmation card and nothing happens until the "
    "user taps Deny request. Use the user's own wording for the reason, or leave it out.",
    {
        "appointment_id": {"type": "integer"},
        "reason": {"type": "string", "description": "Optional short reason included in the patient's email."},
    },
    required=["appointment_id"],
    right="appointments.manage_requests",
)
def propose_deny_request(user, args):
    row = _target(user, args, must_be_pending=True)
    reason = str(args.get("reason") or "").strip()[:MAX_REASON_CHARS]
    label = _describe(row)
    return _create_pending(
        user,
        "deny_request",
        {"appointment_id": row["id"], "label": label, "reason": reason},
        f"Deny the request for {label}.",
        detail=f"Reason sent to the patient: {reason}" if reason else "",
        warning="The request is deleted and the patient is emailed. This can't be undone.",
        model_summary=f"Deny the request for {label}.",
    )


# --------------------------------------------------------------------------
# Mark arrived / no-show
# --------------------------------------------------------------------------
OUTCOMES = {
    "arrived": ({"arrived": True, "no_show": False}, "marked as arrived", "Mark arrived"),
    "no_show": ({"arrived": False, "no_show": True}, "marked as a no-show", "Mark no-show"),
    "not_arrived": ({"arrived": False, "no_show": False}, "reset to not arrived", "Reset"),
}


PHRASES = {"arrived": "as arrived", "no_show": "as a no-show", "not_arrived": "as not arrived"}


def _execute_arrival(user, params):
    body = OUTCOMES[params["outcome"]][0]
    request = T._factory.patch("/api/appointments/", body, format="json")
    force_authenticate(request, user=user)
    response = update_appointment_status(request, appointment_id=int(params["appointment_id"]))
    if response.status_code >= 400:
        return False, _error_text(response)
    return True, f"{params['label']} {OUTCOMES[params['outcome']][1]}."


ACTIONS["mark_arrival"] = {
    "tool": "propose_mark_arrival",
    "title": "Update arrival",
    "confirm_label": "Update",
    "execute": _execute_arrival,
}


@T.tool(
    "propose_mark_arrival",
    "PREPARE (not perform) marking ONE appointment as arrived, no-show, or reset to not arrived. The app shows a "
    "confirmation card and nothing changes until the user taps the button.",
    {
        "appointment_id": {"type": "integer"},
        "outcome": {"type": "string", "enum": ["arrived", "no_show", "not_arrived"]},
    },
    required=["appointment_id", "outcome"],
    right="checkin.manage",
)
def propose_mark_arrival(user, args):
    outcome = str(args.get("outcome") or "").lower()
    if outcome not in OUTCOMES:
        raise T.ToolError("outcome must be arrived, no_show or not_arrived.")
    row = _target(user, args)
    if row.get("status") in ("pending", "cancelled"):
        raise T.ToolError(f"That appointment is {row.get('status')}, so arrival can't be recorded. Tell the user.")
    label = _describe(row)
    verb = OUTCOMES[outcome][1]
    return _create_pending(
        user,
        "mark_arrival",
        {"appointment_id": row["id"], "label": label, "outcome": outcome},
        f"Mark {label} {PHRASES[outcome]}.",
        model_summary=f"Mark {label}: {verb}.",
    )
