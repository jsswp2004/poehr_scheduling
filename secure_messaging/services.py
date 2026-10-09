"""Helpers shared by the secure messaging API: who may be messaged, audit, patient care teams, live nudges."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from users.facility_scope import assigned_facility_ids
from users.models import CustomUser, Registration
from users.rights import user_has_right

MESSAGING_ROLES = ("doctor", "nurse", "registrar", "receptionist", "admin")
PATIENT_THREAD_ROLES = ("doctor", "nurse", "registrar", "admin")
MAX_BODY = 4000
AUDIT_DEDUPE_MINUTES = 10


def display_name(user):
    if user is None:
        return "Unknown"
    return f"{user.first_name} {user.last_name}".strip() or user.username


def user_ref(user):
    return {"id": user.pk, "name": display_name(user), "role": user.role}


def patient_name(patient):
    last, first = (patient.last_name or "").strip(), (patient.first_name or "").strip()
    return f"{last}, {first}".strip(", ") or patient.username


def may_message(actor, target):
    """Can `actor` have `target` as a messaging partner or thread member (same organization, active, allowed)?"""
    return (
        target.is_active
        and target.organization_id is not None
        and target.organization_id == actor.organization_id
        and target.role in MESSAGING_ROLES
        and user_has_right(target, "secure_messaging.use")
    )


def shares_facility(me, other):
    """Directory filter: people who work at one of my facilities, or are not tied to a facility."""
    mine = assigned_facility_ids(me)
    if mine is None:
        return True
    theirs = {f.pk for f in other.facilities.all() if f.organization_id == other.organization_id}
    return not theirs or bool(theirs & mine)


def audit(user, action, thread=None, message_id=None, patient=None, detail=""):
    from .models import AuditEvent

    org_id = user.organization_id or (thread.organization_id if thread else None)
    if org_id is None:
        return None
    return AuditEvent.objects.create(
        organization_id=org_id, user=user, action=action, thread=thread, message_id=message_id, patient=patient, detail=detail[:255]
    )


def audit_once(user, action, thread, patient=None):
    """Log an opening of a thread, but not again for the same person within a few minutes (polling must not flood the log)."""
    from .models import AuditEvent

    since = timezone.now() - timedelta(minutes=AUDIT_DEDUPE_MINUTES)
    if AuditEvent.objects.filter(user=user, action=action, thread=thread, at__gte=since).exists():
        return None
    return audit(user, action, thread=thread, patient=patient)


def current_visit(patient):
    """The visit a patient is in now (inpatient first, then ED, then any open visit), else their latest visit."""
    open_visits = list(
        Registration.objects.filter(patient__user=patient, discharge_datetime__isnull=True).order_by("-created_at", "-pk")
    )
    for setting in ("acute", "emergency"):
        for visit in open_visits:
            if visit.care_setting == setting:
                return visit
    if open_visits:
        return open_visits[0]
    return Registration.objects.filter(patient__user=patient).order_by("-created_at", "-pk").first()


def add_member(thread, user, added_by=None, role="member"):
    """Make `user` an active member. Returns (member, newly_added)."""
    from .models import ThreadMember

    member, created = ThreadMember.objects.get_or_create(
        thread=thread, user=user, defaults={"role": role, "added_by": added_by}
    )
    if not created and member.left_at is not None:
        member.left_at = None
        member.added_by = added_by
        member.save(update_fields=["left_at", "added_by"])
        return member, True
    return member, created


def seed_care_team(thread, patient, added_by):
    """Put the patient's current attending, nurse and resident on a new care-team thread."""
    visit = current_visit(patient)
    if visit is None:
        return
    for user in (visit.attending_provider, visit.assigned_nurse, visit.resident_provider):
        if user is not None and user.is_active and user.organization_id == thread.organization_id and user.role in PATIENT_THREAD_ROLES:
            if user_has_right(user, "secure_messaging.use"):
                add_member(thread, user, added_by)


def system_message(thread, actor, text):
    from .models import SecureMessage

    message = SecureMessage.objects.create(thread=thread, sender=actor, kind=SecureMessage.SYSTEM, body=text[:500])
    return message


def nudge(thread, message, recipient_ids):
    """
    Tell online recipients to fetch. Only ids travel over the socket (no patient or message text), and a
    failure here must never stop a message from being saved, because the app also checks for new messages.
    """

    def send():
        try:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer

            layer = get_channel_layer()
            if layer is None:
                return
            for uid in recipient_ids:
                async_to_sync(layer.group_send)(
                    f"secure_user_{uid}",
                    {"type": "secure.nudge", "thread": thread.pk, "message": message.pk, "urgent": message.priority == "urgent"},
                )
        except Exception:  # noqa: BLE001 -- live delivery is best effort
            pass

    transaction.on_commit(send)
