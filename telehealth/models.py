import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class TelehealthSession(models.Model):
    """One video visit, tied 1:1 to an Appointment. Holds no PHI itself."""

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        WAITING = "waiting", "Waiting"
        IN_PROGRESS = "in_progress", "In progress"
        ENDED = "ended", "Ended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.OneToOneField(
        settings.TELEHEALTH_APPOINTMENT_MODEL,
        on_delete=models.PROTECT,
        related_name="telehealth_session",
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.SCHEDULED, db_index=True
    )
    # Opaque identifier sent to Chime as ExternalMeetingId. Never derived from PHI.
    room_name = models.CharField(max_length=64, unique=True)
    chime_meeting_id = models.CharField(max_length=64, blank=True)
    media_region = models.CharField(max_length=32, blank=True)
    # Chime "Meeting" object (media placement URLs). Attendee JoinTokens are NOT stored.
    meeting_payload = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    consent_at = models.DateTimeField(null=True, blank=True)

    # Tenant isolation. Taken from the appointment when the session is created and checked on
    # every staff request. The patient join endpoints have no login, so they rely on the link token.
    organization = models.ForeignKey(
        "users.Organization", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    def __str__(self):
        return f"TelehealthSession {self.id} ({self.status})"


class TelehealthParticipant(models.Model):
    class Role(models.TextChoices):
        PROVIDER = "provider", "Provider"
        PATIENT = "patient", "Patient"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        TelehealthSession, on_delete=models.CASCADE, related_name="participants"
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    # Set for providers only. Patients authenticate via the tokenized link.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    # Patient link token: only the SHA-256 hash is stored.
    token_hash = models.CharField(max_length=64, unique=True, null=True, blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    token_redeemed_at = models.DateTimeField(null=True, blank=True)

    arrived_at = models.DateTimeField(null=True, blank=True)
    admitted_at = models.DateTimeField(null=True, blank=True)
    admitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    consent_at = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)
    chime_attendee_id = models.CharField(max_length=64, blank=True)

    class Meta:
        constraints = [
            # 1:1 visits for now. Group visits would drop this constraint.
            models.UniqueConstraint(fields=["session", "role"], name="telehealth_one_per_role"),
        ]

    @staticmethod
    def hash_token(raw: str) -> str:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def issue_token(self, ttl_minutes: int) -> str:
        """Mint a fresh single-use token, invalidating any previous one."""
        raw = secrets.token_urlsafe(32)
        self.token_hash = self.hash_token(raw)
        self.token_expires_at = timezone.now() + timedelta(minutes=ttl_minutes)
        self.token_redeemed_at = None
        self.save(update_fields=["token_hash", "token_expires_at", "token_redeemed_at"])
        return raw


class TelehealthVisitRecord(models.Model):
    """Billing context and the draft note stub for one visit.

    Holds no patient identifiers: it links to the session, and the session links to
    the appointment. The note text is built only from facts this system recorded.
    """

    class Location(models.TextChoices):
        UNCONFIRMED = "", "Not confirmed"
        HOME = "home", "Patient at home"
        OTHER = "other", "Patient somewhere else"

    class Modality(models.TextChoices):
        AUDIO_VIDEO = "audio_video", "Audio and video"
        AUDIO_ONLY = "audio_only", "Audio only"

    session = models.OneToOneField(
        TelehealthSession, on_delete=models.PROTECT, related_name="visit_record"
    )
    modality = models.CharField(
        max_length=16, choices=Modality.choices, default=Modality.AUDIO_VIDEO
    )
    patient_location = models.CharField(
        max_length=8, choices=Location.choices, blank=True, default=""
    )
    patient_state = models.CharField(max_length=2, blank=True)
    place_of_service = models.CharField(max_length=2, blank=True)
    modifier = models.CharField(max_length=2, blank=True)
    location_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    location_confirmed_at = models.DateTimeField(null=True, blank=True)

    duration_seconds = models.PositiveIntegerField(default=0)
    note_text = models.TextField(blank=True)
    # Whatever your clinical system returns when the stub is pushed (see services.create_draft_note).
    external_note_ref = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def location_confirmed(self) -> bool:
        return bool(self.patient_location and self.location_confirmed_at)

    @property
    def ready_for_billing(self) -> bool:
        """A visit happened and the provider has said where the patient was."""
        return self.location_confirmed and self.duration_seconds > 0


class TelehealthAuditEvent(models.Model):
    """Append-only record of who did what, and when. No media, no PHI."""

    class Type(models.TextChoices):
        SESSION_CREATED = "session_created"
        LINK_ISSUED = "link_issued"
        LINK_SENT = "link_sent"
        LINK_SUPPRESSED = "link_suppressed"
        PATIENT_ARRIVED = "patient_arrived"
        PATIENT_CONSENTED = "patient_consented"
        PATIENT_ADMITTED = "patient_admitted"
        MEDIA_ISSUED = "media_issued"
        JOINED = "joined"
        LEFT = "left"
        SESSION_ENDED = "session_ended"
        BILLING_CONTEXT_SET = "billing_context_set"
        NOTE_DRAFTED = "note_drafted"

    session = models.ForeignKey(
        TelehealthSession, on_delete=models.PROTECT, related_name="audit_events"
    )
    participant = models.ForeignKey(
        TelehealthParticipant, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    event_type = models.CharField(max_length=32, choices=Type.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    ip_address = models.CharField(max_length=45, blank=True)
    user_agent = models.CharField(max_length=200, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["created_at"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise RuntimeError("Audit events are append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Audit events cannot be deleted.")
