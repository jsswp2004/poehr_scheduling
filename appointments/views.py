from rest_framework import viewsets, permissions
from .models import Appointment
from .serializers import AppointmentSerializer,AvailabilitySerializer
from datetime import timedelta
from dateutil.relativedelta import relativedelta
from django.apps import apps  # Import apps to dynamically get the model
from django.conf import settings  # Import settings to access AUTH_USER_MODEL
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from datetime import timedelta
from django.utils import timezone
from django.utils.timezone import make_aware
from datetime import datetime as dt
from datetime import datetime, timedelta, time as dt_time
from .models import Availability
from django.core.mail import send_mail



from .models import Appointment

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
        elif user.role == 'doctor':
            queryset = queryset.filter(provider=user)  # optional: show only their own patients
        elif user.role in ['registrar', 'admin']:
            pass  # ✅ Allow access to all appointments

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

        # ✅ Send email to admin if created by a patient
        if self.request.user.role == 'patient':
            admin_email = getattr(settings, 'ADMIN_EMAIL', None)
            if admin_email:
                subject = f"📅 New Appointment from {self.request.user.get_full_name()}"
                message = (
                    f"A new appointment has been scheduled by {self.request.user.get_full_name()}:\n\n"
                    f"Title: {appointment.title}\n"
                    f"Date & Time: {appointment.appointment_datetime}\n"
                    f"Doctor: Dr. {provider.first_name} {provider.last_name}\n"
                    f"Description: {appointment.description or 'N/A'}"
                )
                send_mail(
                    subject,
                    message,
                    settings.DEFAULT_FROM_EMAIL,
                    [admin_email],
                    fail_silently=False
                )

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

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def doctor_available_slots(request, doctor_id):
    now = timezone.localtime()
    slots = []
    max_slots = 5
    check_limit = 30
    days_checked = 0

    while len(slots) < max_slots and days_checked < check_limit:
        current_day = now + timedelta(days=days_checked)

        # Skip weekends
        if current_day.weekday() >= 5:
            days_checked += 1
            continue

        for hour in range(8, 18):  # 8:00 AM to 5:00 PM
            naive_dt = datetime.combine(current_day.date(), dt_time(hour=hour))
            slot_time = timezone.make_aware(naive_dt, timezone.get_current_timezone())

            if slot_time <= now:
                continue

            is_taken = Appointment.objects.filter(
                provider_id=doctor_id,
                appointment_datetime=slot_time
            ).exists()

            if not is_taken:
                slots.append(slot_time)
                if len(slots) == max_slots:
                    break

        days_checked += 1

    return Response([timezone.localtime(s).isoformat() for s in slots])



class AvailabilityViewSet(viewsets.ModelViewSet):
    queryset = Availability.objects.all().order_by('-start_time')
    serializer_class = AvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        availability = serializer.save()

        recurrence = availability.recurrence
        start = availability.start_time
        end = availability.end_time
        doctor = availability.doctor
        is_blocked = availability.is_blocked

        recurrence_count = {
            'daily': 7,     # Next 7 days
            'weekly': 4,    # Next 4 weeks
            'monthly': 3,   # Next 3 months
        }

        count = recurrence_count.get(recurrence, 0)

        for i in range(1, count + 1):
            if recurrence == 'daily':
                delta = timedelta(days=i)
            elif recurrence == 'weekly':
                delta = timedelta(weeks=i)
            elif recurrence == 'monthly':
                delta = relativedelta(months=i)
            else:
                continue

            Availability.objects.create(
                doctor=doctor,
                start_time=start + delta,
                end_time=end + delta,
                is_blocked=is_blocked,
                recurrence='none'  # avoid chaining
            )