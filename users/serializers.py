from rest_framework import serializers
from .models import CustomUser, Patient, Organization
from django.core.mail import send_mail
from django.conf import settings
from appointments.models import Appointment


class UserSerializer(serializers.ModelSerializer):
    provider_name = serializers.SerializerMethodField()  # ✅ Add readable provider name
    profile_picture = serializers.ImageField(required=False, allow_null=True, use_url=True)  # ✅ This makes it include full path
    organization_logo = serializers.SerializerMethodField()
    organization_name = serializers.SerializerMethodField()  # New field for organization name
    class Meta:
        model = CustomUser
        fields = (
            'id', 'username', 'email', 'password',
            'first_name', 'last_name', 'role', 'provider', 'provider_name', 'profile_picture','organization', 'organization_logo', 'organization_name', 'phone_number'  # ✅ include provider_name
        )
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'provider': {'required': False, 'allow_null': True},
            'role': {'required': False},
        }

    def update(self, instance, validated_data):
        profile_picture = validated_data.pop('profile_picture', None)
        print("🔥 PROFILE PICTURE RECEIVED:", profile_picture)
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
        provider = validated_data.pop('provider', None)
        organization = validated_data.pop('organization')

        profile_picture = validated_data.pop('profile_picture', None)  # ✅ Extract it safely

        # Frontend will send 'patient' when isPatient is True.
        # If not present (non-patient), leave role blank or None
        role = validated_data.get('role')  # may be 'patient', '', or None
        role = role if role else 'None'  # empty string should become None
        user = CustomUser.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=role,  # blank string if non-patient
            organization=organization
        )

        if profile_picture:  # ✅ Save the uploaded file
            user.profile_picture = profile_picture
            user.save()


        # 🩺 Apply patient-specific logic only when role is 'patient'
        if user.role == 'patient':
            if isinstance(provider, CustomUser):
                user.provider = provider
            elif isinstance(provider, int):
                try:
                    user.provider = CustomUser.objects.get(id=provider)
                except CustomUser.DoesNotExist:
                    pass
            user.save()

            # Create patient profile if not already existing
            if not Patient.objects.filter(user=user).exists():
                Patient.objects.create(user=user, phone_number=validated_data.get('phone_number', ''))

            # ✉️ Notify admin
            admin_email = getattr(settings, 'ADMIN_EMAIL', None)
            if admin_email:
                send_mail(
                    subject='🆕 New Patient Registration',
                    message=(
                        f"A new patient has registered:\n\n"
                        f"Name: {user.first_name} {user.last_name}\n"
                        f"Email: {user.email}\n"
                        f"Phone: {validated_data.get('phone_number', 'N/A')}"
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[admin_email],
                    fail_silently=False,
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
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username')
    email = serializers.EmailField(source='user.email')
    first_name = serializers.CharField(source='user.first_name')
    last_name = serializers.CharField(source='user.last_name')
    provider = serializers.IntegerField(source='user.provider.id', read_only=True, allow_null=True)
    provider_name = serializers.SerializerMethodField()
    last_appointment_date = serializers.SerializerMethodField()
    organization = serializers.PrimaryKeyRelatedField(queryset=Organization.objects.all(), required=False, allow_null=True)
    class Meta:
        model = Patient
        fields = [
            'id',
            'user_id',
            'username',
            'email',
            'first_name',
            'last_name',
            'provider',
            'provider_name',
            'date_of_birth',
            'phone_number',
            'address',
            'medical_history',
            'last_appointment_date',
            'organization',        ]

    def get_last_appointment_date(self, obj):
        latest = Appointment.objects.filter(patient=obj.user).order_by('-appointment_datetime').first()
        return latest.appointment_datetime if latest else None

    def get_provider_name(self, obj):
        if obj.user.provider:
            return f"{obj.user.provider.first_name} {obj.user.provider.last_name}"
        return None

    def update(self, instance, validated_data):
        # Handle nested updates to the related user fields
        user_data = validated_data.pop('user', {})
        user = instance.user

        # Update user fields
        for attr, value in user_data.items():
            setattr(user, attr, value)
        
        # Handle provider field update
        if 'provider' in validated_data:
            provider_id = validated_data.pop('provider')
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
        if 'organization' in validated_data:
            user.organization = validated_data['organization']
        user.save()

        # Handle patient fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance

class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'logo', 'created_at']
