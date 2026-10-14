"""Audit trail for dictation.

Records who dictated, when, for how long, and how much text went through cleanup.
It deliberately has NO column for audio or transcript text: nothing clinical is stored here.
"""
import uuid

from django.conf import settings
from django.db import models


class DictationEvent(models.Model):
    class Kind(models.TextChoices):
        STREAM_START = "stream_start", "Dictation started"
        STREAM_END = "stream_end", "Dictation ended"
        CLEANUP = "cleanup", "AI cleanup"

    organization = models.ForeignKey("users.Organization", on_delete=models.CASCADE, related_name="dictation_events")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="dictation_events"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    session_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    seconds = models.PositiveIntegerField(null=True, blank=True)
    chars = models.PositiveIntegerField(null=True, blank=True)
    ok = models.BooleanField(default=True)
    detail = models.CharField(max_length=60, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["organization", "-created_at"])]

    def __str__(self):
        return f"{self.kind} {self.session_id} ({self.organization_id})"
