from rest_framework import serializers
from .models import Appointment

class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = '__all__'
        extra_kwargs = {
            'patient': {'read_only': True}  # ✅ Prevent client from sending patient field
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure ISO string includes timezone
        data['appointment_datetime'] = instance.appointment_datetime.isoformat()
        return data
