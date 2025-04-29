from rest_framework import viewsets, permissions
from .models import Appointment
from .serializers import AppointmentSerializer
from datetime import timedelta
from dateutil.relativedelta import relativedelta

class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only show appointments for the logged-in user
        return Appointment.objects.filter(patient=self.request.user).order_by('appointment_datetime')

    def perform_create(self, serializer):
        # Save the initial appointment
        appointment = serializer.save(patient=self.request.user)

        recurrence = appointment.recurrence
        start_time = appointment.appointment_datetime
        duration = appointment.duration_minutes

        # Define how many times to repeat based on recurrence setting
        repeats = {
            'daily': 7,
            'weekly': 4,
            'monthly': 3,
        }

        count = repeats.get(recurrence, 0)

        for i in range(1, count + 1):
            if recurrence == 'daily':
                next_time = start_time + timedelta(days=i)
            elif recurrence == 'weekly':
                next_time = start_time + timedelta(weeks=i)
            elif recurrence == 'monthly':
                next_time = start_time + relativedelta(months=i)
            else:
                continue  # Skip if 'none' or unrecognized

            Appointment.objects.create(
                patient=appointment.patient,
                title=appointment.title,
                description=appointment.description,
                appointment_datetime=next_time,
                duration_minutes=duration,
                recurrence='none'  # prevent chaining
            )
