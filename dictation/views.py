import logging
import uuid

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from users.rights import user_has_right

from . import cleanup
from .engines import EngineUnavailable, transcribe
from .models import DictationEvent as Event

log = logging.getLogger(__name__)

MAX_SESSION_SECONDS = 4 * 60 * 60  # Transcribe closes a stream after 4 hours anyway
DOCTOR_ROLES = ("doctor", "system_admin")


class DictationThrottle(UserRateThrottle):
    scope = "dictation"


class CleanupThrottle(UserRateThrottle):
    scope = "dictation_cleanup"


def _allowed(user):
    """The user's organization if this user may dictate, else None. Never raises."""
    org = getattr(user, "organization", None)
    if not (user.is_authenticated and org is not None and org.dictation_enabled):
        return None
    if not user_has_right(user, "clinical_notes.view_author"):
        return None
    if org.dictation_access == "doctors" and getattr(user, "role", None) not in DOCTOR_ROLES:
        return None
    return org


def _require(user):
    org = _allowed(user)
    if org is None:
        # One generic answer: do not reveal which condition failed.
        raise PermissionDenied("dictation_unavailable")
    return org


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def config(request):
    """What the UI needs to decide whether to show the microphone. Cheap, never an error."""
    org = _allowed(request.user)
    if org is None:
        return Response({"enabled": False, "cleanup": False, "specialty": None})
    return Response(
        {"enabled": True, "cleanup": bool(org.dictation_cleanup_enabled), "specialty": org.dictation_specialty}
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([DictationThrottle])
def stream_url(request):
    """A short-lived signed WebSocket address; the browser streams audio straight to AWS with it."""
    org = _require(request.user)
    try:
        url = transcribe.presign_medical_stream(org.dictation_specialty)
    except EngineUnavailable:
        log.error("dictation: AWS credentials are not configured")
        return Response({"error": "dictation_unavailable"}, status=503)
    event = Event.objects.create(organization=org, user=request.user, kind=Event.Kind.STREAM_START)
    return Response(
        {
            "url": url,
            "session_id": str(event.session_id),
            "sample_rate": transcribe.SAMPLE_RATE,
            "expires_in": transcribe.PRESIGN_SECONDS,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([DictationThrottle])
def session_end(request):
    """The browser reports how long a dictation ran. Only a duration is stored."""
    org = _require(request.user)
    try:
        session_id = uuid.UUID(str(request.data.get("session_id")))
        seconds = int(request.data.get("seconds"))
    except (TypeError, ValueError):
        raise ValidationError({"session_id": "invalid"})
    started = Event.objects.filter(
        organization=org, user=request.user, session_id=session_id, kind=Event.Kind.STREAM_START
    ).exists()
    if not started:
        raise ValidationError({"session_id": "unknown"})
    already = Event.objects.filter(session_id=session_id, kind=Event.Kind.STREAM_END).exists()
    if not already:
        Event.objects.create(
            organization=org,
            user=request.user,
            kind=Event.Kind.STREAM_END,
            session_id=session_id,
            seconds=max(0, min(seconds, MAX_SESSION_SECONDS)),
        )
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([CleanupThrottle])
def cleanup_text(request):
    """Tidy dictated text and propose field values. Returns proposals; nothing is saved."""
    org = _require(request.user)
    if not org.dictation_cleanup_enabled:
        raise PermissionDenied("dictation_unavailable")
    transcript = request.data.get("transcript")
    if not isinstance(transcript, str) or not transcript.strip():
        raise ValidationError({"transcript": "required"})
    if len(transcript) > cleanup.MAX_TRANSCRIPT_CHARS:
        raise ValidationError({"transcript": "too_long"})
    fields = request.data.get("fields")
    if fields is not None and not isinstance(fields, list):
        raise ValidationError({"fields": "expected a list"})

    chars = len(transcript)
    try:
        result = cleanup.run(transcript.strip(), fields)
    except EngineUnavailable:
        Event.objects.create(organization=org, user=request.user, kind=Event.Kind.CLEANUP, chars=chars, ok=False, detail="unavailable")
        return Response({"error": "cleanup_unavailable"}, status=503)
    except cleanup.CleanupFailed as exc:
        log.warning("dictation cleanup failed: %s", exc)
        Event.objects.create(organization=org, user=request.user, kind=Event.Kind.CLEANUP, chars=chars, ok=False, detail=str(exc)[:60])
        return Response({"error": "cleanup_failed", "reason": str(exc)[:60]}, status=502)
    Event.objects.create(organization=org, user=request.user, kind=Event.Kind.CLEANUP, chars=chars)
    return Response(result)
