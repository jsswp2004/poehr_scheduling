from rest_framework import viewsets, permissions
from .models import Appointment
from .serializers import AppointmentSerializer
from datetime import timedelta
from dateutil.relativedelta import relativedelta

class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if user.role == 'receptionist':
            return Appointment.objects.all().order_by('appointment_datetime')
        elif user.role == 'doctor':
            return Appointment.objects.all().order_by('appointment_datetime')  # Customize if needed
        elif user.role == 'admin':
            return Appointment.objects.all().order_by('appointment_datetime')
        elif user.role == 'patient':
            return Appointment.objects.filter(patient=user).order_by('appointment_datetime')
        else:
            return Appointment.objects.none()

    def perform_create(self, serializer):
        appointment = serializer.save(patient=self.request.user)

        recurrence = appointment.recurrence
        start_time = appointment.appointment_datetime
        duration = appointment.duration_minutes

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
                continue

            Appointment.objects.create(
                patient=appointment.patient,
                title=appointment.title,
                description=appointment.description,
                appointment_datetime=next_time,
                duration_minutes=duration,
                recurrence='none'  # prevent chaining
            )
