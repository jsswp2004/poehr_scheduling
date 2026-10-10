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
