"""Co-signature for clinical notes.

A note is signed first and is in the chart immediately. The author may then ask another
provider to co-sign it. The co-signer co-signs or returns it with comments; a returned note is
corrected by an addendum and a new request. Only people holding the same right orders use
("orders.cosign") can be asked, never the author.
"""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from users.rights import user_has_right

from .models import NoteCosign

User = get_user_model()
RIGHT = "orders.cosign"


class CosignError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _name(user):
    return (f"{user.first_name} {user.last_name}".strip() or user.username) if user else ""


def eligible_cosigners(org, exclude=None):
    """Active staff of the clinic holding the co-sign right, never `exclude`."""
    people = User.objects.filter(is_active=True, role__in=("doctor", "nurse", "admin", "system_admin"))
    if org is not None:
        people = people.filter(organization=org)
    out = []
    for u in people.order_by("last_name", "first_name", "username"):
        if exclude is not None and u.pk == exclude.pk:
            continue
        if user_has_right(u, RIGHT):
            out.append(u)
    return out


def latest(note):
    """The newest request on a note (uses prefetched rows when present)."""
    rows = list(note.cosign_requests.all())
    if not rows:
        return None
    return max(rows, key=lambda r: (r.created_at, r.pk))


def is_overdue(req, now=None):
    return bool(req.status == "pending" and req.due_at and req.due_at < (now or timezone.now()))


def summary(note):
    """What the note header shows: none / awaiting / cosigned / returned (+ who, when, comment)."""
    req = latest(note)
    if req is None or req.status == "cancelled":
        return {"status": "none"}
    key = {"pending": "awaiting", "cosigned": "cosigned", "returned": "returned"}[req.status]
    return {
        "status": key,
        "request_id": req.pk,
        "cosigner": req.cosigner_id,
        "cosigner_name": _name(req.cosigner),
        "requested_by_name": _name(req.requested_by),
        "message": req.message,
        "requested_at": req.created_at.isoformat(),
        "due_at": req.due_at.isoformat() if req.due_at else None,
        "overdue": is_overdue(req),
        "comment": req.comment,
        "resolved_at": req.resolved_at.isoformat() if req.resolved_at else None,
    }


@transaction.atomic
def request_cosign(note, by, cosigner_id, *, message="", due_at=None, reminder_minutes=None):
    if note.status != "signed":
        raise CosignError("Sign the note first, then ask for a co-signature.")
    if note.author_id != by.pk and getattr(by, "role", None) not in ("admin", "system_admin"):
        raise CosignError("Only the author can ask for a co-signature.", 403)
    try:
        cosigner = User.objects.get(pk=cosigner_id, is_active=True)
    except (User.DoesNotExist, ValueError, TypeError):
        raise CosignError("Pick who should co-sign.")
    if cosigner.pk == note.author_id:
        raise CosignError("You can't ask the author to co-sign their own note.")
    if cosigner.organization_id != note.organization_id and note.organization_id is not None:
        raise CosignError("That person is not at this clinic.")
    if not user_has_right(cosigner, RIGHT):
        raise CosignError("That person does not have the right to co-sign.")
    current = note.cosign_requests.order_by("-created_at", "-pk").first()
    if current and current.status == "pending":
        raise CosignError("This note is already waiting for a co-signature.")
    if current and current.status == "cosigned":
        raise CosignError("This note is already co-signed.")
    return NoteCosign.objects.create(
        organization=note.organization,
        note=note,
        requested_by=by,
        cosigner=cosigner,
        message=(message or "").strip(),
        due_at=due_at,
        reminder_minutes=reminder_minutes,
    )


def _pending(note):
    req = note.cosign_requests.filter(status="pending").order_by("-created_at", "-pk").first()
    if req is None:
        raise CosignError("This note is not waiting for a co-signature.")
    return req


@transaction.atomic
def cosign(note, user):
    req = _pending(note)
    if req.cosigner_id != user.pk:
        raise CosignError("This co-signature was requested from someone else.", 403)
    if user.pk == note.author_id:
        raise CosignError("You can't co-sign your own note.", 403)
    req.status, req.resolved_at = "cosigned", timezone.now()
    req.save(update_fields=["status", "resolved_at"])
    return req


@transaction.atomic
def return_note(note, user, comment):
    comment = (comment or "").strip()
    if not comment:
        raise CosignError("Say what needs to change before returning the note.")
    req = _pending(note)
    if req.cosigner_id != user.pk:
        raise CosignError("This co-signature was requested from someone else.", 403)
    req.status, req.comment, req.resolved_at = "returned", comment, timezone.now()
    req.save(update_fields=["status", "comment", "resolved_at"])
    return req


@transaction.atomic
def cancel(note, user):
    req = _pending(note)
    if user.pk not in (req.requested_by_id, note.author_id) and getattr(user, "role", None) not in ("admin", "system_admin"):
        raise CosignError("Only the person who asked can cancel the request.", 403)
    req.status, req.resolved_at = "cancelled", timezone.now()
    req.save(update_fields=["status", "resolved_at"])
    return req
