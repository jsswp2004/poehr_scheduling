"""
POWER Lab Portal: outside (partner) laboratories receive lab requests from POWER clinics and hospitals, collect the
specimens and send the results back onto the patient's chart (appointments.LabReport, source "partner_lab").

Same shape as the POWER Pharmacy Portal (pharmacy.models, Phase 3): a partner registers, a POWER administrator
approves it, its staff log in to /lab-portal only, and every view and action is written to LabPortalAccessLog.
"""

from django.conf import settings
from django.db import models

from users.models import Organization

COUNTRY_CHOICES = [("PH", "Philippines"), ("US", "United States")]


class PartnerLab(models.Model):
    """An outside laboratory on the POWER Lab Portal. Approved by a POWER administrator before it can work."""

    STATUS_CHOICES = [("pending", "Pending approval"), ("approved", "Approved"), ("suspended", "Suspended")]

    name = models.CharField(max_length=200)
    country = models.CharField(max_length=2, choices=COUNTRY_CHOICES, default="PH")
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=80, blank=True)
    province = models.CharField(max_length=80, blank=True, help_text="Province (PH) or state (US)")
    postal_code = models.CharField(max_length=12, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True, help_text="Where portal notices are emailed when no staff member has an email")
    sms_mobile = models.CharField(max_length=16, blank=True,
                                  help_text="Mobile number for new-request texts when no staff member has a mobile")
    # PH: DOH-HFSRB License to Operate a clinical laboratory. US: CLIA certificate number.
    license_number = models.CharField(max_length=40)
    license_expiry = models.DateField()
    license_category = models.CharField(max_length=80, blank=True,
                                        help_text="PH: DOH category (primary / secondary / tertiary). US: CLIA certificate type.")
    head_name = models.CharField(max_length=160, blank=True, help_text="PH: head pathologist. US: laboratory director.")
    head_license = models.CharField(max_length=40, blank=True, help_text="PH: the pathologist's PRC number.")
    hours = models.CharField(max_length=120, blank=True, help_text="Shown to patients, e.g. Mon-Sat 6am-6pm")
    offers_walk_in = models.BooleanField(default=True)
    offers_bedside = models.BooleanField(default=False, help_text="Sends staff to collect at a hospital bedside")
    offers_courier = models.BooleanField(default=False, help_text="Picks up specimens a hospital collected")
    offers_home_service = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    status_reason = models.CharField(max_length=300, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self):
        return self.name


class PartnerLabStaff(models.Model):
    """
    A member of a partner lab; `user` is their portal login (ext_lab_tech, ext_lab_pathologist or ext_lab_admin).
    PH: a medical technologist (RMT) or pathologist with a PRC number. `can_release` lets them release results;
    in the Philippines a result with a critical value needs a pathologist to release it.
    """

    partner = models.ForeignKey(PartnerLab, on_delete=models.CASCADE, related_name="staff")
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="lab_portal_membership")
    full_name = models.CharField(max_length=160)
    license_number = models.CharField(max_length=40, blank=True, help_text="PH: PRC number. US: certification, e.g. MLS(ASCP).")
    email = models.EmailField(blank=True)
    mobile = models.CharField(max_length=16, blank=True, help_text="Mobile number for new-request texts")
    is_admin = models.BooleanField(default=False, help_text="Manages the lab's portal logins")
    is_pathologist = models.BooleanField(default=False)
    can_release = models.BooleanField(default=True, help_text="May release results to the clinic")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_name", "id"]

    def __str__(self):
        return self.full_name


class ClinicLab(models.Model):
    """
    One entry in a clinic's lab directory: what providers choose under "Where will these be done?".
    Only partner_portal entries route requests through the portal; the others are listed so the choice is complete
    (interface labs use the existing HL7/FHIR interface, in-house results are entered in POWER).
    """

    MODE_CHOICES = [
        ("partner_portal", "Partner lab portal"),
        ("interface", "HL7 / FHIR interface"),
        ("in_house", "In-house lab"),
        ("print_only", "Print the requisition only"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="clinic_labs")
    name = models.CharField(max_length=200)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default="partner_portal")
    partner = models.ForeignKey(PartnerLab, null=True, blank=True, on_delete=models.PROTECT, related_name="directory_entries")
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    note = models.CharField(max_length=200, blank=True, help_text="Shown to providers, e.g. distance, turnaround")
    is_default = models.BooleanField(default=False)
    accepts_inpatient = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "name", "id"]

    def __str__(self):
        return f"{self.name} ({self.organization_id})"


REQUEST_STATUSES = [
    ("unclaimed", "Waiting for a lab (patient chooses)"),
    ("new", "New"),
    ("accepted", "Accepted, waiting for the patient"),
    ("collected", "Specimen collected"),
    ("in_process", "In process"),
    ("preliminary", "Preliminary result"),
    ("final", "Final result"),
    ("declined", "Declined by the lab"),
    ("cancelled", "Cancelled"),
    ("expired", "Expired (not collected)"),
]
OPEN_STATUSES = ("unclaimed", "new", "accepted", "collected", "in_process", "preliminary")


class LabRequest(models.Model):
    """
    One requisition: one or more signed lab orders for one patient, sent to one lab. By default each test gets its
    own request; the provider may put all of a visit's tests on one. Locked to its lab once routed or claimed.
    """

    CARE_CHOICES = [("outpatient", "Outpatient"), ("inpatient", "Inpatient")]
    COLLECTION_CHOICES = [
        ("at_lab", "Patient goes to the lab"),
        ("lab_at_bedside", "Lab collects at the bedside"),
        ("hospital_collects", "Hospital collects, courier takes it"),
    ]
    PRIORITY_CHOICES = [("routine", "Routine"), ("urgent", "Urgent"), ("stat", "STAT")]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="lab_requests")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lab_requests")
    ordering_provider = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lab_requests_ordered")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    clinic_lab = models.ForeignKey(ClinicLab, null=True, blank=True, on_delete=models.SET_NULL, related_name="requests")
    partner = models.ForeignKey(PartnerLab, null=True, blank=True, on_delete=models.PROTECT, related_name="requests")
    group_key = models.CharField(max_length=20, blank=True, help_text="Requests sent together share this key")
    claim_code = models.CharField(max_length=12, unique=True)
    how = models.CharField(max_length=10, blank=True, help_text="routed (chosen by the provider) or claimed (claim code)")
    status = models.CharField(max_length=12, choices=REQUEST_STATUSES, default="new")
    care_setting = models.CharField(max_length=12, choices=CARE_CHOICES, default="outpatient")
    collection = models.CharField(max_length=20, choices=COLLECTION_CHOICES, default="at_lab")
    location = models.CharField(max_length=120, blank=True, help_text="Inpatient: ward and bed")
    priority = models.CharField(max_length=8, choices=PRIORITY_CHOICES, default="routine")
    fasting_required = models.BooleanField(default=False)
    note_to_lab = models.CharField(max_length=500, blank=True)
    collect_by = models.DateField(null=True, blank=True)
    decline_reason = models.CharField(max_length=300, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    # specimen collection
    collected_at = models.DateTimeField(null=True, blank=True)
    collected_by_name = models.CharField(max_length=160, blank=True)
    accession_number = models.CharField(max_length=64, blank=True)
    specimen_note = models.CharField(max_length=300, blank=True)
    # release
    released_at = models.DateTimeField(null=True, blank=True)
    released_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    released_by_name = models.CharField(max_length=160, blank=True)
    released_by_license = models.CharField(max_length=40, blank=True)
    patient_told_at = models.DateTimeField(null=True, blank=True, help_text="When the patient was texted that results are back")
    # not collected: reminders at day 3 and 7, expired at day 30
    expires_at = models.DateTimeField(null=True, blank=True)
    reminders_sent = models.PositiveSmallIntegerField(default=0)
    locked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["partner", "status"]),
            models.Index(fields=["organization", "status"]),
        ]

    @property
    def number(self):
        return f"LR-{self.pk:06d}"

    def __str__(self):
        return f"{self.number} ({self.status})"


class LabRequestItem(models.Model):
    """One ordered test on a request, and the report the lab sent back for it."""

    STATUS_CHOICES = [("pending", "Pending"), ("resulted", "Resulted"), ("cancelled", "Cancelled")]

    request = models.ForeignKey(LabRequest, on_delete=models.CASCADE, related_name="items")
    order = models.ForeignKey("appointments.Order", on_delete=models.PROTECT, related_name="lab_request_items")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    lab_report = models.ForeignKey("appointments.LabReport", null=True, blank=True, on_delete=models.SET_NULL, related_name="lab_request_items")
    # Results the lab has entered but not released yet: {"title", "comment", "items": [result lines]}
    draft = models.JSONField(default=dict, blank=True)
    draft_saved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]


class LabRequestFile(models.Model):
    """The lab's signed report (PDF), uploaded before release and copied onto each report it releases."""

    request = models.OneToOneField(LabRequest, on_delete=models.CASCADE, related_name="report_file")
    file_name = models.CharField(max_length=150)
    content_type = models.CharField(max_length=50)
    size = models.PositiveIntegerField(default=0)
    sha256 = models.CharField(max_length=64)
    data = models.BinaryField()
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    uploaded_at = models.DateTimeField(auto_now=True)


class CriticalResultCall(models.Model):
    """The phone call a lab makes for a critical value, with read-back, logged before the result can be released."""

    request = models.ForeignKey(LabRequest, on_delete=models.CASCADE, related_name="critical_calls")
    called_name = models.CharField(max_length=160, help_text="Who took the call, e.g. the nurse or the provider")
    called_number = models.CharField(max_length=30, blank=True)
    called_at = models.DateTimeField()
    read_back_confirmed = models.BooleanField(default=False)
    note = models.CharField(max_length=300, blank=True)
    called_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class LabRequestEvent(models.Model):
    """Append-only history of a request: routed, claimed, accepted, collected, released, cancelled..."""

    request = models.ForeignKey(LabRequest, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=30)
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class LabPortalNotice(models.Model):
    """An in-app notice for a partner lab (also emailed)."""

    partner = models.ForeignKey(PartnerLab, on_delete=models.CASCADE, related_name="notices")
    request = models.ForeignKey(LabRequest, null=True, blank=True, on_delete=models.CASCADE, related_name="notices")
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class LabPortalAccessLog(models.Model):
    """Data Privacy Act (RA 10173) / HIPAA: every view and action by a lab portal user."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    partner = models.ForeignKey(PartnerLab, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    request = models.ForeignKey(LabRequest, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=40)
    detail = models.JSONField(default=dict, blank=True)
    ip = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "created_at"]), models.Index(fields=["partner", "action", "created_at"])]
