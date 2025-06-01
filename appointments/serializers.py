from rest_framework import serializers
from .models import Appointment, Availability, EnvironmentSetting, Holiday, ClinicEvent


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    provider_name = serializers.SerializerMethodField()  # Add this line!

    class Meta:
        model = Appointment
        fields = '__all__'  # This will include all model fields plus both name fields
        extra_kwargs = {
            'patient': {'read_only': True},
            'provider': {'required': True},
        }

    def get_patient_name(self, obj):
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return None

    def get_provider_name(self, obj):
        if obj.provider:
            return f"Dr. {obj.provider.first_name} {obj.provider.last_name}"
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure ISO string includes timezone
        data['appointment_datetime'] = instance.appointment_datetime.isoformat()
        return data




class AvailabilitySerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = Availability
        fields = [
            'id', 'doctor', 'start_time', 'end_time', 'is_blocked', 'recurrence', 'doctor_name', 'recurrence_end_date', 'block_type'
        ]

    def get_doctor_name(self, obj):
        return f"{obj.doctor.first_name} {obj.doctor.last_name}"


class EnvironmentSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnvironmentSetting
        fields = ['id', 'blocked_days','updated_at']

class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ['id', 'name', 'date', 'is_recognized', 'suppressed']

class ClinicEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicEvent
        fields = '__all__'