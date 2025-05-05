from rest_framework import viewsets, permissions
from .models import Appointment
from .serializers import AppointmentSerializer
from datetime import timedelta
from dateutil.relativedelta import relativedelta
from django.apps import apps  # Import apps to dynamically get the model
from django.conf import settings  # Import settings to access AUTH_USER_MODEL
from django.utils.dateparse import parse_date
from django.utils.timezone import make_aware, datetime as dt

class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Appointment.objects.all().order_by('appointment_datetime')

        # Optional date filter from query params
        date_str = self.request.query_params.get('date')
        if date_str:
            try:
                date_obj = parse_date(date_str)
                if date_obj:
                    start_of_day = make_aware(dt.combine(date_obj, dt.min.time()))
                    end_of_day = make_aware(dt.combine(date_obj, dt.max.time()))
                    queryset = queryset.filter(appointment_datetime__range=(start_of_day, end_of_day))
            except Exception as e:
                print("Date parsing failed:", e)

        # Role-based filtering
        if user.role == 'patient':
            queryset = queryset.filter(patient=user)

        return queryset

    def perform_create(self, serializer):
        # Get provider from the request data
        provider_id = self.request.data.get('provider')
        provider = None
        if provider_id:
            try:
                # Dynamically get the User model
                User = apps.get_model(settings.AUTH_USER_MODEL)  
                provider = User.objects.get(id=provider_id)  # Use the actual User model
            except User.DoesNotExist:
                raise ValueError("Provider not found.")  # Handle case where provider does not exist

        # Save the appointment with the associated provider
        appointment = serializer.save(patient=self.request.user, provider=provider)

        # Handle recurrence logic
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
                recurrence='none',  # Prevent chaining
                provider=provider  # Ensure recurrence appointments are assigned the same provider
            )
