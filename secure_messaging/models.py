"""
Secure staff-to-staff messaging.

* A Thread is a conversation: two people (direct), a named group, a channel for a unit or team, or a patient
  care-team thread. A patient thread belongs to the patient, not to a visit, so it follows them across
  acute, emergency and ambulatory care; each message is stamped with the visit and care setting it was sent in.
* A person reads a thread only while they are a member of it. Read position is kept per member.
* Messages are never edited or deleted. A retraction hides the text from the thread but keeps it for audit.
* Every send, every opening of a patient thread, every membership change and every audit read is logged.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from users.models import Organization


class Thread(models.Model):
    DIRECT, GROUP, PATIENT, CHANNEL = "direct", "group", "patient", "channel"
    KIND_CHOICES = [
        (DIRECT, "Direct"),
        (GROUP, "Group"),
        (PATIENT, "Patient care team"),
        (CHANNEL, "Channel"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="secure_threads")
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    title = models.CharField(max_length=120, blank=True)
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="secure_threads"
    )
    facility = models.ForeignKey(
        "appointments.Facility", null=True, blank=True, on_delete=models.SET_NULL, related_name="secure_threads"
    )
    direct_key = models.CharField(max_length=40, blank=True, help_text="'low_id:high_id' for a direct thread")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "direct_key"], condition=Q(kind="direct"), name="one_direct_thread_per_pair"
            ),
            models.UniqueConstraint(
                fields=["organization", "patient"], condition=Q(kind="patient"), name="one_care_team_thread_per_patient"
            ),
        ]
        ordering = ["-last_message_at", "-id"]

    def __str__(self):
        return self.title or f"{self.kind} thread {self.pk}"


class ThreadMember(models.Model):
    OWNER, MEMBER = "owner", "member"

    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="secure_memberships")
    role = models.CharField(max_length=10, default=MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    last_read_message_id = models.BigIntegerField(default=0)
    muted = models.BooleanField(default=False)

    class Meta:
        unique_together = [("thread", "user")]

    @property
    def active(self):
        return self.left_at is None


class SecureMessage(models.Model):
    TEXT, SYSTEM = "text", "system"
    ROUTINE, URGENT = "routine", "urgent"

    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="secure_messages_sent")
    kind = models.CharField(max_length=10, default=TEXT)
    body = models.TextField(max_length=4000)
    priority = models.CharField(max_length=10, default=ROUTINE)
    reply_to = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="replies")
    # the visit and care setting the patient was in when this was sent (patient threads only)
    visit = models.ForeignKey("users.Registration", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    care_setting = models.CharField(max_length=12, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    retracted_at = models.DateTimeField(null=True, blank=True)
    retracted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    retract_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["thread", "id"])]


class MessageAttachment(models.Model):
    """
    A photo on a message. The server shrinks every upload to at most MAX_BYTES, converts it to JPEG and strips
    its metadata (location, camera), then keeps it in the database next to a small thumbnail. It is served only
    to members of the thread, and never while its message is retracted.
    """

    MAX_BYTES = 1_000_000

    message = models.ForeignKey(SecureMessage, on_delete=models.CASCADE, related_name="attachments")
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name="+")
    filename = models.CharField(max_length=120, blank=True)
    content_type = models.CharField(max_length=40, default="image/jpeg")
    data = models.BinaryField()
    thumb = models.BinaryField()
    size = models.IntegerField()
    width = models.IntegerField()
    height = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]


class AuditEvent(models.Model):
    """Who did what, when. Message text is never copied here."""

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="secure_audit")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=30)
    thread = models.ForeignKey(Thread, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    message_id = models.BigIntegerField(null=True, blank=True)
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    detail = models.CharField(max_length=255, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-at", "-id"]
        indexes = [models.Index(fields=["organization", "-at"]), models.Index(fields=["patient", "-at"])]
