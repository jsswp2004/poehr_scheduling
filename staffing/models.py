from django.db import models
from users.models import Organization


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
    email = models.EmailField(blank=True, null=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
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
