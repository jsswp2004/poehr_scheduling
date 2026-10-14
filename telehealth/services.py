"""Adapters to the rest of poehr_scheduling: appointments, rights, Communicator, the chart.

The rest of the telehealth app does not touch those details, so a schema change lands here.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.apps import apps
from django.conf import settings
from django.db.models import Q

from users.rights import user_has_right

from .models import TelehealthAuditEvent

log = logging.getLogger(__name__)


# --- appointment access (poehr_scheduling) --------------------------------------

# Appointments in these states never show on the telehealth board.
_HIDDEN_STATUSES = ("cancelled", "no_show", "rescheduled")


def appointment_provider_user_id(appointment):
    """Primary key of the Django user who is the appointment's provider (a User, may be None)."""
    return appointment.provider_id


def patient_mobile(appointment):
    return appointment.patient.phone_number


VIDEO_TYPE_KEYWORD = "telehealth"


def appointment_is_video(appointment):
    """A video visit is any appointment whose Appointment Type (its title) contains
    "Telehealth", e.g. "Telehealth Visit". The is_video flag is a manual override."""
    return bool(appointment.is_video) or VIDEO_TYPE_KEYWORD in (appointment.title or "").lower()


def video_appointments(day, provider_user_id=None):
    """Video appointments on `day`, ordered by time.

    Uses Appointment.objects, which is scoped to the signed-in user's organization by
    TenantScopedManager. Outside a request (no organization) it returns nothing, by design.
    """
    Appointment = apps.get_model(settings.TELEHEALTH_APPOINTMENT_MODEL)
    qs = (
        Appointment.objects.select_related("patient", "provider")
        .filter(
            Q(is_video=True) | Q(title__icontains=VIDEO_TYPE_KEYWORD),
            appointment_datetime__date=day,
        )
        .exclude(status__in=_HIDDEN_STATUSES)
    )
    if provider_user_id is not None:
        qs = qs.filter(provider_id=provider_user_id)
    return qs.order_by("appointment_datetime")


def patient_display_name(appointment):
    patient = appointment.patient
    return (patient.get_full_name() or patient.username or "").strip()


def appointment_summary(appointment):
    """What staff screens show per visit. Staff are authenticated, so names are fine here."""
    return {
        "scheduled_at": appointment.appointment_datetime,
        "patient_display": patient_display_name(appointment),
    }


# --- rights (users.rights registry) ------------------------------------------------

def can_conduct_right(user) -> bool:
    return user_has_right(user, "telehealth.conduct")


def can_manage_right(user) -> bool:
    return user_has_right(user, "telehealth.manage")


def same_organization(user, session) -> bool:
    """Staff may only touch sessions in their own (or, for a system admin, the acted-for) organization."""
    return session.organization_id is not None and session.organization_id == user.organization_id


# --- authorization helper --------------------------------------------------------

def user_can_conduct(user, session) -> bool:
    return bool(
        user
        and user.is_authenticated
        and appointment_provider_user_id(session.appointment) == user.pk
        and same_organization(user, session)
        and can_conduct_right(user)
    )


# --- Communicator ------------------------------------------------------------------

def send_join_sms(appointment, url: str) -> bool:
    """Text the join link through Communicator's send_sms. True if sent, False if it could not be.

    send_sms raises when the patient has not consented to or has opted out of texts. That is
    reported as False so staff get the copy-the-link fallback. Any other failure (carrier
    error, bad number) is logged and treated the same way, so a visit is never stuck on SMS.
    The message carries no PHI.
    """
    from communicator.utils import send_sms

    try:
        send_sms(
            patient_mobile(appointment),
            f"Your video visit link: {url}",
            user=appointment.patient,
            organization=appointment.organization,
        )
        return True
    except Exception as exc:
        if "SMS blocked" in str(exc):
            return False
        log.exception("telehealth: sending the join link failed")
        return False


# --- Clinical chart --------------------------------------------------------------------

def create_draft_note(session, record):
    """Optionally start an unsigned draft ClinicalNote with the stub text.

    Off unless settings.TELEHEALTH_CREATE_CHART_DRAFT is True, so nothing lands in a patient's
    chart until you decide to turn it on. The note is a DRAFT authored by the visit's provider;
    this never signs anything.
    """
    if not getattr(settings, "TELEHEALTH_CREATE_CHART_DRAFT", False):
        return None
    from appointments.models import ClinicalNote

    appointment = session.appointment
    author = appointment.provider
    if author is None:
        return None
    note = ClinicalNote.objects.create(
        organization=appointment.organization,
        appointment=appointment,
        patient=appointment.patient,
        author=author,
        note_type="nursing_assessment" if author.role == "nurse" else "doctor_assessment",
        documentation_type="progress_note",
        status="draft",
        subjective=record.note_text,
    )
    return f"clinicalnote:{note.pk}"


# --- ADAPT: Channels / provider presence ----------------------------------------

def notify_provider(session, event: str, **payload):
    """Push a PHI-free event to the provider's WebSocket group.

    Your consumer needs a handler named `telehealth_event`, and the group name
    below must match whatever it subscribes to.
    """
    try:
        layer = get_channel_layer()
        if layer is None:
            return
        group = f"telehealth_provider_{appointment_provider_user_id(session.appointment)}"
        async_to_sync(layer.group_send)(
            group,
            {"type": "telehealth.event", "event": event, "session_id": str(session.id), **payload},
        )
    except Exception:  # realtime is a convenience; never fail the request over it
        log.exception("telehealth notify_provider failed")


# --- audit -----------------------------------------------------------------------

def audit(session, event_type, *, participant=None, actor=None, request=None, **metadata):
    ip = ua = ""
    if request is not None:
        # Behind a proxy/load balancer, make sure REMOTE_ADDR is the real client IP.
        ip = (request.META.get("REMOTE_ADDR") or "")[:45]
        ua = (request.META.get("HTTP_USER_AGENT") or "")[:200]
    if actor is not None and not getattr(actor, "is_authenticated", False):
        actor = None
    return TelehealthAuditEvent.objects.create(
        session=session,
        participant=participant,
        event_type=event_type,
        actor=actor,
        ip_address=ip,
        user_agent=ua,
        metadata=metadata,
    )
