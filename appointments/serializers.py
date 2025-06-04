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

    def validate(self, data):
        # Validate recurrence and recurrence_end_date
        recurrence = data.get('recurrence', 'none')
        recurrence_end_date = data.get('recurrence_end_date', None)
        appointment_datetime = data.get('appointment_datetime', None)

        # If not in data, try to get from initial_data (raw input)
        if recurrence_end_date is None and hasattr(self, 'initial_data'):
            recurrence_end_date = self.initial_data.get('recurrence_end_date', None)
            if recurrence_end_date == '':
                recurrence_end_date = None
            data['recurrence_end_date'] = recurrence_end_date

        if recurrence and recurrence != 'none':
            if not recurrence_end_date:
                raise serializers.ValidationError({
                    'recurrence_end_date': 'Recurrence end date is required for recurring appointments.'
                })
            if not appointment_datetime:
                raise serializers.ValidationError({
                    'appointment_datetime': 'Appointment datetime is required.'
                })
            # If recurrence_end_date is a string, parse it
            if isinstance(recurrence_end_date, str):
                try:
                    recurrence_end_date = serializers.DateField().to_internal_value(recurrence_end_date)
                    data['recurrence_end_date'] = recurrence_end_date
                except Exception:
                    raise serializers.ValidationError({
                        'recurrence_end_date': 'Invalid date format for recurrence end date.'
                    })
            if recurrence_end_date < appointment_datetime.date():
                raise serializers.ValidationError({
                    'recurrence_end_date': 'Recurrence end date must be after the appointment start date.'
                })
        return data

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