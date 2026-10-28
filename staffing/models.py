import uuid
from django.conf import settings
from django.db import models
from users.models import Organization

# --- HPPD (hours per patient day) staffing support -------------------------
NURSING_ROLE_CHOICES = [
    ("rn", "RN"),
    ("lpn", "LPN"),
    ("cna", "CNA / support"),
    ("other", "Other (not counted toward HPPD)"),
]

SHIFT_PATTERN_CHOICES = [
    ("8h", "8-hour shifts (Day / Evening / Night)"),
    ("12h", "12-hour shifts (Day / Night)"),
    ("custom", "Custom hours (the unit's own shifts)"),
]

COVERAGE_MODE_CHOICES = [
    ("fixed", "Fixed minimum staff"),
    ("hppd", "Calculated from census (HPPD)"),
]


class Staff(models.Model):
    """
    A lightweight staff-roster entry for the Staffing module. Deliberately
    NOT tied to CustomUser / login accounts -- per design decision, this is
    a separate roster of staff (nurses, physicians, techs, or any other
    role a clinic schedules duty coverage for) who may or may not ever log
    in to the app themselves. An org's front-desk/admin staff maintain this
    roster (by hand or via CSV upload) purely to schedule duty coverage.

    `profession` is deliberately free text, not a fixed choice list --
    organizations schedule all kinds of roles (nurse, physician, CNA,
    tech, etc.) and shouldn't be limited to a hardcoded set just because
    this module started out with nurses/physicians in mind.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="staffing_staff",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    profession = models.CharField(
        max_length=100,
        help_text="Free-text role, e.g. Nurse, Physician, CNA, Tech -- whatever the org's roster uses.",
    )
    nursing_role = models.CharField(
        max_length=10,
        choices=NURSING_ROLE_CHOICES,
        default="other",
        help_text=(
            "Direct-care role used by the HPPD checks. Only RN, LPN and CNA "
            "count toward required hours and staff ratios; 'other' does not."
        ),
    )
    email = models.EmailField(blank=True, null=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_profile",
        help_text=(
            "Optional app login for this roster entry (role 'staff'), created "
            "via the Invite flow. Lets the staff member see the schedule in "
            "the mobile app. Null means no login."
        ),
    )
    is_active = models.BooleanField(default=True)
    reminders_enabled = models.BooleanField(
        default=True,
        help_text=(
            "Master on/off switch for this staff member's automatic SMS/"
            "email shift reminders (sent ~3 hours before a shift starts). "
            "Toggled from the Messaging column on the Roster tab."
        ),
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.profession})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


SHIFT_TYPE_CHOICES = [
    ("day", "Day"),
    ("evening", "Evening"),
    ("night", "Night"),
    ("custom", "Custom"),
]

DAY_OF_WEEK_CHOICES = [
    ("mon", "Monday"),
    ("tue", "Tuesday"),
    ("wed", "Wednesday"),
    ("thu", "Thursday"),
    ("fri", "Friday"),
    ("sat", "Saturday"),
    ("sun", "Sunday"),
]

VALID_DAY_CODES = {code for code, _label in DAY_OF_WEEK_CHOICES}


class StaffRecurringPattern(models.Model):
    """
    A recurring duty pattern for a staff member -- e.g. "every Mon/Wed/Fri,
    day shift, starting 2026-10-01, no end date". StaffShift rows are
    generated from active patterns for a rolling window (see the daily
    automation wired into RunScheduledJobsView); a single occurrence of a
    pattern can be overridden or cancelled by editing/deleting its
    generated StaffShift row without touching the pattern itself -- this
    is the "recurring + one-off override" design the user asked for.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="staffing_recurring_patterns",
    )
    staff = models.ForeignKey(
        Staff,
        on_delete=models.CASCADE,
        related_name="recurring_patterns",
    )
    unit = models.ForeignKey(
        "Unit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recurring_patterns",
        help_text="Unit this duty pattern covers. Blank = not tied to a unit.",
    )
    shift_type = models.CharField(
        max_length=20, choices=SHIFT_TYPE_CHOICES, default="day"
    )
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    days_of_week = models.JSONField(
        default=list,
        help_text="List of day codes this pattern repeats on, e.g. ['mon','wed','fri'].",
    )
    start_date = models.DateField()
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Leave blank for an ongoing/open-ended pattern.",
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        days = ", ".join(self.days_of_week or [])
        return f"{self.staff} - {self.get_shift_type_display()} ({days})"

    def applies_on(self, a_date):
        """True if this pattern covers the given calendar date."""
        if not self.is_active:
            return False
        if a_date < self.start_date:
            return False
        if self.end_date and a_date > self.end_date:
            return False
        day_code = DAY_OF_WEEK_CHOICES[a_date.weekday()][0]
        return day_code in (self.days_of_week or [])


class StaffShift(models.Model):
    """
    A single day's duty assignment for a staff member. Rows come from two
    sources: generated automatically from an active StaffRecurringPattern
    (source='recurring', recurring_pattern set), or created directly as a
    one-off assignment or override (source='manual' / 'override').
    Editing or deleting a single generated row (without touching the
    parent pattern) is how a one-off exception to a recurring schedule is
    handled.
    """

    SOURCE_CHOICES = [
        ("recurring", "Generated from recurring pattern"),
        ("manual", "Manually assigned"),
        ("override", "One-off override of a recurring occurrence"),
        ("pickup", "Picked up by the staff member"),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="staffing_shifts",
    )
    staff = models.ForeignKey(
        Staff,
        on_delete=models.CASCADE,
        related_name="shifts",
    )
    unit = models.ForeignKey(
        "Unit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shifts",
        help_text="Unit this shift is worked on. Blank = not tied to a unit.",
    )
    date = models.DateField()
    shift_type = models.CharField(
        max_length=20, choices=SHIFT_TYPE_CHOICES, default="day"
    )
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="manual")
    recurring_pattern = models.ForeignKey(
        StaffRecurringPattern,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_shifts",
    )
    is_cancelled = models.BooleanField(
        default=False,
        help_text=(
            "True marks a specific recurring occurrence as cancelled "
            "without deleting the row, so the override stays visible."
        ),
    )
    reminder_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "When the ~3-hours-before-shift SMS/email reminder was sent "
            "to this staff member. Null means not sent yet; used to make "
            "the hourly reminder job idempotent."
        ),
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "start_time"]
        unique_together = ["staff", "date", "shift_type", "recurring_pattern"]

    def __str__(self):
        return f"{self.staff} - {self.date} ({self.get_shift_type_display()})"


class ShiftCoverageRequirement(models.Model):
    """
    An admin-defined coverage obligation -- "every Mon/Wed/Fri there must be
    at least 1 night-shift staff member on duty" -- independent of which
    specific staff member(s) actually end up assigned. This is the
    "schedule type setting" configured from the Assign Schedule tab that
    the 24-hours-before understaffing alert checks against: it lets an org
    mark which shift types actually need coverage (so the alert isn't
    firing for shift types nobody is tracking), separate from an actual
    StaffShift assignment.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="staffing_coverage_requirements",
    )
    unit = models.ForeignKey(
        "Unit",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="coverage_requirements",
        help_text="Unit this requirement applies to. Blank = whole organization (existing behavior).",
    )
    mode = models.CharField(
        max_length=10,
        choices=COVERAGE_MODE_CHOICES,
        default="fixed",
        help_text=(
            "'fixed' uses min_staff_required as typed. 'hppd' calculates the "
            "requirement from the unit's census (Maryland hours + 1:15 ratio + RN)."
        ),
    )
    shift_type = models.CharField(
        max_length=20, choices=SHIFT_TYPE_CHOICES, default="day"
    )
    days_of_week = models.JSONField(
        default=list,
        help_text="List of day codes this coverage requirement applies on, e.g. ['mon','wed','fri'].",
    )
    min_staff_required = models.PositiveIntegerField(
        default=1,
        help_text="Minimum number of distinct staff that must be assigned/covering for this shift type on an applicable date.",
    )
    start_date = models.DateField()
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Leave blank for an ongoing/open-ended requirement.",
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        days = ", ".join(self.days_of_week or [])
        return f"{self.get_shift_type_display()} coverage ({days}) - min {self.min_staff_required}"

    def applies_on(self, a_date):
        """True if this coverage requirement is in force on the given calendar date."""
        if not self.is_active:
            return False
        if a_date < self.start_date:
            return False
        if self.end_date and a_date > self.end_date:
            return False
        day_code = DAY_OF_WEEK_CHOICES[a_date.weekday()][0]
        return day_code in (self.days_of_week or [])


class CoverageAlert(models.Model):
    """
    A log of understaffing alert emails already sent for a given
    (requirement, date) pair, so the hourly job never emails the admin
    twice for the same upcoming gap.
    """

    requirement = models.ForeignKey(
        ShiftCoverageRequirement,
        on_delete=models.CASCADE,
        related_name="alerts_sent",
    )
    date = models.DateField()
    staff_assigned_count = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["requirement", "date"]
        ordering = ["-sent_at"]

    def __str__(self):
        return f"Coverage alert: {self.requirement} on {self.date}"


class Unit(models.Model):
    """
    A care unit within an organization (e.g. "2 West"). Holds the census that
    drives the HPPD staffing requirement and the 8h/12h shift-pattern toggle.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="staffing_units",
    )
    name = models.CharField(max_length=100)
    custom_shifts = models.JSONField(
        default=list,
        blank=True,
        help_text="Unit's own shifts when shift_pattern is 'custom': "
        "[{key, name, start, end, break_minutes}].",
    )
    shift_pattern = models.CharField(
        max_length=10,
        choices=SHIFT_PATTERN_CHOICES,
        default="8h",
        help_text="8-hour (Day/Evening/Night) or 12-hour (Day/Night) shifts for this unit.",
    )
    bed_capacity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Beds on this unit; printed as the '/beds' part of the census on the daily staffing reports.",
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        unique_together = ["organization", "name"]

    def __str__(self):
        return self.name


class UnitCensus(models.Model):
    """
    The number of residents/patients on a unit for a given day, entered by
    hand. One row per unit per date.
    """

    unit = models.ForeignKey(
        Unit,
        on_delete=models.CASCADE,
        related_name="census_entries",
    )
    date = models.DateField()
    census = models.PositiveIntegerField(
        help_text="Occupied beds / residents on this unit for this date.",
    )
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        unique_together = ["unit", "date"]
        verbose_name_plural = "unit census entries"

    def __str__(self):
        return f"{self.unit} - {self.date}: {self.census}"


class StaffTimeOffRequest(models.Model):
    """
    A staff member's request to be off, or an emergency call-out.

    off_request : planned time off. pending -> approved | denied (or cancelled
                  by the staff member while still pending). Only an APPROVED
                  request takes the person off the schedule for coverage math;
                  a PENDING one turns affected calendar days amber.
    emergency   : "I can't make my shift" -- takes effect immediately (the
                  person is treated as out for coverage), alerts admins at once,
                  and stays `open` until an admin arranges cover (`resolved`)
                  or dismisses it (`cancelled`).
    """

    KIND_OFF_REQUEST = "off_request"
    KIND_EMERGENCY = "emergency"
    KIND_CHOICES = [
        (KIND_OFF_REQUEST, "Time-off request"),
        (KIND_EMERGENCY, "Emergency / call-out"),
    ]

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_DENIED = "denied"
    STATUS_CANCELLED = "cancelled"
    STATUS_OPEN = "open"
    STATUS_RESOLVED = "resolved"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_DENIED, "Denied"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_OPEN, "Open (needs cover)"),
        (STATUS_RESOLVED, "Resolved (cover arranged)"),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="staffing_time_off_requests",
    )
    staff = models.ForeignKey(
        Staff,
        on_delete=models.CASCADE,
        related_name="time_off_requests",
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    start_date = models.DateField()
    end_date = models.DateField()
    shift = models.ForeignKey(
        StaffShift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="time_off_requests",
        help_text="Specific shift a call-out is for. Blank = every shift in the date range.",
    )
    reason = models.TextField(blank=True, default="")
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="Who entered it: the staff member, or an admin on their behalf (phone call-out).",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    admin_note = models.TextField(blank=True, default="")
    cover_staff = models.ForeignKey(
        Staff,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="covering_requests",
        help_text="Who is covering (set when an emergency is resolved).",
    )
    alert_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the emergency alert went to admins. Null = not sent.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "start_date", "end_date"], name="staffing_to_org_dates_idx"),
            models.Index(fields=["organization", "status"], name="staffing_to_org_status_idx"),
        ]

    def __str__(self):
        return f"{self.staff} - {self.get_kind_display()} {self.start_date}..{self.end_date} ({self.status})"

    @property
    def is_emergency(self):
        return self.kind == self.KIND_EMERGENCY

    @property
    def takes_staff_out(self):
        """True when this request removes the person from coverage math."""
        if self.kind == self.KIND_EMERGENCY:
            return self.status in (self.STATUS_OPEN, self.STATUS_RESOLVED)
        return self.status == self.STATUS_APPROVED

    @property
    def is_pending_off(self):
        return self.kind == self.KIND_OFF_REQUEST and self.status == self.STATUS_PENDING


# --- Staffing rules (state standards + custom) ----------------------------
class StaffingRule(models.Model):
    """
    A coverage-compliance standard: the numbers the staffing engine applies.

    organization NULL  -> SHARED state rule (Maryland, New York, ...). Only a
                          system admin can add or edit these; every organization
                          located in that state uses the active one.
    organization set   -> CUSTOM rule owned by that organization. An org admin
                          creates it (usually by duplicating a shared rule) and
                          can select it for the organization.

    Every number except hppd_min is optional: a rule only enforces what it sets.
    Edits are logged in StaffingRuleAudit.
    """

    STATUS_ACTIVE = "active"
    STATUS_DRAFT = "draft"
    STATUS_INACTIVE = "inactive"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_DRAFT, "Draft (not applied)"),
        (STATUS_INACTIVE, "Inactive"),
    ]

    organization = models.ForeignKey(
        Organization, null=True, blank=True, on_delete=models.CASCADE,
        related_name="staffing_rules",
        help_text="Empty = shared state rule (system admins only).",
    )
    state = models.CharField(max_length=2, blank=True, default="", help_text="Two-letter state code; blank for a custom standard.")
    name = models.CharField(max_length=120)
    facility_type = models.CharField(max_length=30, default="nursing_home")

    hppd_min = models.DecimalField(max_digits=5, decimal_places=2, help_text="Total care hours per resident per day.")
    min_licensed_hppd = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Minimum RN + LPN hours per resident per day.")
    min_cna_hppd = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Minimum CNA / aide hours per resident per day.")
    max_residents_per_staff = models.PositiveSmallIntegerField(null=True, blank=True)
    min_rn_per_shift = models.PositiveSmallIntegerField(default=0)
    count_all_roles = models.BooleanField(
        default=False,
        help_text="Count every staff role (not only RN/LPN/CNA) toward this standard's hours and ratio.",
    )

    source = models.TextField(blank=True, default="", help_text="Regulation citation shown to admins.")
    notes = models.TextField(blank=True, default="")
    effective_date = models.DateField(null=True, blank=True)
    last_verified_date = models.DateField(null=True, blank=True)
    needs_verification = models.BooleanField(default=False)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    is_seed = models.BooleanField(default=False, help_text="Created by the built-in seed data.")

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["state", "name", "id"]
        indexes = [models.Index(fields=["state", "status"], name="staffing_rule_state_idx")]

    def __str__(self):
        scope = "shared" if self.organization_id is None else f"org {self.organization_id}"
        return f"{self.name} ({scope}, {self.status})"

    @property
    def is_custom(self):
        return self.organization_id is not None


class StaffingRuleAudit(models.Model):
    """Who changed which rule, when, and what changed."""

    ACTION_CHOICES = [
        ("created", "Created"),
        ("updated", "Updated"),
        ("deactivated", "Deactivated"),
        ("duplicated", "Duplicated"),
        ("verified", "Marked verified"),
        ("selected", "Selected for organization"),
    ]

    rule = models.ForeignKey(StaffingRule, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_entries")
    rule_name = models.CharField(max_length=120, blank=True, default="")
    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    changes = models.JSONField(default=dict, blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at", "-id"]

    def __str__(self):
        return f"{self.action} {self.rule_name} @ {self.changed_at:%Y-%m-%d %H:%M}"


class OrgStaffingRule(models.Model):
    """The custom (or alternative) rule an organization chose to use instead of its state's."""

    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="staffing_rule_choice")
    rule = models.ForeignKey(StaffingRule, on_delete=models.CASCADE, related_name="+")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.organization_id} -> {self.rule_id}"


class UnitStaffingRule(models.Model):
    """
    Which staffing standard applies to a unit. One row per (organization, unit),
    so a unit can never have two standards.

    An organization with NO rows uses a single standard for every unit
    (OrgStaffingRule, or its state's). Once it has rows, only the units listed
    here are checked, each against its own standard; a unit with no row has no
    standard applied.
    """

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="unit_staffing_rules")
    unit = models.ForeignKey("Unit", on_delete=models.CASCADE, related_name="staffing_rule_assignments")
    rule = models.ForeignKey(StaffingRule, on_delete=models.CASCADE, related_name="unit_assignments")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "unit"], name="staffing_unit_rule_unique")]

    def __str__(self):
        return f"unit {self.unit_id} -> rule {self.rule_id}"


# --- In-app assistant ------------------------------------------------------
class AssistantMessage(models.Model):
    """
    One question/answer exchange with the in-app staffing assistant.

    This is the support + audit log. It deliberately stores only the question,
    the answer and WHICH tools ran (with their arguments) -- never the raw data
    the tools returned (rosters, phone numbers, ...), so the log does not become
    a second copy of the staffing data.
    """

    organization = models.ForeignKey(
        Organization, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
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
        indexes = [models.Index(fields=["user", "-created_at"], name="staffing_as_user_created_idx")]

    def __str__(self):
        return f"{self.user_id} @ {self.created_at:%Y-%m-%d %H:%M}: {self.question[:40]}"


class AssistantPendingAction(models.Model):
    """
    A change the in-app assistant has PREPARED for a user but not performed.

    The model can only create these (through "propose" tools). Nothing runs
    until the same signed-in user taps Confirm in the app, which calls the
    confirm endpoint -- the model has no way to confirm. A row is single-use,
    belongs to one user, and expires after a few minutes. `params` holds only
    what the action needs (dates, ids, message text); it is purged with the
    assistant log.
    """

    STATUS_PENDING = "pending"
    STATUS_CONFIRMED = "confirmed"
    STATUS_CANCELLED = "cancelled"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Waiting for confirmation"),
        (STATUS_CONFIRMED, "Confirmed and done"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_FAILED, "Confirmed but failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    action_type = models.CharField(max_length=40)
    params = models.JSONField(default=dict, blank=True)
    summary = models.CharField(max_length=500)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING)
    target_org_id = models.PositiveIntegerField(null=True, blank=True)  # system admin acting in another org
    result_message = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    expires_at = models.DateTimeField()
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "status"], name="staffing_apa_user_status_idx")]

    def __str__(self):
        return f"{self.action_type} ({self.status}) for user {self.user_id}"


# --- Master Schedule (monthly paper-style grid) ------------------------------
# The sheet managers keep by hand: sections (FT 7AM-7PM, 7-3 GNA, ...), the
# people in each section, an HP and a Status label per person, and one code per
# day (7, 7A, 7P, 3 11, ...). It is a planning grid; it does not create
# StaffShift rows or feed coverage math.

MASTER_SCHEDULE_CODES = ["7", "7A", "7P", "7p", "3 11", "3", "11", "R", "x"]
MASTER_SCHEDULE_DEFAULT_HP = ["A", "B", "D", "E", "N", "FT", "3"]
MASTER_SCHEDULE_DEFAULT_STATUS = ["FT", "PT", "PRN", "N", "16"]
# (name, level) -- level 1 is a sub-heading (a unit inside a GNA section).
MASTER_SCHEDULE_DEFAULT_SECTIONS = [
    ("ADON", 0), ("SUPERVISORS", 0), ("UNIT MANAGERS", 0), ("MDS", 0),
    ("UNIT CLERKS", 0), ("STAFFING", 0),
    ("FT 7AM - 7PM", 0), ("PT DAYS", 0), ("AGENCY", 0),
    ("FT 7PM - 7AM", 0), ("PRN", 0), ("AGENCY", 0),
    ("FT 7-3 CMAs", 0), ("FT 3-11 CMAs", 0), ("PT CMAs", 0), ("PRNS CMA", 0),
    ("7-3 GNA", 0), ("Unit 2", 1), ("Unit 3", 1), ("Unit 4", 1), ("AGENCY", 1),
    ("3-11 GNA", 0), ("Unit 1A/1B", 1), ("Unit 2", 1), ("Unit 3", 1), ("Unit 4", 1),
    ("AGENCY", 1),
    ("11-7 CGAs", 0), ("AGENCY", 1), ("PT GNA", 0), ("PRN", 1),
]


class MasterScheduleSettings(models.Model):
    """Per-organization options for the Master Schedule tab."""

    organization = models.OneToOneField(
        Organization, on_delete=models.CASCADE, related_name="master_schedule_settings"
    )
    # Python weekday: Monday=0 ... Sunday=6. St. Mary's works Thursday-Wednesday.
    week_start = models.PositiveSmallIntegerField(default=3)
    hp_values = models.JSONField(default=list, blank=True)
    status_values = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"Master schedule settings ({self.organization_id})"


class MasterScheduleSection(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="master_schedule_sections"
    )
    name = models.CharField(max_length=100)
    level = models.PositiveSmallIntegerField(default=0)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name


class MasterScheduleRow(models.Model):
    """One person's line in a section. Blank staff = a row not yet filled in."""

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="master_schedule_rows"
    )
    section = models.ForeignKey(
        MasterScheduleSection, on_delete=models.CASCADE, related_name="rows"
    )
    staff = models.ForeignKey(
        Staff, on_delete=models.SET_NULL, null=True, blank=True, related_name="master_schedule_rows"
    )
    # Care unit this person's Create-schedule shifts go to. Blank = fall back to
    # the unit that matches the section's name (if any).
    unit = models.ForeignKey(
        "Unit", on_delete=models.SET_NULL, null=True, blank=True, related_name="master_schedule_rows"
    )
    hp = models.CharField(max_length=20, blank=True, default="")
    status = models.CharField(max_length=20, blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class MasterScheduleCell(models.Model):
    row = models.ForeignKey(MasterScheduleRow, on_delete=models.CASCADE, related_name="cells")
    date = models.DateField(db_index=True)
    code = models.CharField(max_length=10)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["row", "date"], name="master_schedule_cell_unique")
        ]


class ReportSubscription(models.Model):
    """
    A Reports-tab report emailed on a schedule (daily, weekly or monthly) as a PDF and/or CSV
    attachment. `covers` is a relative period ("previous_week"), never fixed dates, so every email
    is for the latest period. Sent by staffing.report_subscriptions.send_due_subscriptions(),
    which the hourly Staffing job calls; sends therefore go out on the hour.
    """

    FREQUENCY_CHOICES = [("once", "Once"), ("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly")]

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="staffing_report_subscriptions"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staffing_report_subscriptions",
    )
    report = models.CharField(max_length=40)
    params = models.JSONField(default=dict, blank=True)  # report filters (profession, unit, form, ...)
    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, default="weekly")
    # The calendar date of the first send. Weekly repeats on that date's weekday, monthly on its day number.
    start_date = models.DateField(null=True, blank=True)
    weekday = models.PositiveSmallIntegerField(default=0)  # weekly: 0 = Monday ... 6 = Sunday
    month_day = models.PositiveSmallIntegerField(default=1)  # monthly: 1-31, 0 = last day of the month
    send_hour = models.PositiveSmallIntegerField(default=7)  # 0-23, in `timezone`
    timezone = models.CharField(max_length=64, default="America/New_York")
    covers = models.CharField(max_length=20, default="previous_week")
    formats = models.JSONField(default=list)  # ["pdf"], ["csv"] or both
    recipients = models.JSONField(default=list)  # email addresses
    is_active = models.BooleanField(default=True)
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=10, blank=True, default="")  # sent / partial / failed
    last_detail = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["report", "id"]

    def __str__(self):
        return f"{self.report} ({self.frequency}) -> {len(self.recipients or [])} recipient(s)"


# ---------------------------------------------------------------------------
# A unit on custom hours stores its own shift keys ("u_regular_day") in shift_type;
# show the shift's name instead of the raw key everywhere get_shift_type_display() is used.
# ---------------------------------------------------------------------------
_BASE_SHIFT_LABELS = dict(SHIFT_TYPE_CHOICES)


def _shift_type_display(self):
    label = _BASE_SHIFT_LABELS.get(self.shift_type)
    if label is not None:
        return label
    unit = getattr(self, "unit", None)
    for x in getattr(unit, "custom_shifts", None) or []:
        if x.get("key") == self.shift_type:
            return x.get("name") or self.shift_type
    return self.shift_type


for _m in (StaffRecurringPattern, StaffShift, ShiftCoverageRequirement):
    _m.get_shift_type_display = _shift_type_display


class CustomReport(models.Model):
    """
    A report built in the Reports module. `source` names a curated data source in
    staffing.custom_reports; `config` holds the columns, grouping, filters, highlight, tiles and sort.
    Who can run it: only the owner ("me"), everyone allowed to use Staffing reports at the facility
    ("org"), or people with one of `audience_roles` ("roles").
    """

    AUDIENCE_CHOICES = [("me", "Only me"), ("roles", "People with a role"), ("org", "Everyone at the facility")]

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="staffing_custom_reports"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staffing_custom_reports",
    )
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=300, blank=True, default="")
    module = models.CharField(max_length=20, default="staffing")
    source = models.CharField(max_length=40)
    config = models.JSONField(default=dict, blank=True)
    audience = models.CharField(max_length=10, choices=AUDIENCE_CHOICES, default="me")
    audience_roles = models.JSONField(default=list, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self):
        return f"{self.name} ({self.source})"


class ReportAuditLog(models.Model):
    """
    Who ran a report on patient data, and when. One row per run or builder
    preview of a source that holds patient data. Report contents are never copied here, only counts.
    """

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="staffing_report_audit")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    report = models.ForeignKey(CustomReport, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_rows")
    report_name = models.CharField(max_length=120, blank=True, default="")
    source = models.CharField(max_length=40)
    action = models.CharField(max_length=10, default="run")  # run | preview
    phi_hidden = models.BooleanField(default=False)
    row_count = models.PositiveIntegerField(default=0)
    range_start = models.DateField(null=True, blank=True)
    range_end = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["organization", "-created_at"], name="staff_repaudit_org_idx")]

    def __str__(self):
        return f"{self.source} {self.action} by {self.user_id}"
