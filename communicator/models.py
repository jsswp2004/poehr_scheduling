import uuid

from django.conf import settings
from django.db import models


class Contact(models.Model):
    """Simple contact record for message sending."""

    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="contacts"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # Normalized phone (+1XXXXXXXXXX), maintained automatically in save().
    phone_e164 = models.CharField(max_length=20, blank=True, db_index=True, editable=False)

    # SMS opt-out state for contacts who are not registered users.
    sms_opt_out = models.BooleanField(default=False)
    sms_opt_out_date = models.DateTimeField(null=True, blank=True)
    sms_opt_out_method = models.CharField(max_length=20, null=True, blank=True)

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        from .utils import format_phone_to_international

        self.phone_e164 = format_phone_to_international(self.phone) if self.phone else ""
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "phone" in update_fields:
            kwargs["update_fields"] = list(update_fields) + ["phone_e164"]
        super().save(*args, **kwargs)


class MessageLog(models.Model):
    """Record of sent SMS and email messages."""

    MESSAGE_TYPE_CHOICES = [
        ("sms", "SMS"),
        ("email", "Email"),
        ("webhook", "SMS Webhook"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="message_logs",
    )
    # Optional organization for system-generated or org-scoped logs
    organization = models.ForeignKey(
        "users.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="message_logs",
        help_text="Organization associated with this message, used when user is None or to scope logs",
    )
    recipient = models.CharField(max_length=255)
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField()
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPE_CHOICES)
    status = models.CharField(max_length=20, blank=True)
    provider_id = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.message_type.upper()} to {self.recipient}"


class CommunicatorAssistantMessage(models.Model):
    """
    One question/answer exchange with the in-app Communicator assistant.

    Support + audit log. Stores the question, the answer and WHICH tools ran
    (with their arguments), never the raw data the tools returned, so the log
    does not become a second copy of the contact list or message history.
    """

    organization = models.ForeignKey(
        "users.Organization", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    user_role = models.CharField(max_length=20, blank=True, default="")
    conversation_id = models.UUIDField(db_index=True)
    question = models.TextField()
    answer = models.TextField(blank=True, default="")
    tools_used = models.JSONField(default=list, blank=True)
    model = models.CharField(max_length=60, blank=True, default="")
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "-created_at"], name="comm_as_user_created_idx")]

    def __str__(self) -> str:
        return f"{self.user_id} @ {self.created_at:%Y-%m-%d %H:%M}: {self.question[:40]}"


class CommunicatorPendingAction(models.Model):
    """
    A change the Communicator assistant has PREPARED but not performed.

    The model can only create these through "propose" tools. Nothing runs until
    the same signed-in user presses Confirm in the app; the model has no way to
    confirm. A row is single-use, belongs to one user and expires after a few
    minutes. `params` holds only what the action needs; it is purged with the
    assistant log.
    """

    STATUS_PENDING = "pending"
    STATUS_SENDING = "sending"  # claimed by a confirm request; never retried automatically
    STATUS_CONFIRMED = "confirmed"
    STATUS_CANCELLED = "cancelled"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Waiting for confirmation"),
        (STATUS_SENDING, "Being carried out"),
        (STATUS_CONFIRMED, "Confirmed and done"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_FAILED, "Confirmed but failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "users.Organization", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    action_type = models.CharField(max_length=40)
    params = models.JSONField(default=dict, blank=True)
    summary = models.CharField(max_length=500)
    detail = models.TextField(blank=True, default="")  # e.g. the full message text shown on the card
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING)
    result_message = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    expires_at = models.DateTimeField()
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "status"], name="comm_apa_user_status_idx")]

    def __str__(self) -> str:
        return f"{self.action_type} ({self.status}) for user {self.user_id}"
