from rest_framework import serializers
from .models import Appointment, Availability


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = '__all__'  # This will include all fields, plus patient_name
        extra_kwargs = {
            'patient': {'read_only': True},
            'provider': {'required': True},
        }

    def get_patient_name(self, obj):
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
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
        fields = ['id', 'doctor', 'start_time', 'end_time', 'is_blocked', 'recurrence', 'doctor_name']

    def get_doctor_name(self, obj):
        return f"{obj.doctor.first_name} {obj.doctor.last_name}"
