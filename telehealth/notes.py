"""Draft note stub, created when a visit ends.

The stub states only what this system recorded: modality, connect times, consent,
and the patient location the provider confirmed. It contains no clinical content
and no patient identifiers. The provider writes the actual note.
"""
import logging

from django.dispatch import receiver
from django.utils import timezone

from . import billing, services
from .models import TelehealthAuditEvent as E
from .models import TelehealthParticipant as P
from .models import TelehealthVisitRecord as VisitRecord
from .signals import session_ended

log = logging.getLogger(__name__)


def _clock(value):
    return timezone.localtime(value).strftime("%I:%M %p").lstrip("0")


def duration_seconds(session) -> int:
    """Connected time: from the moment the provider admitted the patient to the end of the visit."""
    if not (session.started_at and session.ended_at):
        return 0
    return max(0, int((session.ended_at - session.started_at).total_seconds()))


def render_stub(record, session) -> str:
    lines = ["TELEHEALTH VISIT - DRAFT. Provider to complete and sign."]

    if record.modality == billing.AUDIO_ONLY:
        lines.append("Modality: real-time audio only.")
    else:
        lines.append("Modality: real-time two-way audio and video.")

    if session.started_at and session.ended_at:
        minutes = max(1, round(record.duration_seconds / 60)) if record.duration_seconds else 0
        lines.append(
            f"Connected {_clock(session.started_at)} to {_clock(session.ended_at)} ({minutes} min)."
        )
    else:
        lines.append("The patient was not admitted to the visit.")

    consent = session.participants.filter(role=P.Role.PATIENT).values_list("consent_at", flat=True).first()
    if consent:
        lines.append(f"Patient agreed to the telehealth visit at {_clock(consent)}.")
    else:
        lines.append("Patient consent to telehealth was not recorded.")

    if record.location_confirmed:
        where = "at home" if record.patient_location == billing.HOME else "at a location other than home"
        state = f" State: {record.patient_state}." if record.patient_state else ""
        lines.append(f"Patient location (confirmed by provider): {where}.{state}")
    else:
        lines.append("Patient location: NOT CONFIRMED. Provider to confirm where the patient was.")

    lines.append("Provider location: provider to enter.")
    return "\n".join(lines)


def refresh_stub(record):
    """Rebuild the stub from current facts. Safe to call repeatedly."""
    session = record.session
    record.duration_seconds = duration_seconds(session)
    record.note_text = render_stub(record, session)
    record.save(update_fields=["duration_seconds", "note_text", "updated_at"])
    return record


@receiver(session_ended, dispatch_uid="telehealth.draft_note_on_end")
def draft_note_on_end(sender, session, **kwargs):
    # Whatever happens here must never stop a visit from ending.
    try:
        record, _ = VisitRecord.objects.get_or_create(session=session)
        refresh_stub(record)
        pushed = False
        try:
            ref = services.create_draft_note(session, record)
            if ref:
                record.external_note_ref = str(ref)[:128]
                record.save(update_fields=["external_note_ref", "updated_at"])
                pushed = True
        except Exception:
            log.exception("telehealth: pushing the draft note failed (local stub kept)")
        services.audit(session, E.Type.NOTE_DRAFTED, pushed=pushed)
    except Exception:
        log.exception("telehealth: drafting the visit note failed")
