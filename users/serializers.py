from rest_framework import serializers
from .models import CustomUser, Patient, Organization, Registration
from django.core.mail import send_mail
from django.conf import settings
from appointments.models import Appointment
from django.db.utils import IntegrityError


def get_admin_emails(organization=None):
    """
    Get email addresses for notification recipients:
    - Organization admins (same org)
    - System admins (all orgs)
    - Fallback admin email from settings
    """
    emails = []

    # Get system admins (they see everything across all organizations)
    system_admins = (
        CustomUser.objects.filter(role="system_admin", email__isnull=False)
        .exclude(email="")
        .values_list("email", flat=True)
    )
    emails.extend(system_admins)

    # Get organization-specific admins if organization is provided
    if organization:
        org_admins = (
            CustomUser.objects.filter(
                role="admin", organization=organization, email__isnull=False
            )
            .exclude(email="")
            .values_list("email", flat=True)
        )
        emails.extend(org_admins)

    # Add fallback admin email from settings
    fallback_email = getattr(settings, "ADMIN_EMAIL", None)
    if fallback_email and fallback_email not in emails:
        emails.append(fallback_email)

    # Remove duplicates and return
    return list(set(emails))


class UserSerializer(serializers.ModelSerializer):
    provider_name = serializers.SerializerMethodField()  # ✅ Add readable provider name
    profile_picture = serializers.ImageField(
        required=False, allow_null=True, use_url=True
    )  # ✅ This makes it include full path
    organization_logo = serializers.SerializerMethodField()
    organization_name = (
        serializers.SerializerMethodField()
    )  # New field for organization name

    class Meta:
        model = CustomUser
        fields = (
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "role",
            "provider",
            "provider_name",
            "profile_picture",
            "organization",
            "organization_logo",
            "organization_name",
            "phone_number",
            "organization_type",
            "registered",
            "stripe_customer_id",
            "subscription_status",
            "subscription_tier",
            "trial_start_date",
            "trial_end_date",
            "stripe_subscription_id",
            "is_online",
            "last_seen",
            "sms_consent",
            "sms_consent_date",  # ✅ Add SMS consent fields
        )
        extra_kwargs = {
            "password": {"write_only": True, "required": False},
            "provider": {"required": False, "allow_null": True},
            "role": {"required": False},
        }

    def update(self, instance, validated_data):
        from django.utils import timezone

        profile_picture = validated_data.pop("profile_picture", None)
        print("🔥 PROFILE PICTURE RECEIVED:", profile_picture)

        # Handle SMS consent timestamp
        sms_consent = validated_data.get("sms_consent", None)
        if sms_consent is not None and sms_consent != instance.sms_consent:
            if sms_consent:  # User just gave consent
                validated_data["sms_consent_date"] = timezone.now()
            else:  # User revoked consent
                validated_data["sms_consent_date"] = None

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if profile_picture:
            instance.profile_picture = profile_picture
        instance.save()
        return instance

    def get_provider_name(self, obj):
        if obj.provider:
            return f"{obj.provider.first_name} {obj.provider.last_name}"
        return None

    def create(self, validated_data):
        provider = validated_data.pop("provider", None)
        organization = validated_data.pop("organization")
        organization_type = validated_data.pop("organization_type", "personal")

        profile_picture = validated_data.pop(
            "profile_picture", None
        )  # ✅ Extract it safely

        # Frontend will send 'patient' when isPatient is True.
        # If not present (non-patient), leave role blank or None
        role = validated_data.get("role")  # may be 'patient', '', or None

        # Use the 'none' choice for blank roles to avoid invalid value
        role = role if role else "none"

        user = CustomUser.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            phone_number=validated_data.get("phone_number", ""),
            role=role,  # blank string if non-patient
            organization=organization,
            organization_type=organization_type,
        )

        if profile_picture:  # ✅ Save the uploaded file
            user.profile_picture = profile_picture
            user.save()

        # 🩺 Apply patient-specific logic only when role is 'patient'
        if user.role == "patient":
            if isinstance(provider, CustomUser):
                user.provider = provider
            elif isinstance(provider, int):
                try:
                    user.provider = CustomUser.objects.get(id=provider)
                except CustomUser.DoesNotExist:
                    pass
            user.save()

            # Create or update patient profile
            patient, created = Patient.objects.get_or_create(
                user=user, defaults={"phone_number": user.phone_number or ""}
            )

            if not created and patient.phone_number != user.phone_number:
                # Update existing patient record with current phone number
                patient.phone_number = user.phone_number or ""
                patient.save()

            # ✉️ Notify organization and system admins
            admin_emails = get_admin_emails(organization=user.organization)
            if admin_emails:
                org_name = (
                    user.organization.name
                    if user.organization
                    else "Unknown Organization"
                )
                send_mail(
                    subject="🆕 New Patient Registration",
                    message=(
                        f"A new patient has registered:\n\n"
                        f"Name: {user.first_name} {user.last_name}\n"
                        f"Email: {user.email}\n"
                        f"Phone: {validated_data.get('phone_number', 'N/A')}\n"
                        f"Organization: {org_name}"
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=admin_emails,
                    fail_silently=True,  # Don't fail registration if email fails
                )

        return user

    def get_organization_logo(self, obj):
        if obj.organization and obj.organization.logo:
            return obj.organization.logo.url
        return None

    def get_organization_name(self, obj):
        if obj.organization:
            return obj.organization.name
        return None


class PatientSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username")
    email = serializers.EmailField(source="user.email")
    first_name = serializers.CharField(source="user.first_name")
    last_name = serializers.CharField(source="user.last_name")
    provider = (
        serializers.SerializerMethodField()
    )  # Change to SerializerMethodField for safety
    # Add writable field for provider
    provider_id = serializers.IntegerField(
        write_only=True, required=False, allow_null=True
    )
    provider_name = serializers.SerializerMethodField()
    last_appointment_date = serializers.SerializerMethodField()
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Patient
        fields = [
            "id",
            "user_id",
            "username",
            "email",
            "first_name",
            "last_name",
            "provider",
            "provider_id",
            "provider_name",
            "date_of_birth",
            "phone_number",
            "address",
            "medical_history",
            "last_appointment_date",
            "organization",
            # Patient Identity
            "legal_sex",
            "ssn_last4",
            "preferred_language",
            "mrn",
            # Emergency Contact
            "emergency_contact_name",
            "emergency_contact_relationship",
            "emergency_contact_phone",
            "emergency_contact_address",
            # Financial Information
            "insurance_payer_name",
            "insurance_member_id",
            "insurance_group_number",
            "policyholder_name",
            "policyholder_dob",
            "copay_deductible_status",
            "authorization_requirements",
            "secondary_insurance",
            # Legal Documents (checkbox + timestamp + optional scanned file)
            "consent_to_treat",
            "consent_to_treat_at",
            "consent_to_treat_file",
            "privacy_acknowledgment",
            "privacy_acknowledgment_at",
            "privacy_acknowledgment_file",
            "financial_responsibility_agreement",
            "financial_responsibility_agreement_at",
            "financial_responsibility_agreement_file",
            "assignment_of_benefits",
            "assignment_of_benefits_at",
            "assignment_of_benefits_file",
            "release_of_information",
            "release_of_information_at",
            "release_of_information_file",
        ]
        extra_kwargs = {
            "medical_history": {"allow_null": True, "required": False},
            "mrn": {"read_only": True},
            "consent_to_treat_at": {"read_only": True},
            "privacy_acknowledgment_at": {"read_only": True},
            "financial_responsibility_agreement_at": {"read_only": True},
            "assignment_of_benefits_at": {"read_only": True},
            "release_of_information_at": {"read_only": True},
        }

    def get_last_appointment_date(self, obj):
        try:
            from appointments.models import Appointment

            latest = (
                Appointment.objects.filter(patient=obj.user)
                .order_by("-appointment_datetime")
                .first()
            )
            return latest.appointment_datetime if latest else None
        except Exception as e:
            # Handle case where appointments table doesn't exist or other DB issues
            return None

    def get_provider(self, obj):
        """Safely get provider ID, handling None values"""
        if obj.user.provider:
            return obj.user.provider.id
        return None

    def get_provider_name(self, obj):
        if obj.user.provider:
            return f"{obj.user.provider.first_name} {obj.user.provider.last_name}"
        return None

    def update(self, instance, validated_data):
        # Handle nested updates to the related user fields
        user_data = validated_data.pop("user", {})
        user = instance.user

        # Update user fields
        for attr, value in user_data.items():
            setattr(user, attr, value)

        # Handle provider field update - check for provider_id field
        if "provider_id" in validated_data:
            provider_id = validated_data.pop("provider_id")
            if provider_id:
                try:
                    from .models import CustomUser

                    provider = CustomUser.objects.get(id=provider_id)
                    user.provider = provider
                except CustomUser.DoesNotExist:
                    user.provider = None
            else:
                user.provider = None

        # Also update organization on user if present
        if "organization" in validated_data:
            user.organization = validated_data["organization"]

        user.save()

        # Handle patient fields
        legal_doc_flags = [
            "consent_to_treat",
            "privacy_acknowledgment",
            "financial_responsibility_agreement",
            "assignment_of_benefits",
            "release_of_information",
        ]
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            if attr in legal_doc_flags:
                from django.utils import timezone

                setattr(instance, f"{attr}_at", timezone.now() if value else None)
        instance.save()

        return instance


class RegistrationSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    attending_provider_name = serializers.SerializerMethodField()

    class Meta:
        model = Registration
        fields = [
            "id",
            "patient",
            "patient_name",
            "appointment",
            "organization",
            "visit_number",
            "reason_for_visit",
            "presenting_problem",
            "scheduled_procedure",
            "referring_physician",
            "current_diagnoses",
            "admission_type",
            "arrival_time",
            "assigned_location",
            "attending_provider",
            "attending_provider_name",
            "registered_by",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "visit_number": {"read_only": True},
            "registered_by": {"read_only": True},
            "organization": {"required": False, "allow_null": True},
        }

    def get_patient_name(self, obj):
        return f"{obj.patient.user.first_name} {obj.patient.user.last_name}"

    def get_attending_provider_name(self, obj):
        if obj.attending_provider:
            return f"Dr. {obj.attending_provider.first_name} {obj.attending_provider.last_name}"
        return None

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["registered_by"] = request.user
            if not validated_data.get("organization"):
                validated_data["organization"] = request.user.organization
        return super().create(validated_data)


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "logo",
            "created_at",
            "subscription_status",
            "subscription_tier",
            "max_users",
            "organization_type",
            "staffing_messaging_enabled",
            "lab_interface_enabled",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
            "staffing_spare_buffer",
        ]

    def update(self, instance, validated_data):
        # The lab add-on is a paid switch: only a system admin may change it.
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if getattr(user, "role", None) != "system_admin" and not getattr(user, "is_superuser", False):
            validated_data.pop("lab_interface_enabled", None)
        return super().update(instance, validated_data)

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if getattr(user, "role", None) != "system_admin" and not getattr(user, "is_superuser", False):
            validated_data.pop("lab_interface_enabled", None)
        return super().create(validated_data)
