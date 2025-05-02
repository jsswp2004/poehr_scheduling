from rest_framework import serializers
from .models import Appointment

class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = '__all__'  # This will include all fields, including the provider field
        extra_kwargs = {
            'patient': {'read_only': True},  # Prevent client from sending patient field
            'provider': {'required': True},  # Ensure the provider is required when creating an appointment
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure ISO string includes timezone
        data['appointment_datetime'] = instance.appointment_datetime.isoformat()
        return data
