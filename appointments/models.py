from django.db import models
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from users.models import (
    Organization,
)  # Assuming Organization is defined in users/models.py


class ClinicEvent(models.Model):
    name = models.CharField(
        max_length=255
    )  # e.g., "Follow-up Visit", "Annual Checkup" - removed unique=True
    description = models.TextField(blank=True, null=True)  # Optional
    is_active = models.BooleanField(default=True)  # Optional for hiding events
    organization = models.ForeignKey(
        "users.Organization",
        on_delete=models.CASCADE,
        related_name="clinic_events",
        null=True,  # Make it nullable initially
        blank=True,
        help_text="Organization this clinic event belongs to",
    )

    class Meta:
        unique_together = [
            "name",
            "organization",
        ]  # Unique clinic event name per organization

    def __str__(self):
        return self.name


class Appointment(models.Model):
    RECURRENCE_CHOICES = [
        ("none", "None"),
        ("daily", "Daily"),
        ("weekly", "Weekly"),
        ("monthly", "Monthly"),
    ]
    STATUS_CHOICES = [
        ("scheduled", "Scheduled"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
        ("no_show", "No Show"),
        ("rescheduled", "Rescheduled"),
        ("pending", "Pending"),  # ✅ Add this
        ("in_progress", "In Progress"),  # ✅ Add this too
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="appointments",
        null=True,  # You can make it non-nullable later
        blank=True,
    )

    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="appointments"
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    appointment_datetime = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=30)
    recurrence = models.CharField(  # ✅ NEW
        max_length=10, choices=RECURRENCE_CHOICES, default="none"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="scheduled",
        help_text="Status of the appointment",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Add the provider field (ForeignKey to User model)
    provider = models.ForeignKey(
        settings.AUTH_USER_MODEL,  # Assuming doctors are stored in the same User model
        on_delete=models.SET_NULL,  # If a doctor is deleted, set provider to NULL
        null=True,  # Allow null values in case no provider is assigned initially
        blank=True,  # Allow blank values in the form
        related_name="provider_appointments",  # Reverse relation from User (doctor) to appointments
    )

    recurrence_end_date = models.DateField(null=True, blank=True)  # NEW FIELD

    # Patient arrival tracking fields
    arrived = models.BooleanField(
        default=False, help_text="Whether the patient has arrived for the appointment"
    )
    no_show = models.BooleanField(
        default=False, help_text="Whether the patient was a no-show for the appointment"
    )

    def __str__(self):
        return f"{self.title} - {self.appointment_datetime}"


class Availability(models.Model):

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="availabilities",
        null=True,
        blank=True,
    )

    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="availabilities",
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    is_blocked = models.BooleanField(default=False)
    recurrence = models.CharField(
        max_length=10,
        choices=[
            ("none", "None"),
            ("daily", "Daily"),  # ✅ Add this
            ("weekly", "Weekly"),
            ("monthly", "Monthly"),  # ✅ Add this too
        ],
        default="none",
    )
    recurrence_end_date = models.DateField(null=True, blank=True)
    block_type = models.CharField(
        max_length=32,
        choices=[
            ("Lunch", "Lunch"),
            ("Meeting", "Meeting"),
            ("Vacation", "Vacation"),
            ("On Leave", "On Leave"),
            ("Other", "Other"),
        ],
        default="Lunch",
        blank=True,
        null=True,
        help_text="Type of block for this availability (if blocked)",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        status = "Blocked" if self.is_blocked else "Available"
        return f"{status} for Dr. {self.doctor.get_full_name()} on {self.start_time}"


class EnvironmentSetting(models.Model):
    # Link to organization for per-organization settings
    organization = models.OneToOneField(
        "users.Organization",
        on_delete=models.CASCADE,
        related_name="environment_setting",
        help_text="Organization this setting belongs to",
    )
    # Store the blocked days as an array of integers [0,6]
    blocked_days = ArrayField(
        models.IntegerField(),
        default=list,
        blank=True,
        help_text="Days blocked by default, 0=Sun, ..., 6=Sat",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Environment Setting for {self.organization.name}"


class Holiday(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="holidays",
        null=True,  # Allow null for existing records during migration
        blank=True,
    )
    name = models.CharField(max_length=64)
    date = models.DateField()
    is_recognized = models.BooleanField(default=False)
    suppressed = models.BooleanField(
        default=False
    )  # Mark as suppressed instead of deleting

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name", "date"], name="unique_holiday_per_org"
            )
        ]

    def __str__(self):
        org_name = self.organization.name if self.organization else "Global"
        return f"{self.name} ({self.date}) - {org_name}"


class AutoEmail(models.Model):
    """
    Model for configuring automated emails settings.
    This determines when and how frequently automated emails are sent.
    """

    FREQUENCY_CHOICES = [
        ("daily", "Daily"),
        ("weekly", "Weekly"),
        ("bi-weekly", "Bi-weekly"),
        ("monthly", "Monthly"),
    ]

    DAY_OF_WEEK_CHOICES = [
        (0, "Sunday"),
        (1, "Monday"),
        (2, "Tuesday"),
        (3, "Wednesday"),
        (4, "Thursday"),
        (5, "Friday"),
        (6, "Saturday"),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="auto_emails",
        null=True,
        blank=True,
        help_text="Organization this auto email setting belongs to",
    )

    auto_message_frequency = models.CharField(
        max_length=20,
        choices=FREQUENCY_CHOICES,
        default="weekly",
        help_text="How often automated emails should be sent",
    )

    auto_message_day_of_week = models.IntegerField(
        choices=DAY_OF_WEEK_CHOICES,
        default=1,  # Monday
        help_text="Day of the week when automated emails should be sent",
    )

    auto_message_start_date = models.DateField(
        null=True, blank=True, help_text="When to start sending automated emails"
    )

    is_active = models.BooleanField(
        default=True, help_text="Whether automated emails are enabled"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        org_name = self.organization.name if self.organization else "Global"
        return f"Auto Email ({org_name}) - {self.auto_message_frequency} on {self.get_auto_message_day_of_week_display()}"


class ClinicalNote(models.Model):
    """
    A clinical documentation entry (nursing assessment or doctor assessment)
    written about a patient, tied to a specific appointment/registration.

    Once signed, a note is locked: it can never be edited or deleted, only
    amended via a linked addendum (see `amends`). This mirrors how real EHRs
    (including Sunrise) handle chart integrity for legal/clinical purposes.
    """

    NOTE_TYPE_CHOICES = [
        ("nursing_assessment", "Nursing Assessment"),
        ("doctor_assessment", "Doctor Assessment"),
    ]
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("signed", "Signed"),
    ]
    # Further classification of the note itself (distinct from note_type,
    # which tracks the author's clinical role). Currently only used by
    # physicians; more types can be added here as they're defined.
    DOCUMENTATION_TYPE_CHOICES = [
        ("initial_assessment", "Initial Assessment"),
        ("progress_note", "Progress Note"),
        ("admission_note", "Admission Note"),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="clinical_notes",
        null=True,
        blank=True,
        help_text="Organization this note belongs to",
    )
    appointment = models.ForeignKey(
        "appointments.Appointment",
        on_delete=models.PROTECT,
        related_name="clinical_notes",
        help_text="The visit/registration this note documents",
    )
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="clinical_notes_received",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="clinical_notes_authored",
    )
    author_role_at_signing = models.CharField(
        max_length=20,
        blank=True,
        help_text="Snapshot of the author's role at the time of writing/signing",
    )

    note_type = models.CharField(max_length=30, choices=NOTE_TYPE_CHOICES)
    documentation_type = models.CharField(
        max_length=30,
        choices=DOCUMENTATION_TYPE_CHOICES,
        blank=True,
        help_text="Further classification of the note (e.g. Initial Assessment, Progress Note)",
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="draft")

    # SOAP fields -- used by the legacy hardcoded SOAP note UI. Left as real
    # columns (not folded into structured_data) since they're already live
    # in production and reported on as-is.
    subjective = models.TextField(blank=True)
    objective = models.TextField(blank=True)
    assessment = models.TextField(blank=True)
    plan = models.TextField(blank=True)

    # --- Configurable/structured note support -----------------------------
    # A note authored against a NoteTemplate (e.g. Admission Note) stores its
    # field values here instead of the fixed SOAP columns above. Keyed by
    # NoteFieldDefinition.key. Free-form by design -- the template defines
    # the shape, not the database schema, so new note types don't need a
    # migration.
    template = models.ForeignKey(
        "appointments.NoteTemplate",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="notes",
        help_text="The structured template this note was authored against, if any",
    )
    # Snapshot of template.version at the moment this note was created.
    # Note History must always render a note against the field definitions
    # that existed at signing time -- a template edited later (renamed
    # field, changed dropdown options, removed a field) must never change
    # how an already-signed note displays. Never recompute this from the
    # live template.
    template_version = models.PositiveIntegerField(null=True, blank=True)
    # Frozen copy of the template's field definitions (same shape as
    # NoteTemplateSerializer's output: sections, labels, field types,
    # dictionary options, depends_on wiring) taken the moment this note was
    # created. Note History renders against THIS, never the live template --
    # so an admin editing the template later (via the note-builder
    # configuration UI) can never change how an already-signed note
    # displays, even if a field was renamed, retyped, or removed since.
    # Empty for notes created before this field existed; those fall back to
    # the live template in ClinicalNoteSerializer.get_template_detail.
    template_snapshot = models.JSONField(default=dict, blank=True)
    structured_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Field values for a template-driven note, keyed by field key",
    )

    # Corrections to a signed note happen by creating a new note that
    # references the original here — the original is never edited in place.
    amends = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="addenda",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    signed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_note_type_display()} for {self.patient} ({self.status})"


# Row layout for the Vital Signs flowsheet -- deliberately a plain Python
# constant, not a DB-backed template, since this is the one fixed flowsheet
# type for now. Shaped the same way the future flowsheet-builder's rows will
# be (grouped by section, each with a stable `key`, `label`, optional `unit`,
# and `field_type`) so VitalSignsFlowsheetSerializer's row_definitions output
# -- and the frontend grid that renders it -- can move to a database-backed
# equivalent later without changing how a flowsheet's `data` is shaped or
# how the grid consumes it.
VITAL_SIGNS_FLOWSHEET_SECTIONS = [
    {
        "section": "Vital Signs",
        "rows": [
            {"key": "temperature_f", "label": "Temperature", "unit": "°F", "field_type": "numeric"},
            {"key": "heart_rate", "label": "Heart Rate", "unit": "beats/min", "field_type": "numeric"},
            {"key": "resp_rate", "label": "Respiratory Rate", "unit": "breaths/min", "field_type": "numeric"},
            {"key": "spo2", "label": "SpO2", "unit": "%", "field_type": "numeric"},
            {"key": "bp_systolic", "label": "Blood Pressure - Systolic", "unit": "mmHg", "field_type": "numeric"},
            {"key": "bp_diastolic", "label": "Blood Pressure - Diastolic", "unit": "mmHg", "field_type": "numeric"},
        ],
    },
    {
        "section": "Pain Assessment",
        "rows": [
            {"key": "pain_score", "label": "Pain Score", "unit": "0-10", "field_type": "numeric"},
            {"key": "pain_location", "label": "Pain Location", "unit": None, "field_type": "text"},
            {"key": "pain_intervention", "label": "Pain Intervention", "unit": None, "field_type": "text"},
        ],
    },
    {
        "section": "Oxygen Therapy",
        "rows": [
            {"key": "o2_fio2", "label": "FiO2", "unit": "%", "field_type": "numeric"},
            {"key": "o2_flow", "label": "Flow", "unit": "L/min", "field_type": "numeric"},
            {"key": "o2_device", "label": "Device", "unit": None, "field_type": "text"},
        ],
    },
    {
        "section": "Body Measurements",
        "rows": [
            {"key": "height_in", "label": "Height", "unit": "in", "field_type": "numeric"},
            {"key": "weight_lb", "label": "Weight", "unit": "lbs", "field_type": "numeric"},
        ],
    },
]


class VitalSignsFlowsheet(models.Model):
    """
    A time-columned vital signs chart for a single visit -- mirrors a
    Sunrise-style flowsheet: rows are fixed clinical measures (grouped into
    sections), columns are points in time a reading was taken, and `data`
    holds the value at each (row, column) intersection.

    One per appointment (created on first save from the flowsheet panel,
    not automatically on appointment creation). This is the one hardcoded
    "Vital Signs" flowsheet; a future flowsheet-builder (mirroring the
    NoteTemplate/NoteFieldDefinition note-builder engine) will let admins
    define additional flowsheet types the same way NoteTemplate lets them
    define additional note types -- `columns`/`data`'s shape here is
    designed to carry over unchanged when that lands.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="vital_signs_flowsheets",
        null=True,
        blank=True,
    )
    appointment = models.OneToOneField(
        "appointments.Appointment",
        on_delete=models.CASCADE,
        related_name="vital_signs_flowsheet",
        help_text="The visit this flowsheet charts vitals for",
    )
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="vital_signs_flowsheets_received",
    )
    # Who started this flowsheet (first Save) -- shown as "Created By" in
    # Note History, alongside ClinicalNote's `author`. Nullable so it never
    # blocks the flowsheet if the creating user is later deleted.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vital_signs_flowsheets_created",
    )

    # [{ "id": "col_<uuid4hex>", "timestamp": ISO 8601, "recorded_by": user id,
    #    "recorded_by_name": str }, ...] -- one entry per time column, in the
    # order they were added (a column is never re-sorted by its timestamp,
    # since a nurse may add a late/backdated entry after later ones).
    columns = models.JSONField(default=list, blank=True)
    # { row_key: { column_id: value_string } } -- sparse; a cell with no
    # entry simply has no key, rather than an empty string.
    data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Vital Signs Flowsheet for {self.patient} (appointment {self.appointment_id})"


class Dictionary(models.Model):
    """
    A reusable reference/lookup list (e.g. "ROS findings", "allergy
    severity") that a NoteFieldDefinition of type 'radio' or 'dropdown'
    can point to. Analogous to a Sunrise data dictionary.
    """

    code = models.SlugField(
        max_length=64,
        unique=True,
        help_text="Stable machine key, e.g. 'ros_findings'",
    )
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "Dictionaries"

    def __str__(self):
        return self.name


class DictionaryItem(models.Model):
    """A single selectable option belonging to a Dictionary."""

    dictionary = models.ForeignKey(
        Dictionary, on_delete=models.CASCADE, related_name="items"
    )
    value = models.CharField(
        max_length=100, help_text="Stored value, e.g. 'penicillin'"
    )
    label = models.CharField(
        max_length=200, help_text="Display label, e.g. 'Penicillin'"
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["dictionary", "sort_order", "label"]
        unique_together = ["dictionary", "value"]

    def __str__(self):
        return f"{self.label} ({self.dictionary.code})"


class NoteTemplate(models.Model):
    """
    Defines a structured (non-SOAP) clinical note type -- e.g. "Admission
    Note" -- as an ordered set of NoteFieldDefinitions rather than a
    hardcoded React form. Analogous to a Sunrise Clinical Manager
    configuration-module document/observation-set definition.

    `version` must be incremented whenever an existing field definition is
    changed or removed (adding a new optional field at the end is usually
    safe without a version bump, but bump it if in doubt). Notes store the
    version they were created against in ClinicalNote.template_version so
    that editing a template never changes how already-signed notes render.
    """

    code = models.SlugField(
        max_length=64,
        unique=True,
        help_text="Stable machine key, matches ClinicalNote.documentation_type, e.g. 'admission_note'",
    )
    name = models.CharField(max_length=128, help_text="Display name, e.g. 'Admission Note'")
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="note_templates",
        null=True,
        blank=True,
        help_text="Leave blank for a template available to all organizations",
    )
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} (v{self.version})"


class NoteFieldDefinition(models.Model):
    """
    A single configurable field within a NoteTemplate -- the equivalent of
    a Sunrise observation item. `field_type` decides how the frontend
    renders it and, for 'radio'/'dropdown', `dictionary` supplies the
    selectable options.
    """

    FIELD_TYPE_CHOICES = [
        ("text", "Single-line Text"),
        ("textarea", "Multi-line Text"),
        ("radio", "Radio Button (dictionary)"),
        ("dropdown", "Dropdown (dictionary)"),
        ("multiselect", "Multi-select Checklist (dictionary)"),
        ("checkbox", "Checkbox (yes/no)"),
        ("numeric", "Numeric"),
        ("date", "Date"),
    ]

    template = models.ForeignKey(
        NoteTemplate, on_delete=models.CASCADE, related_name="fields"
    )
    # Groups fields into a top-level tab in the rendered form -- one level
    # above section_label. Blank means "no tab" (the default, single-page
    # layout used by every template before this existed): the frontend only
    # shows a tab bar once a template actually uses more than one distinct
    # tab_label, so adding this field never changes how an existing template
    # renders until an admin opts a field into a named tab. Meant for
    # templates that grow long (e.g. Review of Systems' 15 body systems) --
    # split them across tabs like "History", "Review of Systems", "Vitals &
    # Exam" instead of one long scroll.
    tab_label = models.CharField(max_length=128, blank=True)
    section_label = models.CharField(
        max_length=128,
        blank=True,
        help_text="Groups fields under a heading within a tab, e.g. 'History'",
    )
    key = models.SlugField(
        max_length=64,
        help_text="Stable key this field's value is stored under in structured_data",
    )
    label = models.CharField(max_length=200)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPE_CHOICES)
    dictionary = models.ForeignKey(
        Dictionary,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Required when field_type is 'radio' or 'dropdown'",
    )
    required = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    help_text = models.CharField(max_length=255, blank=True)

    # --- Conditional visibility ---------------------------------------
    # This field is only rendered/collected once `depends_on`'s current
    # value (an array for 'multiselect', a scalar otherwise) contains/
    # equals `depends_on_value`. Used for e.g. a Review-of-Systems body
    # system's "negative findings" checklist, which only appears once its
    # own status toggle has "negative_for" checked. Null `depends_on` means
    # always visible.
    depends_on = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="dependents",
        help_text="Only show this field when depends_on's value contains depends_on_value",
    )
    depends_on_value = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["template", "sort_order"]
        unique_together = ["template", "key"]

    def __str__(self):
        return f"{self.template.code}.{self.key}"
