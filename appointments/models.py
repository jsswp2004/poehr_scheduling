from django.db import models
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from users.models import (
    Organization,
)  # Assuming Organization is defined in users/models.py
from poehr_scheduling_backend.tenancy import TenantScopedManager


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

    # Where the appointment is: a clinic or unit from the Location Manager.
    unit = models.ForeignKey(
        "Unit", on_delete=models.SET_NULL, null=True, blank=True, related_name="appointments"
    )

    # Patient arrival tracking fields
    arrived = models.BooleanField(
        default=False, help_text="Whether the patient has arrived for the appointment"
    )
    no_show = models.BooleanField(
        default=False, help_text="Whether the patient was a no-show for the appointment"
    )

    # Tenant isolation (see poehr_scheduling_backend/tenancy.py):
    # `objects` is scoped to the current request's organization by default
    # and returns nothing outside a scoped web request. `all_objects` is the
    # plain, unscoped manager for code that legitimately needs explicit
    # cross-organization access (system_admin views, cron.py, management
    # commands) -- audited and converted to use it where needed.
    objects = TenantScopedManager()
    all_objects = models.Manager()

    class Meta:
        # Reverse relations (organization.appointments, patient.appointments,
        # doctor.provider_appointments) should behave exactly as before --
        # tenant scoping only guards the model's own `.objects` entry point.
        base_manager_name = "all_objects"

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


class AutoSMS(models.Model):
    """
    Model for configuring automated SMS (text message) reminder settings.

    This is intentionally a fully separate model/table from AutoEmail --
    email and SMS reminders each get their own independent "Enabled"
    toggle, frequency, day of week, and start date, so turning one
    channel on/off (or changing its schedule) never affects the other.
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
        related_name="auto_sms_settings",
        null=True,
        blank=True,
        help_text="Organization this auto SMS setting belongs to",
    )

    auto_message_frequency = models.CharField(
        max_length=20,
        choices=FREQUENCY_CHOICES,
        default="weekly",
        help_text="How often automated SMS reminders should be sent",
    )

    auto_message_day_of_week = models.IntegerField(
        choices=DAY_OF_WEEK_CHOICES,
        default=1,  # Monday
        help_text="Day of the week when automated SMS reminders should be sent",
    )

    auto_message_start_date = models.DateField(
        null=True, blank=True, help_text="When to start sending automated SMS reminders"
    )

    is_active = models.BooleanField(
        default=True, help_text="Whether automated SMS reminders are enabled"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        org_name = self.organization.name if self.organization else "Global"
        return f"Auto SMS ({org_name}) - {self.auto_message_frequency} on {self.get_auto_message_day_of_week_display()}"


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
    # Built-in documentation types. This is no longer an exhaustive list:
    # documentation_type may also be the `code` of any active NoteTemplate
    # (e.g. one uploaded through the Note Builder), so it is deliberately not
    # enforced as `choices` on the field -- ClinicalNoteSerializer validates
    # it instead (a legacy value below, or an active template code).
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
        max_length=64,
        blank=True,
        help_text=(
            "Further classification of the note: a built-in type (e.g. initial_assessment, "
            "progress_note) or the code of a NoteTemplate (e.g. admission_note)"
        ),
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
    A time-columned flowsheet instance for a single visit -- mirrors a
    Sunrise-style flowsheet: rows are the clinical measures defined by this
    instance's `template` (grouped into sections), columns are points in
    time a reading was taken, and `data` holds the value at each (row,
    column) intersection.

    Despite the name (kept for backward compatibility -- this model
    predates the flowsheet-builder), this is now the generic flowsheet
    instance model for ANY flowsheet type: `template` (a FlowsheetTemplate,
    see below) says which one. The "Vital Signs" flowsheet that used to be
    hardcoded here is now itself just a seeded FlowsheetTemplate.

    A visit can have at most one instance per template (see
    Meta.unique_together) but, unlike before the flowsheet-builder, can now
    have several flowsheets of different types at once -- so `appointment`
    is a plain ForeignKey rather than the OneToOneField it used to be.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="vital_signs_flowsheets",
        null=True,
        blank=True,
    )
    template = models.ForeignKey(
        "FlowsheetTemplate",
        on_delete=models.PROTECT,
        related_name="instances",
        help_text="Which flowsheet type (row/section layout) this instance charts",
    )
    appointment = models.ForeignKey(
        "appointments.Appointment",
        on_delete=models.CASCADE,
        related_name="vital_signs_flowsheets",
        help_text="The visit this flowsheet charts readings for",
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
        unique_together = ["appointment", "template"]

    def __str__(self):
        return f"{self.template.name if self.template_id else 'Vital Signs'} Flowsheet for {self.patient} (appointment {self.appointment_id})"


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
    # "note" templates are clinical note types (they appear in the
    # Documentation Type dropdown). "order_detail" templates are the
    # question forms attached to an Orderable (dose, specimen, laterality...)
    # -- built in the same Note Builder, but never offered as a note type.
    KIND_CHOICES = [
        ("note", "Clinical note"),
        ("order_detail", "Order detail form"),
    ]
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default="note")
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
        ("calculated", "Calculated (total / result)"),
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
    # Only used when field_type is 'calculated': how the value is worked out
    # from other fields (sum / average / min / max / formula), plus optional
    # interpretation ranges and cautions. Format and rules:
    # appointments/calculations.py. Empty for every other field type.
    calc = models.JSONField(default=dict, blank=True)

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


class FlowsheetTemplate(models.Model):
    """
    Defines a flowsheet type -- e.g. "Vital Signs" -- as an ordered set of
    FlowsheetRowDefinitions rather than a hardcoded row layout. Mirrors
    NoteTemplate exactly, one level down: a VitalSignsFlowsheet instance is
    to a FlowsheetTemplate what a ClinicalNote is to a NoteTemplate.

    `version` is bumped whenever a row is added, removed, retyped, or
    re-pointed at a different dictionary (see FlowsheetTemplateAdminSerializer)
    -- unlike NoteTemplate, no flowsheet instance snapshots its template, so
    this is informational only for now (there's nothing yet that would need
    to keep rendering an old version), but it's kept for parity and in case
    that changes later.
    """

    code = models.SlugField(
        max_length=64,
        unique=True,
        help_text="Stable machine key, e.g. 'vital_signs'",
    )
    name = models.CharField(max_length=128, help_text="Display name, e.g. 'Vital Sign Flowsheet'")
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="flowsheet_templates",
        null=True,
        blank=True,
        help_text="Leave blank for a template available to all organizations",
    )
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(
        default=0, help_text="Controls this type's position in the Flowsheet dropdown"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return f"{self.name} (v{self.version})"


class FlowsheetRowDefinition(models.Model):
    """
    A single configurable row within a FlowsheetTemplate -- the equivalent
    of a Sunrise flowsheet chart item (e.g. "Heart Rate"). `field_type`
    decides how the frontend renders each cell in that row, and for
    'dropdown', `dictionary` supplies the selectable options (the same
    Dictionary model NoteFieldDefinition uses).
    """

    FIELD_TYPE_CHOICES = [
        ("numeric", "Numeric"),
        ("text", "Text"),
        ("dropdown", "Dropdown (dictionary)"),
        ("calculated", "Calculated (total / result)"),
    ]

    template = models.ForeignKey(
        FlowsheetTemplate, on_delete=models.CASCADE, related_name="rows"
    )
    section_label = models.CharField(
        max_length=128,
        help_text="Groups rows under a section header, e.g. 'Vital Signs'",
    )
    key = models.SlugField(
        max_length=64,
        help_text="Stable key this row's values are stored under in a flowsheet instance's data blob",
    )
    label = models.CharField(max_length=200)
    unit = models.CharField(max_length=32, blank=True)
    field_type = models.CharField(
        max_length=20, choices=FIELD_TYPE_CHOICES, default="numeric"
    )
    dictionary = models.ForeignKey(
        Dictionary,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Required when field_type is 'dropdown'",
    )
    sort_order = models.PositiveIntegerField(default=0)
    # Only used when field_type is 'calculated' -- see NoteFieldDefinition.calc.
    calc = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["template", "sort_order"]
        unique_together = ["template", "key"]

    def __str__(self):
        return f"{self.template.code}.{self.key}"


# ---------------------------------------------------------------------------
# Orders module
#
# Catalog:  Orderable (what can be ordered) and OrderSet/OrderSetItem
#           (named bundles). Configured by admins.
# Patient:  Order (one placed order) and OrderEvent (append-only audit log).
#
# An Order follows the same rule as ClinicalNote: editable only while draft;
# once signed it is locked, and a change is made by discontinuing it and
# placing a replacement. Everything a signed order needs to display later is
# FROZEN onto the order itself (name, codes, detail-form snapshot), so
# editing the catalog afterwards never changes an existing order.
#
# Interface readiness: every order has a stable placer_order_number, an
# optional filler_order_number, an interface_status, and a result store, and
# every status change is logged with its source ("user" / "interface" /
# "system") -- so an HL7/FHIR engine can later send orders out and post
# status/results back without schema changes. Statuses and codes line up
# with HL7 ORM/ORU order control and OBR-4 universal service id.
# ---------------------------------------------------------------------------

ORDER_PRIORITY_CHOICES = [
    ("routine", "Routine"),
    ("urgent", "Urgent"),
    ("stat", "STAT"),
]


class Orderable(models.Model):
    """One thing that can be ordered (a lab test, an imaging study, ...)."""

    CATEGORY_CHOICES = [
        ("laboratory", "Laboratory"),
        ("imaging", "Imaging"),
        ("procedure", "Procedure"),
        ("referral", "Referral"),
        ("nursing", "Nursing"),
        ("medication", "Medication"),
        ("other", "Other"),
    ]
    CODE_SYSTEM_CHOICES = [
        ("local", "Local"),
        ("loinc", "LOINC"),
        ("hcpcs", "HCPCS"),
        ("icd10pcs", "ICD-10-PCS"),
        ("snomed", "SNOMED CT"),
        ("rxnorm", "RxNorm"),
        ("cpt", "CPT (entered by the clinic)"),
    ]

    code = models.SlugField(max_length=64, unique=True, help_text="Stable machine key, e.g. 'cbc_with_diff'")
    name = models.CharField(max_length=255, help_text="Display name, e.g. 'CBC with differential'")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="laboratory")
    code_system = models.CharField(max_length=20, choices=CODE_SYSTEM_CHOICES, default="local")
    external_code = models.CharField(
        max_length=64,
        blank=True,
        help_text="Code in code_system (e.g. the LOINC code). Copied onto each order, never looked up live.",
    )
    description = models.TextField(blank=True)
    default_priority = models.CharField(max_length=10, choices=ORDER_PRIORITY_CHOICES, default="routine")
    requires_cosign = models.BooleanField(
        default=False,
        help_text="Always needs a physician cosign, whoever places it",
    )
    detail_template = models.ForeignKey(
        "appointments.NoteTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orderables",
        help_text="Optional question form (a NoteTemplate of kind 'order_detail') shown when ordering",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="orderables",
        null=True,
        blank=True,
        help_text="Leave blank for an orderable available to all organizations",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class OrderSet(models.Model):
    """A named bundle of orderables placed together (e.g. 'Admission labs')."""

    code = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="order_sets",
        null=True,
        blank=True,
        help_text="Leave blank for an order set available to all organizations",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class OrderSetItem(models.Model):
    order_set = models.ForeignKey(OrderSet, on_delete=models.CASCADE, related_name="items")
    orderable = models.ForeignKey(Orderable, on_delete=models.PROTECT, related_name="order_set_items")
    sort_order = models.PositiveIntegerField(default=0)
    default_priority = models.CharField(
        max_length=10, choices=ORDER_PRIORITY_CHOICES, blank=True,
        help_text="Leave blank to use the orderable's default priority",
    )
    default_detail = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["order_set", "sort_order"]
        unique_together = ["order_set", "orderable"]


class Order(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("pending_cosign", "Pending cosign"),
        ("active", "Active"),
        ("in_progress", "In progress"),
        ("completed", "Completed"),
        ("discontinued", "Discontinued"),
    ]
    INTERFACE_STATUS_CHOICES = [
        ("not_sent", "Not sent"),
        ("queued", "Queued"),
        ("sent", "Sent"),
        ("acknowledged", "Acknowledged"),
        ("error", "Error"),
    ]

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="orders", null=True, blank=True
    )
    appointment = models.ForeignKey(
        "appointments.Appointment",
        on_delete=models.PROTECT,
        related_name="orders",
        help_text="The visit/registration this order was placed during",
    )
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders_received"
    )
    ordering_provider = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders_placed"
    )
    orderable = models.ForeignKey(Orderable, on_delete=models.PROTECT, related_name="orders")

    # --- Frozen copy of the orderable (never recomputed from the catalog once signed)
    orderable_name = models.CharField(max_length=255)
    orderable_category = models.CharField(max_length=20)
    code_system = models.CharField(max_length=20, blank=True)
    external_code = models.CharField(max_length=64, blank=True)
    detail_template = models.ForeignKey(
        "appointments.NoteTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )
    detail_template_version = models.PositiveIntegerField(null=True, blank=True)
    detail_template_snapshot = models.JSONField(default=dict, blank=True)

    # --- What was ordered
    detail = models.JSONField(
        default=dict, blank=True, help_text="Answers to the detail form, keyed by field key"
    )
    priority = models.CharField(max_length=10, choices=ORDER_PRIORITY_CHOICES, default="routine")
    indication = models.TextField(blank=True, help_text="Reason for the order")
    diagnosis_codes = models.JSONField(
        default=list, blank=True, help_text="[{'code': 'I10', 'description': '...'}]"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    order_set = models.ForeignKey(
        OrderSet, on_delete=models.SET_NULL, null=True, blank=True, related_name="orders"
    )
    clinical_note = models.ForeignKey(
        "appointments.ClinicalNote",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
        help_text="The note this order was placed from, if any",
    )
    # A signed order is never edited; it is discontinued and replaced.
    replaces = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="replaced_by"
    )

    # --- Signing / cosign
    cosign_required = models.BooleanField(default=False)
    signed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="orders_signed"
    )
    signed_at = models.DateTimeField(null=True, blank=True)
    cosigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="orders_cosigned"
    )
    cosigned_at = models.DateTimeField(null=True, blank=True)

    # --- Completion / results
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="orders_completed"
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    result_text = models.TextField(blank=True)
    result_data = models.JSONField(default=dict, blank=True)

    # --- Discontinuation
    discontinued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="orders_discontinued"
    )
    discontinued_at = models.DateTimeField(null=True, blank=True)
    discontinue_reason = models.TextField(blank=True)

    # --- Interface readiness (HL7 ORM/ORU or FHIR ServiceRequest later)
    placer_order_number = models.CharField(max_length=32, unique=True, null=True, blank=True)
    filler_order_number = models.CharField(max_length=64, blank=True)
    interface_status = models.CharField(max_length=20, choices=INTERFACE_STATUS_CHOICES, default="not_sent")
    interface_message = models.TextField(blank=True)
    interface_updated_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "patient"]),
            models.Index(fields=["status", "interface_status"]),
        ]

    def __str__(self):
        return f"{self.orderable_name} for {self.patient} ({self.status})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.placer_order_number:
            self.placer_order_number = f"ORD-{self.pk:08d}"
            type(self).objects.filter(pk=self.pk).update(placer_order_number=self.placer_order_number)


class OrderEvent(models.Model):
    """Append-only audit log of everything that happens to an order."""

    SOURCE_CHOICES = [
        ("user", "User"),
        ("interface", "Interface"),
        ("system", "System"),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=30)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="order_events"
    )
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="user")
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


# ---------------------------------------------------------------------------
# Lab results
# ---------------------------------------------------------------------------


class LabReport(models.Model):
    """
    One lab result report for a patient: a panel or a single test, with one
    or more result lines (LabResultItem). A report is entered by hand today;
    the same shape is what a Quest/Labcorp interface (HL7 ORU or FHIR
    DiagnosticReport) fills in later, which is why it can exist without an
    order and why `source` records where it came from.

    Reports are never deleted: a wrong one is marked "entered in error", and
    changing a reviewed report puts it back in the unreviewed pile.
    """

    SOURCE_CHOICES = [
        ("manual", "Entered by hand"),
        ("scan", "Scanned document"),
        ("interface", "Lab interface"),
    ]
    STATUS_CHOICES = [
        ("preliminary", "Preliminary"),
        ("final", "Final"),
        ("corrected", "Corrected"),
        ("entered_in_error", "Entered in error"),
    ]
    REVIEW_CHOICES = [
        ("unreviewed", "Not yet reviewed"),
        ("reviewed", "Reviewed"),
    ]

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="lab_reports", null=True, blank=True
    )
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lab_reports"
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="lab_reports",
        help_text="The order this answers, if known",
    )
    title = models.CharField(max_length=255, help_text="Panel or test name, e.g. Basic metabolic panel")
    source = models.CharField(max_length=12, choices=SOURCE_CHOICES, default="manual")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="final")
    performing_lab = models.CharField(max_length=120, blank=True)
    accession_number = models.CharField(max_length=64, blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)
    resulted_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True)

    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="lab_reports_entered"
    )

    # Review: any clinical user with the review right may acknowledge a report.
    review_status = models.CharField(max_length=12, choices=REVIEW_CHOICES, default="unreviewed")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="lab_reports_reviewed"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_comment = models.TextField(blank=True)

    error_reason = models.TextField(blank=True)

    # A scanned document (PDF / JPEG / PNG). Only the facts about the file live
    # here; the bytes are in LabReportFileData so listing reports never loads them.
    file_name = models.CharField(max_length=150, blank=True)
    file_content_type = models.CharField(max_length=50, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    file_sha256 = models.CharField(max_length=64, blank=True, db_index=True)

    # Set when the report arrived through a lab interface (see LabInboundMessage).
    inbound_message = models.ForeignKey(
        "appointments.LabInboundMessage",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reports",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-resulted_at", "-created_at"]
        indexes = [
            models.Index(fields=["organization", "patient"]),
            models.Index(fields=["organization", "review_status"]),
        ]

    def __str__(self):
        return f"{self.title} for {self.patient} ({self.status})"


class LabResultItem(models.Model):
    """One result line of a report (one analyte): value, units, reference range, flag."""

    FLAG_CHOICES = [
        ("", "Normal / not flagged"),
        ("L", "Low"),
        ("H", "High"),
        ("LL", "Critical low"),
        ("HH", "Critical high"),
        ("A", "Abnormal"),
    ]

    report = models.ForeignKey(LabReport, on_delete=models.CASCADE, related_name="items")
    sort_order = models.PositiveIntegerField(default=0)
    test_name = models.CharField(max_length=255)
    loinc_code = models.CharField(max_length=20, blank=True)
    value = models.CharField(max_length=255, help_text="As reported, e.g. 5.4 or Negative")
    value_numeric = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    units = models.CharField(max_length=50, blank=True)
    reference_range = models.CharField(max_length=100, blank=True)
    ref_low = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    ref_high = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    abnormal_flag = models.CharField(max_length=2, choices=FLAG_CHOICES, blank=True, default="")
    comment = models.TextField(blank=True)

    class Meta:
        ordering = ["report", "sort_order", "id"]


class LabReportEvent(models.Model):
    """Append-only audit trail for a lab report: entered, changed, reviewed, marked in error."""

    SOURCE_CHOICES = [
        ("user", "User"),
        ("interface", "Interface"),
        ("system", "System"),
    ]

    report = models.ForeignKey(LabReport, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=30)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="lab_report_events"
    )
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="user")
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class LabReportFileData(models.Model):
    """The bytes of a scanned lab document. Kept in the database (durable and backed up
    with everything else) rather than on Render's disk, which is wiped on every deploy."""

    report = models.OneToOneField(LabReport, on_delete=models.CASCADE, related_name="file_data")
    data = models.BinaryField()


class LabInterfaceConnection(models.Model):
    """
    One lab's electronic feed into one organization (e.g. Quest -> Clinic A). The
    interface engine proves who it is with a secret key sent in the X-Interface-Key
    header; only a hash of the key is stored. Created from the command line
    (manage.py lab_connection), because it is part of setting up a paid add-on.
    """

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="lab_connections")
    name = models.CharField(max_length=100, help_text="Label for staff, e.g. Quest HL7 feed")
    lab_name = models.CharField(max_length=120, blank=True, help_text="Shown on results, e.g. Quest Diagnostics")
    key_hash = models.CharField(max_length=64, unique=True)
    key_prefix = models.CharField(max_length=12, blank=True)
    is_active = models.BooleanField(default=True)
    send_orders = models.BooleanField(
        default=False,
        help_text="Also send this clinic's lab orders to this lab. At most one connection per clinic.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.organization})"


class LabInboundMessage(models.Model):
    """
    Every message a lab sent us, kept as received. This is the audit trail, the
    guard against processing the same message twice (control id), and the queue
    of results that could not be matched to a patient and need a person.
    """

    FORMAT_CHOICES = [("hl7", "HL7 v2"), ("fhir", "FHIR")]
    STATUS_CHOICES = [
        ("processed", "Filed"),
        ("unmatched", "Needs a patient"),
        ("assigned", "Assigned by staff"),
        ("dismissed", "Dismissed by staff"),
        ("rejected", "Rejected"),
        ("ignored", "Nothing to file"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="lab_inbound_messages")
    connection = models.ForeignKey(LabInterfaceConnection, on_delete=models.CASCADE, related_name="messages")
    message_format = models.CharField(max_length=4, choices=FORMAT_CHOICES)
    control_id = models.CharField(max_length=100)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    detail = models.TextField(blank=True, help_text="Why it was not filed, or what was done")
    patient_hint = models.CharField(max_length=255, blank=True, help_text="Name / DOB / MRN as the lab sent them")
    raw = models.TextField()
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="lab_messages_resolved"
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-received_at", "-id"]
        unique_together = [("connection", "control_id")]
        indexes = [models.Index(fields=["organization", "status"])]


class LabOutboundMessage(models.Model):
    """
    One order (or one cancellation) waiting for, or already given to, a lab's
    interface engine. The engine polls for these and confirms each one; until it
    does, the message is offered again, so nothing is lost if a delivery fails.
    """

    ACTION_CHOICES = [("NW", "New order"), ("CA", "Cancel order")]
    STATUS_CHOICES = [
        ("pending", "Waiting to be picked up"),
        ("delivered", "Picked up, not yet confirmed"),
        ("acknowledged", "Accepted by the lab"),
        ("rejected", "Rejected by the lab"),
        ("cancelled", "Withdrawn before it was sent"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="lab_outbound_messages")
    connection = models.ForeignKey(LabInterfaceConnection, on_delete=models.CASCADE, related_name="outbound_messages")
    order = models.ForeignKey("appointments.Order", on_delete=models.PROTECT, related_name="lab_outbound_messages")
    action = models.CharField(max_length=2, choices=ACTION_CHOICES)
    control_id = models.CharField(max_length=40, unique=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="pending")
    last_body = models.TextField(blank=True, help_text="The message as last handed over")
    detail = models.TextField(blank=True)
    delivery_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]
        unique_together = [("order", "action")]
        indexes = [models.Index(fields=["connection", "status"])]


# ---------------------------------------------------------------------------
# Patient chart header: allergies, a per-clinic header layout, and fields a
# clinic defines itself (code status, isolation, ...).
# ---------------------------------------------------------------------------


class PatientAllergy(models.Model):
    """One allergy on a patient's chart. Inactive rows are kept as history."""

    SEVERITY_CHOICES = [("mild", "Mild"), ("moderate", "Moderate"), ("severe", "Severe")]
    STATUS_CHOICES = [("active", "Active"), ("inactive", "Inactive")]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="patient_allergies", null=True, blank=True)
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="allergy_records")
    substance = models.CharField(max_length=200)
    reaction = models.CharField(max_length=200, blank=True)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    entered_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "substance", "id"]  # active first ("active" sorts before "inactive")

    def __str__(self):
        return f"{self.substance} ({self.patient_id})"


class PatientAllergyStatus(models.Model):
    """'No known allergies' is a positive statement, different from nothing recorded."""

    patient = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="allergy_status")
    no_known_allergies = models.BooleanField(default=False)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)


class PatientHeaderConfig(models.Model):
    """
    Which items a clinic's patient header shows, and in what order. `items` is an
    ordered list: [{"key": "mrn", "visible": true}, ...]. Custom fields use the key
    "custom:<field key>". A clinic with no row uses the built-in default.
    """

    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="patient_header_config")
    items = models.JSONField(default=list)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)


class HeaderFieldDefinition(models.Model):
    """An extra header item a clinic defines itself, e.g. 'Code status' or 'Isolation'."""

    TYPE_CHOICES = [("text", "Text"), ("yes_no", "Yes / No"), ("date", "Date")]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="header_field_definitions")
    key = models.SlugField(max_length=50)
    label = models.CharField(max_length=60)
    field_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="text")
    alert = models.BooleanField(default=False, help_text="Show the value in red when it is filled in")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("organization", "key")]
        ordering = ["label", "id"]

    def __str__(self):
        return f"{self.label} ({self.organization_id})"


class PatientHeaderValue(models.Model):
    """A patient's value for one clinic-defined header field."""

    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="header_values")
    definition = models.ForeignKey(HeaderFieldDefinition, on_delete=models.CASCADE, related_name="values")
    value = models.CharField(max_length=300, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("patient", "definition")]


class ChartTabLayout(models.Model):
    """
    Which chart tabs (Patient List, Orders, Results, ...) show on the Patients page for one
    module (Ambulatory, Emergency, Acute), in what order, and which one opens first.

    A row with no user is the clinic's default. A row with a user is that person's own
    arrangement, which can only reorder and hide what the clinic default makes available.
    `items` is an ordered list: [{"key": "orders", "visible": true}, ...].
    """

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="chart_tab_layouts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="chart_tab_layouts")
    care_setting = models.CharField(max_length=20)
    items = models.JSONField(default=list)
    default_tab = models.CharField(max_length=30, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "care_setting"], condition=models.Q(user__isnull=True), name="uniq_chart_tabs_org_default"),
            models.UniqueConstraint(fields=["user", "care_setting"], condition=models.Q(user__isnull=False), name="uniq_chart_tabs_user"),
        ]


# ---------------------------------------------------------------------------
# Locations: Location (hospital or clinic) > Unit > Room > Bed
# Built in the Location Manager. Registration (the visit's place) and Scheduling
# (the clinic or unit an appointment is at) both point at these, so every visit
# and appointment is tied to a real place instead of free text.
# ---------------------------------------------------------------------------


class Facility(models.Model):
    """A hospital or clinic: the top of the location tree."""

    KIND_CHOICES = [("hospital", "Hospital"), ("clinic", "Clinic"), ("other", "Other")]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="facilities")
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=20, blank=True)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="hospital")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]
        unique_together = [("organization", "name")]
        verbose_name_plural = "facilities"

    def __str__(self):
        return self.name


class Unit(models.Model):
    """A unit or clinic area inside a facility. The care type lives here: a hospital can have an
    Emergency unit, Inpatient units and Outpatient clinics under one roof."""

    CARE_TYPE_CHOICES = [("outpatient", "Outpatient"), ("inpatient", "Inpatient"), ("emergency", "Emergency")]
    # what the Patients page's care-setting sidebar calls each type
    CARE_SETTING_FOR_TYPE = {"outpatient": "ambulatory", "inpatient": "acute", "emergency": "emergency"}

    facility = models.ForeignKey(Facility, on_delete=models.CASCADE, related_name="units")
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=20, blank=True)
    care_type = models.CharField(max_length=12, choices=CARE_TYPE_CHOICES, default="outpatient")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name", "id"]
        unique_together = [("facility", "name")]

    @property
    def care_setting(self):
        return self.CARE_SETTING_FOR_TYPE.get(self.care_type, "ambulatory")

    def __str__(self):
        return f"{self.facility.name} - {self.name}"


class Room(models.Model):
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="rooms")
    name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name", "id"]
        unique_together = [("unit", "name")]

    def __str__(self):
        return f"{self.unit} - {self.name}"


class Bed(models.Model):
    """A bed. Whether it is occupied comes from who is admitted to it; `hold` is a manual block."""

    HOLD_CHOICES = [("", "None"), ("blocked", "Blocked"), ("cleaning", "Cleaning")]

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="beds")
    name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)
    hold = models.CharField(max_length=10, choices=HOLD_CHOICES, blank=True, default="")
    hold_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["name", "id"]
        unique_together = [("room", "name")]

    def __str__(self):
        return f"{self.room} - {self.name}"
