"""POWER Pharmacy: what a pharmacist did to a medication order (the verification itself lives on the Order)."""

from django.conf import settings
from django.db import models

from users.models import Organization


class PharmacyIntervention(models.Model):
    """One pharmacist intervention on a medication order: a change, a clarification, a rejection or an alert override."""

    TYPE_CHOICES = [
        ("modify", "Verified with change"),
        ("clarify", "Clarification requested"),
        ("reject", "Rejected"),
        ("alert_override", "Alert acknowledged and overridden"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True, blank=True, related_name="pharmacy_interventions")
    order = models.ForeignKey("appointments.Order", on_delete=models.CASCADE, related_name="pharmacy_interventions")
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    reason = models.CharField(max_length=300, blank=True)
    original_value = models.JSONField(default=dict, blank=True)
    new_value = models.JSONField(default=dict, blank=True)
    note = models.TextField(blank=True)
    pharmacist = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="pharmacy_interventions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["organization", "created_at"])]

    def __str__(self):
        return f"{self.get_type_display()} on order {self.order_id}"
