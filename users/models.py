from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator
from django.db import models
from django.utils import timezone

from .us_states import US_STATE_CHOICES


class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ("patient", "Patient"),
        ("doctor", "Doctor"),
        ("nurse", "Nurse"),
        ("receptionist", "Receptionist"),
        ("admin", "Admin"),
        ("registrar", "Registrar"),
        ("none", "None"),  # For non-patients, use 'None' or leave blank
        ("system_admin", "System Admin"),  # For superusers or system admins
        ("staff", "Staff"),  # Staffing-module roster staff with an app login (My Shifts)
    )
    role = models.CharField(
        max_length=20, choices=ROLE_CHOICES, default="none"
    )  # 🔗 Link user to organization
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="users",
    )
    # Which hospitals or clinics this person works at. Empty means no restriction (they see every
    # facility of the organization); once set, their patient lists, bed board and unit filters show
    # only these. System admins are never restricted. See users/facility_scope.py.
    facilities = models.ManyToManyField(
        "appointments.Facility",
        blank=True,
        related_name="assigned_users",
        help_text="Facilities this user works at. Leave empty for no restriction.",
    )

    provider = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patients",
    )
    # Labs identify the ordering provider by NPI on electronic orders.
    npi = models.CharField(max_length=10, blank=True, help_text="National Provider Identifier (providers only)")

    profile_picture = models.ImageField(
        upload_to="profile_pics/", null=True, blank=True
    )
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    registered = models.BooleanField(
        default=False, help_text="Indicates if the user has completed registration"
    )

    # SMS Consent Management
    sms_consent = models.BooleanField(
        default=False, help_text="User has consented to receive SMS notifications"
    )
    sms_consent_date = models.DateTimeField(
        null=True, blank=True, help_text="When the user gave SMS consent"
    )
    sms_opt_out = models.BooleanField(
        default=False, help_text="User has opted out of SMS notifications"
    )
    sms_opt_out_date = models.DateTimeField(
        null=True, blank=True, help_text="When the user opted out of SMS"
    )
    sms_opt_out_method = models.CharField(
        max_length=20,
        choices=[
            ("STOP", "STOP keyword"),
            ("UNSUBSCRIBE", "UNSUBSCRIBE keyword"),
            ("MANUAL", "Manual opt-out"),
            ("ADMIN", "Admin action"),
        ],
        null=True,
        blank=True,
        help_text="How the user opted out of SMS",
    )

    # Subscription and Trial Management
    stripe_customer_id = models.CharField(
        max_length=255, null=True, blank=True, help_text="Stripe customer ID"
    )
    subscription_status = models.CharField(
        max_length=50,
        default="trial",
        choices=[
            ("trial", "Trial"),
            ("active", "Active"),
            ("past_due", "Past Due"),
            ("canceled", "Canceled"),
            ("unpaid", "Unpaid"),
        ],
        help_text="Current subscription status",
    )
    subscription_tier = models.CharField(
        max_length=50,
        default="basic",
        choices=[
            ("basic", "Basic"),
            ("premium", "Premium"),
            ("enterprise", "Enterprise"),
        ],
        help_text="Subscription tier/plan",
    )
    trial_start_date = models.DateTimeField(
        null=True, blank=True, help_text="When the trial period started"
    )
    trial_end_date = models.DateTimeField(
        null=True, blank=True, help_text="When the trial period ends"
    )
    stripe_subscription_id = models.CharField(
        max_length=255, null=True, blank=True, help_text="Stripe subscription ID"
    )

    # Account Cancellation Management (Soft Delete)
    cancelled_at = models.DateTimeField(
        null=True, blank=True, help_text="When the account was cancelled"
    )
    cancellation_reason = models.TextField(
        null=True, blank=True, help_text="Reason provided for account cancellation"
    )
    cancellation_type = models.CharField(
        max_length=20,
        choices=[("immediate", "Immediate"), ("scheduled", "Scheduled")],
        null=True,
        blank=True,
        help_text="Type of cancellation",
    )
    scheduled_cancellation_date = models.DateField(
        null=True, blank=True, help_text="Scheduled date for account cancellation"
    )

    ORGANIZATION_TYPE_CHOICES = [
        ("personal", "Personal"),
        ("clinic", "Clinic"),
        ("group", "Group"),
    ]
    organization_type = models.CharField(
        max_length=20, choices=ORGANIZATION_TYPE_CHOICES, default="personal"
    )

    # ✅ Online Status Fields for Real-time Chat
    last_seen = models.DateTimeField(
        null=True, blank=True, help_text="Last time user was active"
    )
    is_online = models.BooleanField(
        default=False, help_text="Whether user is currently online"
    )

    def __str__(self):
        return f"{self.username} ({self.role})"

    def update_last_seen(self):
        """Update the last seen timestamp to current time"""
        self.last_seen = timezone.now()
        self.save(update_fields=["last_seen"])

    def set_online_status(self, is_online):
        """Set the online status and update last seen if going online"""
        self.is_online = is_online
        if is_online:
            self.last_seen = timezone.now()
        self.save(update_fields=["is_online", "last_seen"])

    def cancel_account(
        self, cancellation_type="immediate", reason=None, scheduled_date=None
    ):
        """Cancel user account with soft delete"""
        self.is_active = False
        self.cancelled_at = timezone.now()
        self.cancellation_type = cancellation_type
        self.cancellation_reason = reason
        self.subscription_status = "canceled"

        if cancellation_type == "scheduled" and scheduled_date:
            self.scheduled_cancellation_date = scheduled_date

        self.save()
        return True  # Return True to indicate success
        return True

    def reactivate_account(self):
        """Reactivate a cancelled account (admin only)"""
        self.is_active = True
        self.cancelled_at = None
        self.cancellation_type = None
        self.cancellation_reason = None
        self.scheduled_cancellation_date = None
        self.subscription_status = "active"
        self.save()
        return True

    @property
    def is_cancelled(self):
        """Check if account is cancelled"""
        return self.cancelled_at is not None


class OnlineUser(models.Model):
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="online_status_record",
    )
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.user.username} is {'online' if self.is_online else 'offline'}"


LEGAL_SEX_CHOICES = [
    ("M", "Male"),
    ("F", "Female"),
    ("X", "Unspecified/Other"),
]


def legal_document_upload_path(instance, filename, field_name):
    return f"legal_documents/{instance.pk or 'new'}/{field_name}/{filename}"


def consent_to_treat_upload_path(instance, filename):
    return legal_document_upload_path(instance, filename, "consent_to_treat")


def privacy_acknowledgment_upload_path(instance, filename):
    return legal_document_upload_path(instance, filename, "privacy_acknowledgment")


def financial_responsibility_upload_path(instance, filename):
    return legal_document_upload_path(instance, filename, "financial_responsibility")


def assignment_of_benefits_upload_path(instance, filename):
    return legal_document_upload_path(instance, filename, "assignment_of_benefits")


def release_of_information_upload_path(instance, filename):
    return legal_document_upload_path(instance, filename, "release_of_information")


class Patient(models.Model):
    user = models.OneToOneField(
        "CustomUser", on_delete=models.CASCADE, related_name="patient_profile"
    )  # Use CustomUser instead of User
    date_of_birth = models.DateField(null=True, blank=True)
    phone_number = models.CharField(max_length=15, blank=True)
    address = models.CharField(max_length=255, blank=True)
    medical_history = models.TextField(
        blank=True, null=True
    )  # Allow null values for optional medical history
    # Add direct organization link for easier queries
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patients",
    )

    # -- Patient Identity (full Registration tab) ---------------------------
    # "Legal name" and date of birth/address/phone above already cover most
    # of Patient Identity; these fill in the rest. Full legal name itself
    # stays on CustomUser.first_name/last_name -- no separate field here.
    legal_sex = models.CharField(
        max_length=1, choices=LEGAL_SEX_CHOICES, blank=True
    )
    # Deliberately NOT a full SSN -- registration workflows commonly only
    # need the last 4 digits for identity verification, so that's all we
    # store (avoids holding a full SSN at rest).
    ssn_last4 = models.CharField(max_length=4, blank=True)
    preferred_language = models.CharField(max_length=100, blank=True)
    # System-generated Medical Record Number, assigned once on first save
    # (see save() below). Format: MRN-000001.
    mrn = models.CharField(max_length=20, unique=True, null=True, blank=True)

    # -- Emergency Contact ----------------------------------------------
    emergency_contact_name = models.CharField(max_length=255, blank=True)
    emergency_contact_relationship = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)
    emergency_contact_address = models.CharField(max_length=255, blank=True)

    # -- Financial Information / Insurance -------------------------------
    insurance_payer_name = models.CharField(max_length=255, blank=True)
    insurance_member_id = models.CharField(max_length=100, blank=True)
    insurance_group_number = models.CharField(max_length=100, blank=True)
    policyholder_name = models.CharField(max_length=255, blank=True)
    policyholder_dob = models.DateField(null=True, blank=True)
    copay_deductible_status = models.CharField(max_length=255, blank=True)
    authorization_requirements = models.TextField(blank=True)
    secondary_insurance = models.TextField(blank=True)

    # -- Legal Documents ---------------------------------------------------
    # Each document is a checkbox + the timestamp it was acknowledged, plus
    # an optional scanned copy (photo or PDF of the signed paper form).
    consent_to_treat = models.BooleanField(default=False)
    consent_to_treat_at = models.DateTimeField(null=True, blank=True)
    consent_to_treat_file = models.FileField(
        upload_to=consent_to_treat_upload_path, null=True, blank=True
    )
    privacy_acknowledgment = models.BooleanField(default=False)
    privacy_acknowledgment_at = models.DateTimeField(null=True, blank=True)
    privacy_acknowledgment_file = models.FileField(
        upload_to=privacy_acknowledgment_upload_path, null=True, blank=True
    )
    financial_responsibility_agreement = models.BooleanField(default=False)
    financial_responsibility_agreement_at = models.DateTimeField(null=True, blank=True)
    financial_responsibility_agreement_file = models.FileField(
        upload_to=financial_responsibility_upload_path, null=True, blank=True
    )
    assignment_of_benefits = models.BooleanField(default=False)
    assignment_of_benefits_at = models.DateTimeField(null=True, blank=True)
    assignment_of_benefits_file = models.FileField(
        upload_to=assignment_of_benefits_upload_path, null=True, blank=True
    )
    release_of_information = models.BooleanField(default=False)
    release_of_information_at = models.DateTimeField(null=True, blank=True)
    release_of_information_file = models.FileField(
        upload_to=release_of_information_upload_path, null=True, blank=True
    )

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.mrn:
            # MRN depends on the auto-incremented pk, so it can only be
            # assigned after the first save -- do one more lightweight
            # save (update_fields keeps this to a single-column UPDATE).
            self.mrn = f"MRN-{self.pk:06d}"
            super().save(update_fields=["mrn"])

    def __str__(self):
        return f"{self.user.first_name} {self.user.last_name}"


class Organization(models.Model):
    name = models.CharField(max_length=255)
    logo = models.ImageField(upload_to="org_logos/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Phase 2: Organization-level subscription management
    subscription_status = models.CharField(
        max_length=20,
        default="trial",
        choices=[
            ("trial", "Trial"),
            ("active", "Active"),
            ("canceled", "Canceled"),
            ("unpaid", "Unpaid"),
        ],
        help_text="Current subscription status for the organization",
    )
    subscription_tier = models.CharField(
        max_length=50,
        default="basic",
        choices=[
            ("basic", "Professional"),  # Individual/Professional use
            ("premium", "Clinic"),      # Small clinic/practice
            ("enterprise", "Group"),    # Large group/enterprise
        ],
        help_text="Subscription tier/plan for the organization",
    )
    trial_start_date = models.DateTimeField(
        null=True, blank=True, help_text="When the trial period started"
    )
    trial_end_date = models.DateTimeField(
        null=True, blank=True, help_text="When the trial period ends"
    )
    stripe_subscription_id = models.CharField(
        max_length=255, null=True, blank=True, help_text="Stripe subscription ID for organization"
    )
    
    # Organization settings
    max_users = models.IntegerField(
        default=1, 
        help_text="Maximum number of users allowed in this organization"
    )
    organization_type = models.CharField(
        max_length=50,
        default="personal",
        choices=[
            ("personal", "Personal Practice"),
            ("clinic", "Clinic"),
            ("group", "Group Practice"),
        ],
        help_text="Type of organization"
    )
    staffing_messaging_enabled = models.BooleanField(
        default=True,
        help_text=(
            "Master on/off switch for this organization's automatic Staffing SMS/email "
            "messaging -- shift reminders and understaffing coverage alerts. Turning this "
            "off stops the hourly automated jobs from sending anything for this "
            "organization; it does not affect ad-hoc messages an admin sends manually from "
            "the Roster tab."
        ),
    )

    lab_interface_enabled = models.BooleanField(
        default=False,
        help_text=(
            "Paid add-on: electronic lab connection (Quest, Labcorp, ...). Lab results can "
            "always be entered by hand or scanned; this switch only unlocks the automatic "
            "electronic interface for this organization. Only a system admin can change it."
        ),
    )

    # Clinic location. The STATE drives which state staffing rules the
    # Staffing module applies (see staffing/state_rules.py).
    address_line1 = models.CharField(max_length=255, blank=True, default="")
    address_line2 = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(
        max_length=2,
        blank=True,
        default="",
        choices=US_STATE_CHOICES,
        help_text="Two-letter state of the clinic; selects the state staffing rules.",
    )
    postal_code = models.CharField(max_length=10, blank=True, default="")
    staffing_spare_buffer = models.PositiveSmallIntegerField(
        default=1,
        validators=[MaxValueValidator(2)],
        help_text=(
            "Calendar 'at risk' buffer: a covered shift turns amber when losing this "
            "many staff would break coverage. 0 = amber only for pending off requests "
            "or open call-outs."
        ),
    )

    def __str__(self):
        return self.name
    
    @property
    def current_user_count(self):
        """Return the current number of active users in the organization"""
        return self.users.filter(is_active=True).count()
    
    @property 
    def can_add_users(self):
        """Check if organization can add more users based on subscription"""
        return self.current_user_count < self.max_users
    
    def get_subscription_limits(self):
        """Get subscription limits based on tier"""
        limits = {
            'basic': {
                'max_users': 1,
                'max_appointments_per_month': 200,
                'analytics_access': 'standard',
                'features': ['standard_reports', 'basic_scheduling']
            },
            'premium': {
                'max_users': 10,
                'max_appointments_per_month': 999999,
                'analytics_access': 'advanced',
                'features': ['standard_reports', 'advanced_analytics', 'team_management']
            },
            'enterprise': {
                'max_users': 999999,
                'max_appointments_per_month': 999999,
                'analytics_access': 'advanced',
                'features': ['standard_reports', 'advanced_analytics', 'team_management', 'enterprise_features']
            }
        }
        return limits.get(self.subscription_tier, limits['basic'])


# ✅ Phase 2: Real-time Chat Models
class ChatRoomManager(models.Manager):
    def get_or_create_direct_room_for_participants(self, participants):
        """
        Get or create a direct chat room for exactly two participants.
        Returns (room, created)
        """
        if len(participants) != 2:
            raise ValueError("Direct chat rooms require exactly two participants.")
        # Sort by id for consistency
        participants = sorted(participants, key=lambda u: u.id)
        # Try to find an existing direct room with exactly these two participants
        rooms = self.filter(room_type="direct", participants=participants[0])
        for room in rooms:
            if room.participants.count() == 2 and all(
                p in room.participants.all() for p in participants
            ):
                return room, False
        # No such room, create one
        room = self.create(
            name=f"Direct: {participants[0].username}, {participants[1].username}",
            room_type="direct",
        )
        room.participants.set(participants)
        room.save()
        return room, True


class ChatRoom(models.Model):
    """Chat room for team communication"""

    ROOM_TYPE_CHOICES = [
        ("direct", "Direct Message"),
        ("group", "Group Chat"),
        ("team", "Team Chat"),
    ]

    name = models.CharField(max_length=255, help_text="Name of the chat room")
    room_type = models.CharField(
        max_length=20, choices=ROOM_TYPE_CHOICES, default="direct"
    )
    participants = models.ManyToManyField(
        CustomUser,
        related_name="chat_rooms",
        help_text="Users participating in this chat room",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    objects = ChatRoomManager()

    class Meta:
        verbose_name = "Chat Room"
        verbose_name_plural = "Chat Rooms"

    def __str__(self):
        return f"{self.name} ({self.get_room_type_display()})"

    def get_participants_list(self):
        """Get list of participant usernames"""
        return [user.username for user in self.participants.all()]


class ChatMessage(models.Model):
    """Individual chat message"""

    MESSAGE_TYPE_CHOICES = [
        ("text", "Text Message"),
        ("system", "System Message"),
        ("notification", "Notification"),
    ]

    room = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name="messages",
        help_text="Chat room this message belongs to",
    )
    sender = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="sent_messages",
        help_text="User who sent the message",
    )
    recipient = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="received_messages",
        null=True,
        blank=True,
        help_text="User who should receive the message (for direct messages)",
    )
    message = models.TextField(help_text="The chat message content")
    message_type = models.CharField(
        max_length=20, choices=MESSAGE_TYPE_CHOICES, default="text"
    )
    timestamp = models.DateTimeField(
        auto_now_add=True, help_text="When the message was sent"
    )
    is_read = models.BooleanField(
        default=False, help_text="Whether the message has been read"
    )

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Chat Message"
        verbose_name_plural = "Chat Messages"

    def __str__(self):
        return f"{self.sender.username}: {self.message[:50]}..."

    def mark_as_read(self):
        """Mark message as read"""
        self.is_read = True
        self.save(update_fields=["is_read"])

    @classmethod
    def get_unread_for_user(cls, user):
        """Get all unread messages for a specific user"""
        return (
            cls.objects.filter(recipient=user, is_read=False)
            .select_related("sender", "room")
            .order_by("timestamp")
        )

    @classmethod
    def get_unread_count_for_user(cls, user):
        """Get count of unread messages for a specific user"""
        return cls.objects.filter(recipient=user, is_read=False).count()

    @classmethod
    def mark_room_messages_read(cls, room_id, user):
        """Mark all messages in a room as read for a specific user"""
        return cls.objects.filter(
            room_id=room_id, recipient=user, is_read=False
        ).update(is_read=True)


class TypingIndicator(models.Model):
    """Track who is currently typing in a chat room"""

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE)
    is_typing = models.BooleanField(default=False)
    last_typing_time = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "room")
        verbose_name = "Typing Indicator"
        verbose_name_plural = "Typing Indicators"

    def __str__(self):
        return f"{self.user.username} typing in {self.room.name}"

    def set_typing(self, is_typing=True):
        """Update typing status"""
        self.is_typing = is_typing
        self.save(update_fields=["is_typing", "last_typing_time"])


class UserRightOverride(models.Model):
    """
    A single per-user exception to what their role would otherwise grant --
    the building block of the Security Settings "rights" checkboxes.

    Absence of a row for (user, right_code) means "use the role default"
    (see users.rights.role_default_rights). A row with is_granted=True adds
    that right even if the user's role doesn't normally have it; is_granted
    =False takes it away even if the role does. `right_code` is validated
    against users.rights.RIGHT_CODES at the serializer layer, not here, so
    this table has no hard FK to the (code-defined, not DB-defined) rights
    registry -- the registry can gain/rename rights without a migration.
    """

    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="right_overrides"
    )
    right_code = models.CharField(max_length=64)
    is_granted = models.BooleanField(
        help_text="True grants this right beyond the user's role default; False revokes it."
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="right_overrides_made",
        help_text="Which admin/system_admin last changed this override",
    )

    class Meta:
        unique_together = ("user", "right_code")
        verbose_name = "User Right Override"
        verbose_name_plural = "User Right Overrides"

    def __str__(self):
        verb = "granted" if self.is_granted else "revoked"
        return f"{self.user.username}: {self.right_code} {verb}"


class Registration(models.Model):
    """
    A single visit-level registration/intake record -- Reason for Visit and
    Logistics live here (per-visit data), distinct from the patient-level
    Identity/Emergency Contact/Financial/Legal Documents fields on Patient
    itself (those rarely change visit to visit). A patient can have many
    Registrations over time (one per visit/encounter).
    """

    ADMISSION_TYPE_CHOICES = [
        ("scheduled", "Scheduled"),
        ("emergency", "Emergency"),
        ("direct", "Direct"),
    ]
    # The care setting this visit belongs to: drives the Ambulatory / Emergency /
    # Acute tabs on the Patients page. Left blank it is worked out from the
    # admission type when the visit is saved (see save() below).
    CARE_SETTING_CHOICES = [
        ("ambulatory", "Ambulatory Care"),
        ("emergency", "Emergency Care"),
        ("acute", "Acute Care"),
    ]

    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name="registrations"
    )
    appointment = models.ForeignKey(
        "appointments.Appointment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registration",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registrations",
    )
    # System-generated Visit Number, assigned once on first save (see
    # save() below). Format: VN-000001.
    visit_number = models.CharField(max_length=20, unique=True, null=True, blank=True)

    # -- Reason for Visit --------------------------------------------------
    reason_for_visit = models.TextField(blank=True)
    presenting_problem = models.TextField(blank=True)
    scheduled_procedure = models.CharField(max_length=255, blank=True)
    referring_physician = models.CharField(max_length=255, blank=True)
    current_diagnoses = models.TextField(blank=True)

    # -- Logistics -----------------------------------------------------
    admission_type = models.CharField(
        max_length=20, choices=ADMISSION_TYPE_CHOICES, blank=True
    )
    care_setting = models.CharField(
        max_length=12, choices=CARE_SETTING_CHOICES, blank=True
    )

    # -- Where the patient is (Location Manager) -------------------------
    # Pick the most specific place known (bed, else room, else unit, else facility);
    # the rest of the path is filled in from it when the visit is saved.
    facility = models.ForeignKey(
        "appointments.Facility", on_delete=models.SET_NULL, null=True, blank=True, related_name="registrations"
    )
    unit = models.ForeignKey(
        "appointments.Unit", on_delete=models.SET_NULL, null=True, blank=True, related_name="registrations"
    )
    room = models.ForeignKey(
        "appointments.Room", on_delete=models.SET_NULL, null=True, blank=True, related_name="registrations"
    )
    bed = models.ForeignKey(
        "appointments.Bed", on_delete=models.SET_NULL, null=True, blank=True, related_name="registrations"
    )
    # Set when the patient leaves; a bed is occupied while a visit holds it with no discharge time.
    discharge_datetime = models.DateTimeField(null=True, blank=True)

    # -- ED board (the emergency status board reads and edits these) ---------
    # Triage level 1 (most urgent) to 5.
    esi = models.PositiveSmallIntegerField(null=True, blank=True)
    # Where the patient is in the ED flow, e.g. "wtbs" (waiting to be seen); the allowed
    # values live in users/ed_board.py.
    ed_status = models.CharField(max_length=20, blank=True)
    assigned_nurse = models.ForeignKey(
        "CustomUser", on_delete=models.SET_NULL, null=True, blank=True, related_name="nurse_registrations"
    )
    # The resident now comes from the clinic's doctors (resident_provider); the old free-text name is kept
    # so nothing is lost, and shows until someone picks a resident from the list.
    resident = models.CharField(max_length=120, blank=True)
    resident_provider = models.ForeignKey(
        "CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": "doctor"},
        related_name="resident_registrations",
    )
    board_comments = models.CharField(max_length=300, blank=True)
    # Registrar ticks this once registration is finished (the board shows it red until then).
    registration_complete = models.BooleanField(default=False)
    # Values for the custom columns an admin adds in the Status Board Builder: {column key: value}.
    board_custom = models.JSONField(default=dict, blank=True)
    arrival_time = models.DateTimeField(null=True, blank=True)
    # "Unit, room, bed" as one free-text field, matching how front-office
    # staff actually write it (e.g. "3 West, Rm 312, Bed B").
    assigned_location = models.CharField(max_length=255, blank=True)
    attending_provider = models.ForeignKey(
        "CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": "doctor"},
        related_name="attending_registrations",
    )

    registered_by = models.ForeignKey(
        "CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registrations_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @staticmethod
    def default_care_setting(admission_type):
        """Emergency visits are Emergency Care, direct admissions are Acute Care, the rest Ambulatory."""
        return {"emergency": "emergency", "direct": "acute"}.get(admission_type or "", "ambulatory")

    def location_path(self):
        """'General Hospital > 3 West > 312 > B' from whatever parts of the location are set."""
        parts = [
            self.facility.name if self.facility_id else "",
            self.unit.name if self.unit_id else "",
            self.room.name if self.room_id else "",
            self.bed.name if self.bed_id else "",
        ]
        return " \u203a ".join(p for p in parts if p)

    def _fill_location_parents(self):
        """Work up from the most specific place chosen so the parents always agree with it."""
        if self.bed_id:
            self.room = self.bed.room
        if self.room_id:
            self.unit = self.room.unit
        if self.unit_id:
            self.facility = self.unit.facility

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        extra = []
        if self.bed_id or self.room_id or self.unit_id or self.facility_id:
            self._fill_location_parents()
            # The unit's care type decides the care setting; the typed location text follows the tree.
            if self.unit_id:
                self.care_setting = self.unit.care_setting
            self.assigned_location = self.location_path()
            extra = ["facility", "unit", "room", "bed", "care_setting", "assigned_location"]
        if not self.care_setting:
            self.care_setting = self.default_care_setting(self.admission_type)
            extra.append("care_setting")
        if update_fields is not None and extra:
            kwargs["update_fields"] = list(update_fields) + [f for f in extra if f not in update_fields]
        super().save(*args, **kwargs)
        if not self.visit_number:
            self.visit_number = f"VN-{self.pk:06d}"
            super().save(update_fields=["visit_number"])
        if self.care_setting == "emergency" and not self.appointment_id and not self.discharge_datetime:
            self.ensure_chart_appointment()

    def ensure_chart_appointment(self):
        """
        Orders, notes and flowsheets are charted against an Appointment, so every open ED visit gets one
        (created once, linked here); any other visit gets one the first time it is charted on. It is marked in progress and arrived, and the reminder jobs skip it.
        """
        if self.appointment_id or not self.pk:
            return self.appointment
        from django.utils import timezone

        from appointments.models import Appointment

        user = self.patient.user
        appointment = Appointment.all_objects.create(
            organization=self.organization or user.organization,
            patient=user,
            title=f"{'ED visit' if self.care_setting == 'emergency' else 'Visit'} {self.visit_number or ''}".strip(),
            description=self.reason_for_visit or "",
            appointment_datetime=self.arrival_time or timezone.now(),
            duration_minutes=60,
            status="in_progress",
            provider=self.attending_provider,
            unit=self.unit,
            arrived=True,
        )
        Registration.objects.filter(pk=self.pk).update(appointment=appointment)
        self.appointment = appointment
        return appointment

    def __str__(self):
        return f"{self.visit_number or 'unsaved'} - {self.patient}"


class StatusBoardSettings(models.Model):
    """
    What every ED board view in a clinic shares: the status list, the overdue-vitals limit, the custom columns
    (their names, kinds and choices, so a value means the same thing in every view) and the nurse/doctor lists.
    One row per clinic; a clinic with no row uses the built-in defaults (see board_config.py).
    """

    organization = models.OneToOneField("Organization", on_delete=models.CASCADE, related_name="status_board_settings")
    statuses = models.JSONField(default=list)
    vitals_overdue_minutes = models.PositiveIntegerField(default=60)
    custom_columns = models.JSONField(default=list)
    # {"default": {"nurses": [ids] | None, "doctors": [...] | None}, "units": {"<unit id>": {...}}}
    roster = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey("CustomUser", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")


class StatusBoardView(models.Model):
    """
    A named ED board view an admin built (columns, color rules and which patients it shows). It appears in the
    board's View dropdown for the whole clinic. `previous_config` holds the layout before the last save so one
    save can be undone.
    """

    organization = models.ForeignKey("Organization", on_delete=models.CASCADE, related_name="status_board_views")
    name = models.CharField(max_length=60)
    position = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)
    config = models.JSONField(default=dict)
    previous_config = models.JSONField(null=True, blank=True)
    author = models.ForeignKey("CustomUser", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "name"]

    def __str__(self):
        return self.name


class StatusBoardPreference(models.Model):
    """The view a person last chose on the ED board ("all", "waiting", "mine" or "v<id>")."""

    user = models.OneToOneField("CustomUser", on_delete=models.CASCADE, related_name="status_board_preference")
    view_key = models.CharField(max_length=20)
    updated_at = models.DateTimeField(auto_now=True)
