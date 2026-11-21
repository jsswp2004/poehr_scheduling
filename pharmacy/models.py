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
    A selling price for a drug, per unit, in PHP, VAT included (12%) unless the drug is VAT-exempt.
    `drug_name` is matched against the prescription's drug name (generic name; longest match wins).
    Formulary prices are tied to their item (`orderable`) and are PER CLINIC: each clinic sets its own price, unit and
    VAT-exempt flag for shared items and for its own items. Rows with no organization (shared prices from before
    prices became per clinic) are kept in the database but ignored.
    """

    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.CASCADE, related_name="pharmacy_prices")
    orderable = models.ForeignKey("appointments.Orderable", null=True, blank=True, on_delete=models.CASCADE, related_name="prices")
    drug_name = models.CharField(max_length=200, help_text="Generic name (and strength if priced per strength)")
    unit = models.CharField(max_length=30, blank=True, help_text="e.g. tablet, capsule, mL")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, help_text="PHP per unit")
    vat_exempt = models.BooleanField(
        default=False,
        help_text="Already VAT-exempt under the Tax Code. A pharmacist must set this for the clinic's formulary "
        "(e.g. certain medicines for diabetes, hypertension and high cholesterol).",
    )
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
    # The final check is done by a different pharmacist than the one who filled; when only one pharmacist is on
    # duty they may check their own fill, with the reason kept here (and in the fill's history).
    single_pharmacist_reason = models.CharField(max_length=300, blank=True)

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

    # the dispensing pharmacist's PRC license number as it was at dispense (printed on the label)
    pharmacist_license = models.CharField(max_length=40, blank=True)

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


class PharmacistProfile(models.Model):
    """A pharmacist's PRC license number (RA 10918), printed on the labels of what they dispense."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pharmacist_profile")
    prc_license_number = models.CharField(max_length=40, blank=True)
    reviews_shared_formulary = models.BooleanField(
        default=False,
        help_text="POWER-level formulary reviewer: may mark SHARED formulary items reviewed. Set by a system administrator.",
    )
    updated_at = models.DateTimeField(auto_now=True)


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


# --------------------------------------------------------------------------------------------- Phase 3
# POWER Pharmacy Portal: outside (partner) pharmacies receive, claim and dispense POWER prescriptions.
# A partner pharmacy belongs to no clinic; its staff log in to /pharmacy-portal only.

class PartnerPharmacy(models.Model):
    """An outside pharmacy on the POWER Pharmacy Portal. Approved by a POWER administrator before it can work."""

    STATUS_CHOICES = [("pending", "Pending approval"), ("approved", "Approved"), ("suspended", "Suspended")]

    name = models.CharField(max_length=200)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=80, blank=True)
    province = models.CharField(max_length=80, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True, help_text="Where portal notices are emailed")
    fda_lto_number = models.CharField(max_length=40)
    lto_expiry = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    status_reason = models.CharField(max_length=300, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]
        verbose_name_plural = "partner pharmacies"

    def __str__(self):
        return self.name


class PartnerPharmacist(models.Model):
    """A pharmacist (PRC license, RA 10918) or administrator of a partner pharmacy; `user` is their portal login."""

    partner = models.ForeignKey(PartnerPharmacy, on_delete=models.CASCADE, related_name="staff")
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="portal_membership")
    full_name = models.CharField(max_length=160)
    prc_number = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True, help_text="Portal notices are emailed to each active pharmacist")
    is_admin = models.BooleanField(default=False, help_text="Manages the pharmacy's portal logins (the person who registered it)")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_name", "id"]


class PartnerDirectoryLink(models.Model):
    """A clinic's pharmacy-directory entry that is a portal partner: prescriptions sent to it go to the portal."""

    pharmacy = models.OneToOneField("appointments.Pharmacy", on_delete=models.CASCADE, related_name="portal_link")
    partner = models.ForeignKey(PartnerPharmacy, on_delete=models.CASCADE, related_name="directory_links")
    created_at = models.DateTimeField(auto_now_add=True)


PORTAL_STATUSES = [
    ("new", "New"),
    ("in_progress", "In progress"),
    ("ready", "Ready for pickup"),
    ("partially_dispensed", "Partially dispensed"),
    ("dispensed", "Dispensed"),
    ("declined", "Declined (back with the prescriber)"),
    ("released", "Released for claiming"),
    ("cancelled", "Cancelled by prescriber"),
]


class PortalPrescription(models.Model):
    """Where a prescription stands at a partner pharmacy. Once claimed or routed, it is locked to that pharmacy."""

    prescription = models.OneToOneField("appointments.Prescription", on_delete=models.CASCADE, related_name="portal")
    partner = models.ForeignKey(PartnerPharmacy, null=True, blank=True, on_delete=models.PROTECT, related_name="prescriptions")
    status = models.CharField(max_length=20, choices=PORTAL_STATUSES, default="new")
    how = models.CharField(max_length=10, blank=True, help_text="routed (chosen by the prescriber) or claimed (claim code)")
    fill_number = models.PositiveSmallIntegerField(default=1)
    decline_reason = models.CharField(max_length=300, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-updated_at", "-id"]


class PortalDispense(models.Model):
    """What a partner pharmacy dispensed: the actual product (generic substitution, RA 6675), who and when."""

    portal = models.ForeignKey(PortalPrescription, on_delete=models.CASCADE, related_name="dispenses")
    partner = models.ForeignKey(PartnerPharmacy, on_delete=models.PROTECT, related_name="+")
    fill_number = models.PositiveSmallIntegerField(default=1)
    quantity = models.DecimalField(max_digits=8, decimal_places=2)
    is_partial = models.BooleanField(default=False)
    generic_name = models.CharField(max_length=200)
    brand_name = models.CharField(max_length=200, blank=True)
    manufacturer = models.CharField(max_length=200, blank=True)
    strength = models.CharField(max_length=60, blank=True)
    form = models.CharField(max_length=40, blank=True)
    yellow_rx_serial = models.CharField(max_length=40, blank=True)
    original_in_hand = models.BooleanField(default=False)
    discount_id_type = models.CharField(max_length=10, blank=True)  # senior / pwd
    discount_id_number = models.CharField(max_length=40, blank=True)
    pharmacist = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    pharmacist_prc = models.CharField(max_length=40, blank=True)
    dispensed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-dispensed_at", "-id"]


class PortalRequest(models.Model):
    """A partner pharmacy asks the prescriber: a change (out of stock, other strength/form, clarification) or a renewal."""

    KIND_CHOICES = [
        ("out_of_stock", "Out of stock"),
        ("strength_form", "Different strength or form"),
        ("clarification", "Clarification"),
        ("renewal", "Renewal"),
    ]
    STATUS_CHOICES = [("pending", "Pending"), ("approved", "Approved"), ("denied", "Denied")]

    portal = models.ForeignKey(PortalPrescription, on_delete=models.CASCADE, related_name="requests")
    partner = models.ForeignKey(PartnerPharmacy, on_delete=models.CASCADE, related_name="+")
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    message = models.CharField(max_length=1000)
    proposed = models.CharField(max_length=300, blank=True, help_text="e.g. the strength or form the pharmacy has")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    response = models.CharField(max_length=1000, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    responded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    responded_at = models.DateTimeField(null=True, blank=True)
    renewal_prescription = models.ForeignKey("appointments.Prescription", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class PortalNotice(models.Model):
    """An in-app notice for a partner pharmacy (also emailed)."""

    partner = models.ForeignKey(PartnerPharmacy, on_delete=models.CASCADE, related_name="notices")
    portal = models.ForeignKey(PortalPrescription, null=True, blank=True, on_delete=models.CASCADE, related_name="notices")
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class PortalAccessLog(models.Model):
    """Data Privacy Act (RA 10173): every view and action by a portal user, kept per user."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    partner = models.ForeignKey(PartnerPharmacy, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    prescription = models.ForeignKey("appointments.Prescription", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=40)
    detail = models.JSONField(default=dict, blank=True)
    ip = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "created_at"])]


# --------------------------------------------------------------------------------------------- Formulary
# The POWER Formulary is the medication orderables (shared: no organization; clinic-only: one organization).
# A clinic changes a SHARED item only through FormularyOverride (local flags, active); its price, unit and
# VAT-exempt are always the clinic's own PharmacyPrice. The shared item itself belongs to POWER system administrators.

class FormularyOverride(models.Model):
    """One clinic's local values for a shared formulary item. `values` holds only the overridden fields."""

    OVERRIDABLE = ("is_active", "dangerous_drug", "renal_threshold_crcl")

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="formulary_overrides")
    orderable = models.ForeignKey("appointments.Orderable", on_delete=models.CASCADE, related_name="formulary_overrides")
    values = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "orderable"], name="uniq_formulary_override")]


class FormularyImport(models.Model):
    """A CSV applied to the formulary, with the original file (kept as uploaded)."""

    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.CASCADE, related_name="+",
                                     help_text="Blank = the shared POWER formulary")
    filename = models.CharField(max_length=255)
    content = models.TextField()
    created = models.PositiveIntegerField(default=0)
    changed = models.PositiveIntegerField(default=0)
    unchanged = models.PositiveIntegerField(default=0)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class FormularyChange(models.Model):
    """Change history: who changed which formulary item, when, from what to what, by hand or by an import."""

    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.CASCADE, related_name="+",
                                     help_text="Blank = a change to the shared item itself")
    orderable = models.ForeignKey("appointments.Orderable", on_delete=models.CASCADE, related_name="formulary_changes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    source = models.CharField(max_length=10, default="manual")  # manual / import / revert / migration / starter / review
    formulary_import = models.ForeignKey(FormularyImport, null=True, blank=True, on_delete=models.SET_NULL, related_name="changes")
    changes = models.JSONField(default=dict)  # {field: [old, new]}
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class FormularyReview(models.Model):
    """
    "Needs pharmacist review" for one formulary item. No row means the item needs review: every new item, every
    starter item and every item the flag migration touched starts that way. Marking it reviewed fills reviewed_by and
    reviewed_at; a later change to a clinical field (names, strength, form, route, RxNorm, dangerous drug, renal
    threshold) or any change by an import sets it back to needs review (the last reviewer stays on record).
    A shared item is reviewed at POWER level; a clinic's own item by that clinic's pharmacist.
    """

    STATUS_CHOICES = [("needs_review", "Needs pharmacist review"), ("reviewed", "Reviewed")]

    orderable = models.OneToOneField("appointments.Orderable", on_delete=models.CASCADE, related_name="formulary_review")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="needs_review")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class FormularyReviewerChange(models.Model):
    """Audit of the POWER formulary reviewer list: which system administrator added or removed which pharmacist."""

    pharmacist = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    granted = models.BooleanField(help_text="True: made a reviewer; False: no longer a reviewer")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

