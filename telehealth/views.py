import logging
import uuid

from django.apps import apps
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.exceptions import (
    APIException,
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle

from . import billing, chime, notes, services
from .assistant import agent
from .models import TelehealthAuditEvent as E
from .models import TelehealthParticipant as P
from .models import TelehealthSession as S
from .models import TelehealthVisitRecord as VisitRecord
from .signals import session_ended

log = logging.getLogger(__name__)

REJOIN_SALT = "telehealth.rejoin"


class LinkUnavailable(APIException):
    """Deliberately generic: do not reveal whether a token was wrong, used or expired."""

    status_code = 410
    default_detail = "link_unavailable"
    default_code = "link_unavailable"


class JoinThrottle(SimpleRateThrottle):
    scope = "telehealth_join"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class AssistantThrottle(UserRateThrottle):
    scope = "telehealth_assistant"


# --------------------------------------------------------------------------- helpers

def _serialize_record(record):
    return {
        "session_id": str(record.session_id),
        "modality": record.modality,
        "patient_location": record.patient_location,
        "patient_state": record.patient_state,
        "place_of_service": record.place_of_service,
        "modifier": record.modifier,
        "location_confirmed": record.location_confirmed,
        "duration_minutes": round(record.duration_seconds / 60),
        "ready_for_billing": record.ready_for_billing,
        "note_text": record.note_text,
        "note_pushed": bool(record.external_note_ref),
    }


def _serialize(session):
    """Session state for staff UIs. Identifiers and timestamps only, no patient details."""
    record = getattr(session, "visit_record", None)
    return {
        "id": str(session.id),
        "appointment_id": session.appointment_id,
        "status": session.status,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "billing": (
            {
                "confirmed": record.location_confirmed,
                "place_of_service": record.place_of_service,
                "modifier": record.modifier,
            }
            if record
            else None
        ),
        "participants": [
            {
                "role": p.role,
                "arrived_at": p.arrived_at,
                "admitted_at": p.admitted_at,
                "consented": bool(p.consent_at),
                "joined_at": p.joined_at,
                "left_at": p.left_at,
            }
            for p in session.participants.all()
        ],
    }


def _get_session(request, session_id, *, conduct_only=False):
    session = S.objects.select_related("appointment").filter(pk=session_id).first()
    # Another organization's session looks exactly like one that doesn't exist.
    if session is None or not services.same_organization(request.user, session):
        raise NotFound()
    if services.user_can_conduct(request.user, session):
        return session
    if not conduct_only and services.can_manage_right(request.user):
        return session
    raise PermissionDenied()


def _issue_media(participant):
    """Mint a fresh Chime attendee for this participant and return client join info."""
    session = participant.session
    previous = participant.chime_attendee_id
    attendee = chime.create_attendee(
        session.chime_meeting_id, f"{participant.role}-{participant.id.hex}"
    )
    if previous:
        chime.delete_attendee(session.chime_meeting_id, previous)
    participant.chime_attendee_id = attendee["AttendeeId"]
    participant.save(update_fields=["chime_attendee_id"])
    return {"Meeting": session.meeting_payload, "Attendee": attendee}


def _record_presence(participant, event, request):
    now = timezone.now()
    if event == "joined":
        participant.joined_at = participant.joined_at or now
        participant.left_at = None
        etype = E.Type.JOINED
    elif event == "left":
        participant.left_at = now
        etype = E.Type.LEFT
    else:
        raise ValidationError({"event": "must be 'joined' or 'left'"})
    participant.save(update_fields=["joined_at", "left_at"])
    services.audit(
        participant.session,
        etype,
        participant=participant,
        actor=request.user if participant.role == P.Role.PROVIDER else None,
        request=request,
    )


def _patient_from_rejoin(request):
    raw = request.data.get("rejoin_token") or ""
    try:
        data = signing.loads(
            raw, salt=REJOIN_SALT, max_age=settings.TELEHEALTH_REJOIN_TTL_SECONDS
        )
    except signing.BadSignature:
        raise LinkUnavailable()
    participant = (
        P.objects.select_related("session", "session__appointment")
        .filter(pk=data.get("p"), role=P.Role.PATIENT, token_redeemed_at__isnull=False)
        .first()
    )
    if participant is None or participant.session.status == S.Status.ENDED:
        raise LinkUnavailable()
    return participant


# --------------------------------------------------------------------- staff endpoints

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_session(request):
    appointment_id = request.data.get("appointment_id")
    if not appointment_id:
        raise ValidationError({"appointment_id": "required"})
    Appointment = apps.get_model(settings.TELEHEALTH_APPOINTMENT_MODEL)
    appointment = Appointment.objects.filter(pk=appointment_id).first()
    if appointment is None:
        raise NotFound()

    is_provider = services.appointment_provider_user_id(appointment) == request.user.pk
    can_conduct = is_provider and services.can_conduct_right(request.user)
    if not (can_conduct or services.can_manage_right(request.user)):
        raise PermissionDenied()
    if not services.appointment_is_video(appointment):
        raise ValidationError({"appointment_id": "not a video visit"})

    existing = S.objects.filter(appointment=appointment).first()
    if existing is not None:
        return Response(_serialize(existing))

    session = S.objects.create(
        appointment=appointment,
        organization_id=appointment.organization_id,
        room_name=uuid.uuid4().hex,
        created_by=request.user,
    )
    try:
        meeting = chime.create_meeting(session.room_name, str(session.id))
    except Exception:
        session.delete()
        raise
    session.chime_meeting_id = meeting["MeetingId"]
    session.media_region = meeting.get("MediaRegion", "")
    session.meeting_payload = meeting
    session.save(update_fields=["chime_meeting_id", "media_region", "meeting_payload"])

    P.objects.create(
        session=session,
        role=P.Role.PROVIDER,
        user_id=services.appointment_provider_user_id(appointment),
    )
    P.objects.create(session=session, role=P.Role.PATIENT)
    services.audit(session, E.Type.SESSION_CREATED, actor=request.user, request=request)
    return Response(_serialize(session), status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def session_detail(request, session_id):
    return Response(_serialize(_get_session(request, session_id)))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def schedule(request):
    """One day of video visits with session state. Feeds Today, Waiting Room and Schedule."""
    can_manage = services.can_manage_right(request.user)
    if not (can_manage or services.can_conduct_right(request.user)):
        raise PermissionDenied()
    raw = request.query_params.get("date")
    day = parse_date(raw) if raw else timezone.localdate()
    if day is None:
        raise ValidationError({"date": "use YYYY-MM-DD"})
    appointments = list(services.video_appointments(day, None if can_manage else request.user.pk))
    sessions = {
        s.appointment_id: s
        for s in S.objects.filter(appointment__in=appointments).select_related("visit_record").prefetch_related("participants")
    }
    items = []
    for appointment in appointments:
        session = sessions.get(appointment.pk)
        items.append(
            {
                "appointment_id": appointment.pk,
                **services.appointment_summary(appointment),
                "session": _serialize(session) if session else None,
            }
        )
    # server_time lets the browser correct for a wrong device clock when showing wait timers.
    return Response({"date": day.isoformat(), "server_time": timezone.now(), "items": items})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([JoinThrottle])
def ping(request):
    """Tiny unauthenticated endpoint for the pre-join connection check."""
    return Response({"t": timezone.now()})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_join_link(request, session_id):
    """Issue a fresh single-use patient link and (by default) text it via Communicator."""
    session = _get_session(request, session_id)
    if session.status == S.Status.ENDED:
        raise ValidationError("session_ended")
    patient = session.participants.get(role=P.Role.PATIENT)
    if patient.admitted_at:
        return Response({"error": "patient_already_admitted"}, status=409)

    raw = patient.issue_token(settings.TELEHEALTH_LINK_TTL_MINUTES)
    # The token sits in the URL fragment, which browsers never send to servers,
    # so it stays out of access logs and referrers.
    url = f"{settings.TELEHEALTH_PUBLIC_URL.rstrip('/')}/join#{raw}"
    services.audit(session, E.Type.LINK_ISSUED, participant=patient, actor=request.user, request=request)

    if request.data.get("deliver", True) is False:
        return Response({"sent": False, "url": url})

    sent = services.send_join_sms(session.appointment, url)
    services.audit(
        session,
        E.Type.LINK_SENT if sent else E.Type.LINK_SUPPRESSED,
        participant=patient,
        actor=request.user,
        request=request,
    )
    return Response({"sent": bool(sent)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admit(request, session_id):
    session = _get_session(request, session_id, conduct_only=True)
    with transaction.atomic():
        session = S.objects.select_for_update().get(pk=session.pk)
        if session.status == S.Status.ENDED:
            raise ValidationError("session_ended")
        patient = session.participants.filter(
            role=P.Role.PATIENT, arrived_at__isnull=False
        ).first()
        if patient is None:
            raise ValidationError("no_patient_waiting")
        now = timezone.now()
        if patient.admitted_at is None:
            patient.admitted_at = now
            patient.admitted_by = request.user
            patient.save(update_fields=["admitted_at", "admitted_by"])
            services.audit(
                session, E.Type.PATIENT_ADMITTED, participant=patient, actor=request.user, request=request
            )
        session.status = S.Status.IN_PROGRESS
        session.started_at = session.started_at or now
        session.save(update_fields=["status", "started_at"])
    return Response(_serialize(session))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def provider_token(request, session_id):
    session = _get_session(request, session_id, conduct_only=True)
    if session.status == S.Status.ENDED:
        raise ValidationError("session_ended")
    provider = session.participants.select_related("session").get(role=P.Role.PROVIDER)
    info = _issue_media(provider)
    services.audit(session, E.Type.MEDIA_ISSUED, participant=provider, actor=request.user, request=request)
    return Response(info)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def provider_presence(request, session_id):
    session = _get_session(request, session_id, conduct_only=True)
    provider = session.participants.select_related("session").get(role=P.Role.PROVIDER)
    _record_presence(provider, request.data.get("event"), request)
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end_session(request, session_id):
    session = _get_session(request, session_id)  # front desk may end stale sessions
    with transaction.atomic():
        session = S.objects.select_for_update().get(pk=session.pk)
        if session.status == S.Status.ENDED:
            return Response(_serialize(session))
        session.status = S.Status.ENDED
        session.ended_at = timezone.now()
        session.save(update_fields=["status", "ended_at"])
        services.audit(session, E.Type.SESSION_ENDED, actor=request.user, request=request)
    chime.delete_meeting(session.chime_meeting_id)
    session_ended.send(sender=S, session=session)
    return Response(_serialize(session))


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def visit_record(request, session_id):
    """Billing context and draft note for a visit.

    GET: the provider, or front desk / billing with manage_schedule.
    POST: the provider only, because they are attesting where the patient was.
          Body (all optional): patient_location "home"|"other", patient_state "NY",
          modality "audio_video"|"audio_only".
    """
    if request.method == "GET":
        session = _get_session(request, session_id)
        record = VisitRecord.objects.filter(session=session).first()
        if record is None:
            raise NotFound()
        return Response(_serialize_record(record))

    session = _get_session(request, session_id, conduct_only=True)
    data = request.data
    errors = {}
    location = data.get("patient_location")
    state = data.get("patient_state")
    modality = data.get("modality")
    if location is not None and location not in billing.LOCATIONS:
        errors["patient_location"] = "must be 'home' or 'other'"
    if state not in (None, "") and not (isinstance(state, str) and len(state) == 2 and state.isalpha()):
        errors["patient_state"] = "use the two-letter state code"
    if modality is not None and modality not in billing.MODALITIES:
        errors["modality"] = "must be 'audio_video' or 'audio_only'"
    if errors:
        raise ValidationError(errors)

    with transaction.atomic():
        session = S.objects.select_for_update().get(pk=session.pk)
        record, _ = VisitRecord.objects.get_or_create(session=session)
        if location is not None:
            record.patient_location = location
            record.location_confirmed_by = request.user
            record.location_confirmed_at = timezone.now()
        if state is not None:
            record.patient_state = state.upper()
        if modality is not None:
            record.modality = modality
        record.place_of_service = billing.place_of_service(record.patient_location)
        record.modifier = billing.modifier_for(record.modality)
        record.save()
        if session.status == S.Status.ENDED:
            notes.refresh_stub(record)
        services.audit(
            session,
            E.Type.BILLING_CONTEXT_SET,
            actor=request.user,
            request=request,
            place_of_service=record.place_of_service,
            modifier=record.modifier,
            modality=record.modality,
        )
    return Response(_serialize_record(record))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AssistantThrottle])
def assistant_chat(request):
    """One turn with the staff assistant. The client keeps the conversation and resends it.

    The model only ever sees scrubbed text and de-identified visit facts. It returns text plus
    proposals; the person confirms in the UI, which calls the normal endpoints.
    """
    if not (services.can_conduct_right(request.user) or services.can_manage_right(request.user)):
        raise PermissionDenied()
    messages = request.data.get("messages")
    if not isinstance(messages, list):
        raise ValidationError({"messages": "expected a list"})
    try:
        return Response(agent.run_turn(request.user, messages))
    except agent.AssistantUnavailable:
        return Response({"error": "assistant_unavailable"}, status=503)
    except ValueError:
        raise ValidationError({"messages": "last message must be from you"})
    except Exception:
        log.exception("telehealth assistant failed")
        return Response({"error": "assistant_failed"}, status=502)


# -------------------------------------------------------------------- patient endpoints
# These accept no login. Tokens travel in POST bodies, never in URLs.

@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([JoinThrottle])
def join_redeem(request):
    raw = request.data.get("token") or ""
    if not raw:
        raise LinkUnavailable()
    with transaction.atomic():
        participant = (
            P.objects.select_for_update()
            .select_related("session", "session__appointment")
            .filter(token_hash=P.hash_token(raw), role=P.Role.PATIENT)
            .first()
        )
        now = timezone.now()
        if (
            participant is None
            or participant.token_redeemed_at is not None
            or participant.token_expires_at is None
            or participant.token_expires_at < now
            or participant.session.status == S.Status.ENDED
        ):
            raise LinkUnavailable()
        participant.token_redeemed_at = now
        participant.arrived_at = now
        participant.save(update_fields=["token_redeemed_at", "arrived_at"])
        session = participant.session
        if session.status == S.Status.SCHEDULED:
            session.status = S.Status.WAITING
            session.save(update_fields=["status"])
    services.audit(session, E.Type.PATIENT_ARRIVED, participant=participant, request=request)
    services.notify_provider(session, "patient_arrived")
    rejoin = signing.dumps({"p": str(participant.id)}, salt=REJOIN_SALT)
    return Response({"rejoin_token": rejoin, "consent_required": True})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([JoinThrottle])
def join_consent(request):
    participant = _patient_from_rejoin(request)
    if participant.consent_at is None:
        now = timezone.now()
        participant.consent_at = now
        participant.save(update_fields=["consent_at"])
        session = participant.session
        session.consent_at = session.consent_at or now
        session.save(update_fields=["consent_at"])
        services.audit(session, E.Type.PATIENT_CONSENTED, participant=participant, request=request)
        services.notify_provider(session, "patient_consented")
    return Response({"ok": True})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([JoinThrottle])
def join_status(request):
    participant = _patient_from_rejoin(request)
    return Response(
        {
            "status": participant.session.status,
            "consented": bool(participant.consent_at),
            "admitted": bool(participant.admitted_at),
        }
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([JoinThrottle])
def join_media(request):
    participant = _patient_from_rejoin(request)
    if participant.consent_at is None:
        raise PermissionDenied("consent_required")
    if participant.admitted_at is None:
        raise PermissionDenied("not_admitted")
    info = _issue_media(participant)
    services.audit(
        participant.session, E.Type.MEDIA_ISSUED, participant=participant, request=request
    )
    return Response(info)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([JoinThrottle])
def join_presence(request):
    participant = _patient_from_rejoin(request)
    _record_presence(participant, request.data.get("event"), request)
    return Response({"ok": True})
