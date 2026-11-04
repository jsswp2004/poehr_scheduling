"""
Surgery module: operating-room cases, the Case List and the Day Planner.

A case books one patient for one operation. It reuses POWER's own records instead of copying them:
the patient is a users.Patient, the visit is an optional users.Registration, the hospital is an
appointments.Facility and the surgeon is a doctor (CustomUser). Operating rooms are their own list
(SurgeryRoom) so they never show up as patient beds on the bed board.
"""
from django.conf import settings
from django.db import IntegrityError, models, transaction
from django.db.models import Max

# status value -> label shown on the Case List and in the Day Planner legend
STATUS_CHOICES = [
    ("pending", "Pending"),
    ("preop", "In PreOp"),
    ("or", "In OR"),
    ("pacu", "In PACU"),
    ("discharged", "Discharged"),
    ("cancelled", "Procedure Cancelled"),
    ("transferred", "Transferred to Inpatient"),
]
STATUS_LABELS = dict(STATUS_CHOICES)

# where a case may go next from each status
STATUS_FLOW = {
    "pending": ("preop", "cancelled"),
    "preop": ("or", "cancelled"),
    "or": ("pacu", "cancelled", "transferred"),
    "pacu": ("discharged", "transferred"),
    "discharged": (),
    "cancelled": (),
    "transferred": (),
}
CLOSED_STATUSES = ("discharged", "cancelled", "transferred")

# The time stamped on a case when it moves into a status (only if it has not been set yet).
STATUS_STAMPS = {
    "preop": ["preop_start"],
    "or": ["patient_in"],
    "pacu": ["patient_out", "pacu_start"],
    "discharged": ["discharged_at"],
}

# The milestones in the order they happen; each must be on or after the one before it.
TIME_FIELDS = [
    "preop_start",
    "ready_for_or",
    "preop_end",
    "patient_in",
    "procedure_start",
    "procedure_end",
    "patient_out",
    "pacu_start",
    "discharged_at",
]

CASE_TYPE_CHOICES = [("elective", "Elective"), ("urgent", "Urgent"), ("emergent", "Emergent")]

# A closed case still takes documentation after the fact.
CLOSED_EDITABLE = ("comments", "booking_comments_2", "procedure_notes", "provider_notes")

PHYSICAL_STATUSES = ["ASA 1", "ASA 2", "ASA 3", "ASA 4", "ASA 5", "ASA 6", "ASA 1E", "ASA 2E", "ASA 3E", "ASA 4E", "ASA 5E"]

# Reasons offered when a case starts late (or early); the list is a convenience, any text up to 120 characters is kept.
DELAY_REASONS = [
    "Patient Arriving Late to Preoperative Area; Unforeseen Delay",
    "Previous Case Ran Over",
    "Surgeon Late",
    "Anesthesia Late",
    "Equipment / Supply Issue",
    "Room Not Ready",
    "Awaiting Lab or Imaging Results",
    "Patient Not Ready (Consent, NPO, Medical Clearance)",
    "Add-on or Emergency Case Ahead",
    "Staff Unavailable",
]

ANESTHESIA_TYPES = ["General", "MAC", "MAC + Spinal", "Spinal", "Epidural", "Regional", "Local", "Sedation", "None"]

PARTICIPANT_ROLES = [
    ("anesthesiologist", "Anesthesiologist"),
    ("anesthesia_assistant", "Anesthesia Assistant"),
    ("surgeon_primary", "Surgeon, Primary"),
    ("surgical_assistant", "Surgical Assistant"),
    ("scrub_technician", "Scrub Technician"),
    ("rn_preop", "RN, Preop Holding"),
    ("rn_circulator", "RN, Circulator"),
    ("rn_pacu", "RN, PACU"),
    ("vendor", "Vendor"),
]
PARTICIPANT_ROLE_LABELS = dict(PARTICIPANT_ROLES)


class SurgeryRoom(models.Model):
    """An operating room (or procedure room) at a facility; the Day Planner has one row per room."""

    facility = models.ForeignKey("appointments.Facility", on_delete=models.CASCADE, related_name="surgery_rooms")
    name = models.CharField(max_length=60)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    # The Location Manager room this OR is built on. Name and on/off follow that room (both ways);
    # Surgery keeps only its planner order. Null = an older room not linked yet.
    location_room = models.OneToOneField(
        "appointments.Room", null=True, blank=True, on_delete=models.PROTECT, related_name="surgery_room"
    )

    class Meta:
        ordering = ["sort_order", "name", "id"]
        unique_together = [("facility", "name")]

    def __str__(self):
        return f"{self.facility.name} - {self.name}"

    @property
    def unit_name(self):
        return self.location_room.unit.name if self.location_room_id else ""

    @property
    def path(self):
        """Facility > Unit > Room as shown to people."""
        parts = [self.facility.name, self.unit_name, self.name]
        return " › ".join(p for p in parts if p)


class SurgeryCase(models.Model):
    organization = models.ForeignKey("users.Organization", on_delete=models.CASCADE, related_name="surgery_cases")
    facility = models.ForeignKey("appointments.Facility", on_delete=models.PROTECT, related_name="surgery_cases")
    # System-generated, per organization (shown as Case ID).
    case_number = models.PositiveIntegerField(editable=False)
    patient = models.ForeignKey("users.Patient", on_delete=models.PROTECT, related_name="surgery_cases")
    visit = models.ForeignKey(
        "users.Registration", on_delete=models.SET_NULL, null=True, blank=True, related_name="surgery_cases"
    )
    room = models.ForeignKey(SurgeryRoom, on_delete=models.SET_NULL, null=True, blank=True, related_name="cases")

    scheduled_start = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveSmallIntegerField(default=60)

    surgeon = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="surgery_cases"
    )
    service = models.CharField(max_length=80, blank=True)
    case_type = models.CharField(max_length=10, choices=CASE_TYPE_CHOICES, default="elective")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="pending", db_index=True)
    anesthesia_type = models.CharField(max_length=60, blank=True)
    comments = models.TextField(blank=True)
    cancel_reason = models.CharField(max_length=200, blank=True)

    # Milestone times, in the order they happen.
    preop_start = models.DateTimeField(null=True, blank=True)
    patient_in = models.DateTimeField(null=True, blank=True)
    procedure_start = models.DateTimeField(null=True, blank=True)
    procedure_end = models.DateTimeField(null=True, blank=True)
    patient_out = models.DateTimeField(null=True, blank=True)
    pacu_start = models.DateTimeField(null=True, blank=True)
    discharged_at = models.DateTimeField(null=True, blank=True)
    ready_for_or = models.DateTimeField(null=True, blank=True)
    preop_end = models.DateTimeField(null=True, blank=True)
    # why a milestone ran early or late: {"patient_in": "Surgeon Late"}
    time_reasons = models.JSONField(default=dict, blank=True)

    # Case Header
    planned_start = models.DateTimeField(null=True, blank=True)
    scheduled_delay_reason = models.CharField(max_length=120, blank=True)
    planned_delay_reason = models.CharField(max_length=120, blank=True)
    requires_review = models.BooleanField(default=False)
    review_reason = models.TextField(blank=True)
    physical_status = models.CharField(max_length=20, blank=True)
    block_id = models.CharField(max_length=60, blank=True)
    booking_comments_2 = models.TextField(blank=True)
    procedure_notes = models.TextField(blank=True)
    provider_notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scheduled_start", "id"]
        unique_together = [("organization", "case_number")]
        indexes = [models.Index(fields=["facility", "scheduled_start"])]

    def __str__(self):
        return f"Case {self.case_number}"

    @property
    def scheduled_end(self):
        from datetime import timedelta

        return self.scheduled_start + timedelta(minutes=self.duration_minutes or 0)

    @property
    def is_closed(self):
        return self.status in CLOSED_STATUSES

    def save(self, *args, **kwargs):
        if self.case_number is not None:
            return super().save(*args, **kwargs)
        # Two people booking at the same moment can pick the same number; the unique constraint
        # catches it and the loser simply takes the next one.
        for attempt in range(5):
            last = SurgeryCase.objects.filter(organization_id=self.organization_id).aggregate(m=Max("case_number"))["m"]
            self.case_number = (last or 1000) + 1
            try:
                with transaction.atomic():
                    return super().save(*args, **kwargs)
            except IntegrityError:
                if attempt == 4:
                    raise
                self.case_number = None


class CaseProcedure(models.Model):
    LATERALITY_CHOICES = [
        ("", "None"),
        ("left", "Left"),
        ("right", "Right"),
        ("bilateral", "Bilateral"),
        ("na", "Non Applicable"),
    ]

    case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name="procedures")
    name = models.CharField(max_length=255)
    laterality = models.CharField(max_length=10, choices=LATERALITY_CHOICES, blank=True)
    cpt_code = models.CharField(max_length=10, blank=True)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    @property
    def display(self):
        label = dict(self.LATERALITY_CHOICES).get(self.laterality, "")
        return f"{self.name} [{label}]" if self.laterality else self.name


class CaseHistory(models.Model):
    """One entry per change to a case; this is what the Modification History dialog will read."""

    case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name="history")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    action = models.CharField(max_length=20)  # created, updated, status
    # {field: [previous, new]}, values as text
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class CaseParticipant(models.Model):
    """Someone working the case: a staff member (user) or, for a vendor, just a typed name."""

    case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name="participants")
    role = models.CharField(max_length=24, choices=PARTICIPANT_ROLES)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    name = models.CharField(max_length=120, blank=True)
    time_in = models.DateTimeField(null=True, blank=True)
    time_out = models.DateTimeField(null=True, blank=True)
    comments = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


USAGE_CATEGORIES = [
    ("EQUIPMENT_GROUP", "Equipment Group"),
    ("EQUIPMENT", "Equipment"),
    ("UNSTERILE", "Unsterile"),
    ("INSTRUMENT", "Instrument"),
    ("MEDICATIONS", "Medications"),
    ("PREP", "Prep"),
    ("IMPLANT", "Implant"),
    ("OTHER", "Other"),
]
USAGE_CATEGORY_LABELS = dict(USAGE_CATEGORIES)


class PreferenceCard(models.Model):
    """A surgeon's standard supply list for one procedure; merged onto a case to pre-fill its usage."""

    organization = models.ForeignKey("users.Organization", on_delete=models.CASCADE, related_name="surgery_cards")
    name = models.CharField(max_length=160)
    procedure_name = models.CharField(max_length=255, blank=True)
    surgeon = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    pre_op_notes = models.TextField(blank=True)
    post_op_notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name", "id"]
        unique_together = [("organization", "name")]

    def __str__(self):
        return self.name


class PreferenceCardItem(models.Model):
    card = models.ForeignKey(PreferenceCard, on_delete=models.CASCADE, related_name="items")
    category = models.CharField(max_length=20, choices=USAGE_CATEGORIES, default="OTHER")
    name = models.CharField(max_length=200)
    catalog_number = models.CharField(max_length=60, blank=True)
    quantity = models.PositiveSmallIntegerField(default=1)
    charge_code = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["category", "id"]


class CaseCard(models.Model):
    """A preference card merged onto a case. Exactly one is Primary (its notes show on Pre-op/Post-op)."""

    case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name="cards")
    card = models.ForeignKey(PreferenceCard, on_delete=models.PROTECT, related_name="case_links")
    is_primary = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_primary", "id"]
        unique_together = [("case", "card")]


class CaseUsageItem(models.Model):
    """One supply line on a case. used = total - hold - wasted."""

    case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name="usage")
    category = models.CharField(max_length=20, choices=USAGE_CATEGORIES, default="OTHER")
    name = models.CharField(max_length=200)
    catalog_number = models.CharField(max_length=60, blank=True)
    total = models.PositiveSmallIntegerField(default=1)
    hold = models.PositiveSmallIntegerField(default=0)
    wasted = models.PositiveSmallIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True)
    charge_code = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=80, blank=True)
    source_card = models.ForeignKey(PreferenceCard, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ["category", "id"]

    @property
    def used(self):
        return max(self.total - self.hold - self.wasted, 0)


CHARGE_POLICY_TYPES = [("usage", "Usage based"), ("case_time", "Case Time based"), ("mlm", "MLM")]
CHARGE_POLICY_TYPE_LABELS = dict(CHARGE_POLICY_TYPES)


class ChargePolicy(models.Model):
    """How time-based charges are worked out: a first block, then extra blocks (e.g. 30 min, then 15 min each).
    Usage charges need no policy: every supply with a charge code is billed for the amount used."""

    organization = models.ForeignKey("users.Organization", on_delete=models.CASCADE, related_name="surgery_charge_policies")
    name = models.CharField(max_length=120)
    policy_type = models.CharField(max_length=10, choices=CHARGE_POLICY_TYPES, default="case_time")
    time_basis = models.CharField(max_length=10, choices=[("or", "OR time"), ("anesthesia", "Anesthesia time")], default="or")
    first_code = models.CharField(max_length=120)
    first_minutes = models.PositiveSmallIntegerField(default=30)
    extra_code = models.CharField(max_length=120, blank=True)
    extra_minutes = models.PositiveSmallIntegerField(default=15)
    description = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name", "id"]
        unique_together = [("organization", "name")]


class CaseCharge(models.Model):
    STATUS_CHOICES = [("pending", "Pending Post"), ("posted", "Posted")]

    case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name="charges")
    charge_code = models.CharField(max_length=120)
    description = models.CharField(max_length=200, blank=True)
    policy_name = models.CharField(max_length=120, blank=True)
    policy_type = models.CharField(max_length=10, choices=CHARGE_POLICY_TYPES + [("manual", "Manual")], default="manual")  # usage, case_time, mlm or manual
    quantity = models.PositiveSmallIntegerField(default=1)
    item_charge = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default="pending")
    charge_date = models.DateField()
    is_auto = models.BooleanField(default=True)

    class Meta:
        ordering = ["id"]


class ChargePrice(models.Model):
    """The price list: what one unit of a charge code costs. Generated and manual charges look their price up here."""

    organization = models.ForeignKey("users.Organization", on_delete=models.CASCADE, related_name="surgery_prices")
    charge_code = models.CharField(max_length=60)  # just the code, e.g. OOR11665, upper case
    description = models.CharField(max_length=200, blank=True)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["charge_code"]
        unique_together = [("organization", "charge_code")]


DOCUMENT_CATEGORIES = [
    ("consent", "Consent"),
    ("history_physical", "History & Physical"),
    ("anesthesia", "Anesthesia Record"),
    ("operative_note", "Operative Note"),
    ("imaging", "Imaging / Results"),
    ("other", "Other"),
]
DOCUMENT_CATEGORY_LABELS = dict(DOCUMENT_CATEGORIES)
DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
# extension -> (content type, the first bytes a real file of that type starts with)
DOCUMENT_TYPES = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
}


def case_document_path(instance, filename):
    import uuid

    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    # a random name: the original name is kept in the database, never used on disk
    return f"surgery_documents/{instance.case.organization_id}/{instance.case_id}/{uuid.uuid4().hex}{ext}"


class CaseDocument(models.Model):
    """A scanned or uploaded file on a case (consent, H&P, operative note...). Kept on the persistent disk and
    served only through an authenticated download, never through a public /media/ link."""

    case = models.ForeignKey(SurgeryCase, on_delete=models.CASCADE, related_name="documents")
    title = models.CharField(max_length=160)
    category = models.CharField(max_length=20, choices=DOCUMENT_CATEGORIES, default="other")
    file = models.FileField(upload_to=case_document_path)
    original_name = models.CharField(max_length=200)
    content_type = models.CharField(max_length=60)
    size = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
