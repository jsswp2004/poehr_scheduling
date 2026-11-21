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


# --------------------------------------------------------------------------------------------- Phase 2
# In-house outpatient fill: prescriptions sent to the clinic's own pharmacy are received, entered, filled,
# checked by a pharmacist, made ready and dispensed. Money is in Philippine pesos (PHP).

FILL_STAGES = [
    ("received", "Received"),
    ("data_entry", "Data entry"),
    ("filling", "Filling"),
    ("final_check", "Pharmacist final check"),
    ("ready", "Ready for pickup"),
    ("dispensed", "Dispensed"),
    ("on_hold", "On hold"),
]


class PharmacyPrice(models.Model):
    """
    The clinic's selling price for a drug, per unit, in PHP, VAT included (12%) unless the drug is VAT-exempt.
    `drug_name` is matched against the prescription's drug name (generic name; longest match wins).
    """

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="pharmacy_prices")
    drug_name = models.CharField(max_length=200, help_text="Generic name (and strength if priced per strength)")
    unit = models.CharField(max_length=30, blank=True, help_text="e.g. tablet, capsule, mL")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, help_text="PHP per unit")
    vat_exempt = models.BooleanField(default=False, help_text="Already VAT-exempt (e.g. medicines exempt under the Tax Code)")
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["drug_name", "id"]

    def __str__(self):
        return f"{self.drug_name}: PHP {self.unit_price}/{self.unit or 'unit'}"


class PatientDiscountId(models.Model):
    """A senior citizen (RA 9994, OSCA ID) or person with disability (RA 10754, PWD ID) ID kept on file."""

    KIND_CHOICES = [("senior", "Senior citizen (RA 9994)"), ("pwd", "Person with disability (RA 10754)")]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="+")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="discount_ids")
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    id_number = models.CharField(max_length=40)
    issued_by = models.CharField(max_length=120, blank=True, help_text="OSCA / PDAO office, city or municipality")
    is_active = models.BooleanField(default=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_active", "-created_at", "-id"]


class PrescriptionFill(models.Model):
    """One fill of an outpatient prescription at the in-house pharmacy (the original, a refill, or the rest of a partial fill)."""

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="prescription_fills")
    prescription = models.ForeignKey("appointments.Prescription", on_delete=models.PROTECT, related_name="fills")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="prescription_fills")
    fill_number = models.PositiveSmallIntegerField(default=1, help_text="1 = original fill, 2 = first refill, ...")
    stage = models.CharField(max_length=12, choices=FILL_STAGES, default="received")
    held_from = models.CharField(max_length=12, blank=True, help_text="The stage to go back to when the hold is released")
    hold_reason = models.CharField(max_length=300, blank=True)

    # what is dispensed (entered at data entry / filling)
    quantity = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text="Quantity this fill dispenses")
    quantity_unit = models.CharField(max_length=30, blank=True)
    product_name = models.CharField(max_length=200, blank=True, help_text="Product taken from the shelf")
    product_strength = models.CharField(max_length=60, blank=True)
    lot_number = models.CharField(max_length=40, blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    # pharmacist final check
    product_verified = models.BooleanField(default=False)
    strength_verified = models.BooleanField(default=False)
    quantity_verified = models.BooleanField(default=False)
    check_note = models.CharField(max_length=300, blank=True)

    # who did each stage, and when
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    received_at = models.DateTimeField(null=True, blank=True)
    entered_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    entered_at = models.DateTimeField(null=True, blank=True)
    filled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    filled_at = models.DateTimeField(null=True, blank=True)
    checked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    checked_at = models.DateTimeField(null=True, blank=True)
    dispensed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    dispensed_at = models.DateTimeField(null=True, blank=True)

    # dangerous drugs (RA 9165): the DDB yellow prescription and the prescriber's S2 license
    yellow_rx_serial = models.CharField(max_length=40, blank=True)
    s2_number = models.CharField(max_length=40, blank=True)

    # price (PHP) and the senior citizen / PWD discount
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    vat_exempt_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="VAT removed for a senior / PWD")
    discount_kind = models.CharField(max_length=10, blank=True)
    discount_id_number = models.CharField(max_length=40, blank=True)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # counseling at the counter
    counseling_offered = models.BooleanField(null=True, blank=True)
    counseling_accepted = models.BooleanField(null=True, blank=True)

    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["organization", "stage"])]

    def __str__(self):
        return f"Fill {self.fill_number} of Rx {self.prescription_id} ({self.stage})"


class FillEvent(models.Model):
    """Append-only history of a fill: every stage change, hold, check and dispense, with who and when."""

    fill = models.ForeignKey(PrescriptionFill, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=30)
    from_stage = models.CharField(max_length=12, blank=True)
    to_stage = models.CharField(max_length=12, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
