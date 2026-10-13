"""
Changes the Communicator assistant can PREPARE but never perform on its own.

HOW IT WORKS
------------
1. The model calls a "propose_*" tool. The tool validates the request with the
   SAME rules the app's own screens use, saves a CommunicatorPendingAction and
   returns a confirmation card. Nothing has been changed or sent yet.
2. The app shows the card with Confirm / Cancel buttons.
3. Confirm calls POST /api/communicator/assistant/actions/<id>/confirm/ . That
   endpoint -- not the model -- runs the existing view AS THE SIGNED-IN USER
   (so the `messages.send` right, opt-out blocking and the recipient-count
   guard all apply again) and records the outcome.

The model has no tool that confirms. A pending action belongs to one user,
works once, and expires after EXPIRY_MINUTES.

Currently available:
  propose_add_contact   -> POST contacts/
  propose_send_message  -> POST send/   (needs the messages.send right)
Deleting contacts and editing the automatic-messaging schedule are deliberately
NOT available to the assistant.
"""

import datetime
import logging
import re

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone
from rest_framework.test import force_authenticate

from . import assistant_tools as T
from .models import CommunicatorPendingAction as P
from .utils import format_phone_to_international
from .views import ContactViewSet, SendBulkMessageView

logger = logging.getLogger(__name__)

EXPIRY_MINUTES = 10
MAX_OPEN_ACTIONS = 5       # waiting confirmations per user at once
MAX_MESSAGE_CHARS = 1600   # roughly ten SMS segments; longer is almost certainly a mistake
MAX_SUBJECT_CHARS = 150
MAX_CONTACT_IDS = 500

ACTIONS = {}  # action_type -> {"tool", "title", "confirm_label", "execute"}

_PHI_WORDS = re.compile(
    r"\b(mrn|dob|date of birth|medical record|ssn|social security|diagnos\w*|prescri\w*|lab results?|test results?)\b",
    re.IGNORECASE,
)
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

PHI_WARNING = (
    "This looks like it may contain patient health information. Texts and email aren't secure, so keep "
    "reminders generic (no diagnoses, results, MRNs or birth dates)."
)


def looks_like_phi(text):
    return bool(_PHI_WORDS.search(text or "") or _SSN.search(text or ""))


def _error_text(response):
    data = getattr(response, "data", None)
    if isinstance(data, dict):
        for key in ("error", "detail"):
            if data.get(key):
                return str(data[key])
        # DRF field errors, e.g. {"email": ["Enter a valid email address."]}
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
    # One card per kind at a time: a retry or reworded request replaces the earlier waiting card, so the
    # user can never confirm the same send twice by confirming two cards.
    P.objects.filter(user=user, action_type=action_type, status=P.STATUS_PENDING).update(
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
            "say what you prepared and ask them to review it and tap the confirm button. Do not say it was sent, "
            "added or done."
        ),
    }


def _run_view(view, user, body):
    request = T._factory.post("/api/communicator/", body, format="json")
    force_authenticate(request, user=user)
    return view(request)


def confirm(user, pk):
    """
    Run a pending action for the user who owns it. Returns (http_status, payload).

    The action is CLAIMED first (pending -> sending, in one conditional UPDATE that commits at once), and the
    send then runs with no database lock held. So two taps, two tabs, or a retry after a timeout can never run
    the same send twice, and a worker that dies mid-send leaves the row "sending", which is reported as
    "check the Message Log" and is never retried automatically.
    """
    try:
        p = P.objects.get(pk=pk, user=user)
    except (P.DoesNotExist, ValidationError, ValueError):
        return 404, {"error": "That request wasn't found."}
    if p.status == P.STATUS_CONFIRMED:  # double tap / retry: report, do not run again
        return 200, {"status": "confirmed", "message": p.result_message, "already_done": True}
    if p.status == P.STATUS_CANCELLED:
        return 409, {"error": "That was cancelled."}
    if p.status == P.STATUS_FAILED:
        return 409, {"error": p.result_message or "That could not be done. Please ask again."}
    if p.status == P.STATUS_SENDING:
        return 409, {"error": "That is already being carried out. Check the Message Log before trying again."}

    now = timezone.now()
    if p.expires_at <= now:
        P.objects.filter(pk=p.pk, status=P.STATUS_PENDING).update(
            status=P.STATUS_CANCELLED, decided_at=now, result_message="Expired before it was confirmed."
        )
        return 410, {"error": "That confirmation expired. Ask me again and I'll prepare it fresh."}
    spec = ACTIONS.get(p.action_type)
    if spec is None or not T.allowed(user, spec["tool"]):
        return 403, {"error": "That isn't available with this account."}

    # Claim it. Only one request can win this UPDATE.
    claimed = P.objects.filter(pk=p.pk, user=user, status=P.STATUS_PENDING, expires_at__gt=now).update(
        status=P.STATUS_SENDING
    )
    if not claimed:
        return 409, {"error": "That was already handled. Check the Message Log before trying again."}

    try:
        ok, message = spec["execute"](user, p.params)
    except Exception:  # noqa: BLE001 - safe message to the user, trace to the log
        logger.exception("communicator assistant action %s failed", p.action_type)
        ok, message = False, "Something went wrong. Please check the Message Log before trying again."
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
    # Conditional update: cancelling can never overwrite a send that has been claimed or finished.
    changed = P.objects.filter(pk=p.pk, user=user, status=P.STATUS_PENDING).update(
        status=P.STATUS_CANCELLED, decided_at=timezone.now(), result_message="Cancelled by the user."
    )
    if changed:
        return 200, {"status": "cancelled", "message": "Cancelled. Nothing was sent or changed."}
    p.refresh_from_db()
    if p.status == P.STATUS_CANCELLED:
        return 200, {"status": "cancelled", "message": "Cancelled. Nothing was sent or changed."}
    return 409, {"error": "That has already been done or is being carried out, so it can't be cancelled here."}


# --------------------------------------------------------------------------
# Add a contact
# --------------------------------------------------------------------------
def _execute_add_contact(user, params):
    body = {"name": params["name"], "phone": params.get("phone", ""), "email": params.get("email", "")}
    response = _run_view(ContactViewSet.as_view({"post": "create"}), user, body)
    if response.status_code >= 400:
        return False, _error_text(response)
    return True, f"Added {params['name']} to your contacts."


ACTIONS["add_contact"] = {
    "tool": "propose_add_contact",
    "title": "Add contact",
    "confirm_label": "Add contact",
    "execute": _execute_add_contact,
}


@T.tool(
    "propose_add_contact",
    "PREPARE (not save) a new contact for the signed-in user's list. The app shows a confirmation card and the "
    "contact is added only after the user confirms. Needs a name and at least one of phone or email. Do not use "
    "this for anyone who has not agreed to receive texts or email.",
    {
        "name": {"type": "string"},
        "phone": {"type": "string", "description": "Optional. A US phone number."},
        "email": {"type": "string", "description": "Optional."},
    },
    required=["name"],
)
def propose_add_contact(user, args):
    name = str(args.get("name") or "").strip()[:255]
    phone = str(args.get("phone") or "").strip()
    email = str(args.get("email") or "").strip()
    if not name:
        raise T.ToolError("A contact needs a name.")
    if not phone and not email:
        raise T.ToolError("A contact needs a phone number or an email address. Ask the user for one.")
    if phone:
        digits = T._digits(phone)
        if len(phone) > 20 or not 10 <= len(digits) <= 15:
            raise T.ToolError("That phone number doesn't look right. Ask the user to check it.")
    if email:
        try:
            validate_email(email)
        except ValidationError:
            raise T.ToolError("That email address doesn't look right. Ask the user to check it.")
    for c in T._contacts(user):
        same_phone = phone and c.get("phone") and format_phone_to_international(c["phone"]) == format_phone_to_international(phone)
        same_email = email and str(c.get("email") or "").lower() == email.lower()
        if same_phone or same_email:
            raise T.ToolError(
                f"{c.get('name')} is already in the list with that {'phone number' if same_phone else 'email address'}. "
                "Tell the user instead of adding a duplicate."
            )
    bits = [b for b in (phone, email) if b]
    return _create_pending(
        user,
        "add_contact",
        {"name": name, "phone": phone, "email": email},
        f"Add {name} ({', '.join(bits)}) to your contacts.",
        warning="Only add people who have agreed to receive your texts and email.",
        model_summary=f"Add {name} to your contacts.",
    )


# --------------------------------------------------------------------------
# Send a message
# --------------------------------------------------------------------------
def _plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def _execute_send(user, params):
    body = {
        "message": params["message"],
        "subject": params.get("subject") or "Notification",
        "send_sms": bool(params.get("send_sms")),
        "send_email": bool(params.get("send_email")),
        "confirm_count": params.get("confirm_count"),
    }
    if params.get("contact_ids") is not None:
        body["contact_ids"] = params["contact_ids"]
    response = _run_view(SendBulkMessageView.as_view(), user, body)
    if response.status_code == 409:
        return False, "Your contact list changed since I prepared this, so nothing was sent. Ask me again."
    if response.status_code in (401, 403):
        return False, "Your account doesn't have the right to send messages."
    if response.status_code >= 400:
        return False, _error_text(response)
    r = (response.data or {}).get("results", {})
    parts = []
    if body["send_sms"]:
        bit = f"{_plural(r.get('sms_sent', 0), 'text')} sent"
        if r.get("sms_skipped"):
            bit += f", {r['sms_skipped']} skipped (opted out or no consent)"
        if r.get("sms_failed"):
            bit += f", {r['sms_failed']} failed"
        parts.append(bit)
    if body["send_email"]:
        bit = f"{_plural(r.get('email_sent', 0), 'email')} sent"
        if r.get("email_failed"):
            bit += f", {r['email_failed']} failed"
        parts.append(bit)
    text = "; ".join(parts) + ". See the Message Log for details."
    if r.get("sms_sent", 0) + r.get("email_sent", 0) == 0:
        return False, "Nothing was sent. " + text
    return True, text[0].upper() + text[1:]


ACTIONS["send_message"] = {
    "tool": "propose_send_message",
    "title": "Send message",
    "confirm_label": "Send now",
    "execute": _execute_send,
}


@T.tool(
    "propose_send_message",
    "PREPARE (not send) a text and/or email to the signed-in user's contacts. The app shows the exact message and "
    "the number of people it will reach on a confirmation card; NOTHING is sent until the user taps Send now. "
    "Opted-out contacts are skipped automatically. Choose recipients with contact_ids (from search_contacts) or "
    "set all_contacts to true only when the user clearly said everyone. Use the user's wording exactly when they "
    "gave it.",
    {
        "message": {"type": "string", "description": "The message text, exactly as it should be sent."},
        "channel": {"type": "string", "enum": ["sms", "email", "both"]},
        "subject": {"type": "string", "description": "Email subject. Required when the channel includes email."},
        "contact_ids": {"type": "array", "items": {"type": "integer"}, "description": "Specific contacts."},
        "all_contacts": {"type": "boolean", "description": "True to message every contact in the list."},
    },
    required=["message", "channel"],
    right="messages.send",
)
def propose_send_message(user, args):
    message = str(args.get("message") or "").strip()
    if not message:
        raise T.ToolError("There is no message text. Ask the user what to say.")
    if len(message) > MAX_MESSAGE_CHARS:
        raise T.ToolError(f"That message is too long (over {MAX_MESSAGE_CHARS} characters). Ask the user to shorten it.")
    channel = str(args.get("channel") or "").lower()
    if channel not in ("sms", "email", "both"):
        raise T.ToolError("channel must be sms, email or both.")
    send_sms, send_email = channel in ("sms", "both"), channel in ("email", "both")
    subject = str(args.get("subject") or "").strip()[:MAX_SUBJECT_CHARS]
    if send_email and not subject:
        raise T.ToolError("An email needs a subject line. Ask the user for one.")

    ids = args.get("contact_ids")
    everyone = args.get("all_contacts") is True
    if ids is not None and not isinstance(ids, list):
        raise T.ToolError("contact_ids must be a list.")
    if ids and everyone:
        raise T.ToolError("Choose either specific contacts or everyone, not both.")
    if not ids and not everyone:
        raise T.ToolError("Ask the user whether this is for everyone or for specific contacts.")
    if ids and len(ids) > MAX_CONTACT_IDS:
        raise T.ToolError("That is too many contacts to choose one by one. Ask whether they mean everyone.")
    try:
        ids = [int(i) for i in ids] if ids else None
    except (TypeError, ValueError):
        raise T.ToolError("contact_ids must be numbers from search_contacts.")

    aud = T.audience(user, ids, send_sms=send_sms, send_email=send_email)
    reach = aud["will_get_text"] + aud["will_get_email"]
    if aud["selected"] == 0:
        raise T.ToolError("There are no contacts to send to.")
    if reach == 0:
        raise T.ToolError(
            "Nobody would receive this: "
            f"{aud['skipped_opted_out']} opted out, {aud['skipped_no_phone']} have no phone, "
            f"{aud['skipped_no_email']} have no email. Tell the user."
        )

    if everyone:
        who = "everyone in your list"
    else:
        picked = {c.get("id"): c.get("name") for c in T._contacts(user)}
        names = [str(picked.get(i) or "?") for i in ids]
        who = ", ".join(names[:5]) + (f" and {len(names) - 5} more" if len(names) > 5 else "")
    how = {"sms": "a text", "email": "an email", "both": "a text and an email"}[channel]
    summary = f"Send {how} to {who}." if not everyone else f"Send {how} to {who} ({_plural(aud['selected'], 'contact')})."
    bits = []
    if send_sms:
        bits.append(f"{_plural(aud['will_get_text'], 'text')} will go out")
        if aud["skipped_opted_out"]:
            bits.append(f"{aud['skipped_opted_out']} skipped because they opted out")
        if aud["skipped_no_phone"]:
            bits.append(f"{aud['skipped_no_phone']} have no phone")
    if send_email:
        bits.append(f"{_plural(aud['will_get_email'], 'email')} will go out")
        if aud["skipped_no_email"]:
            bits.append(f"{aud['skipped_no_email']} have no email")
    summary += " " + "; ".join(bits) + "."

    detail = (f"Subject: {subject}\n\n" if send_email else "") + message
    phi = looks_like_phi(message) or looks_like_phi(subject)
    warning = "A sent message can't be recalled."
    if phi:
        warning = PHI_WARNING + " " + warning
    result = _create_pending(
        user,
        "send_message",
        {
            "message": message,
            "subject": subject,
            "send_sms": send_sms,
            "send_email": send_email,
            "contact_ids": ids,
            "confirm_count": aud["selected"],
        },
        summary,
        detail=detail,
        warning=warning,
    )
    result["audience"] = aud
    if phi:
        result["instructions"] += " Also tell the user the message may contain health information and should be made generic."
    return result
