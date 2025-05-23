from rest_framework import viewsets, permissions
from .models import Appointment, EnvironmentSetting, Holiday
from .serializers import AppointmentSerializer,AvailabilitySerializer, EnvironmentSettingSerializer, HolidaySerializer
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
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
import holidays as pyholidays


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
        user = self.request.user
        patient = user  # Default: patient is the current user

        # Allow registrar/admin to specify a patient in request data
        if user.role in ['registrar', 'admin']:
            patient_id = self.request.data.get('patient')
            if patient_id:
                try:
                    User = apps.get_model(settings.AUTH_USER_MODEL)
                    patient = User.objects.get(id=patient_id)
                except User.DoesNotExist:
                    raise ValueError("Patient not found.")

        appointment = serializer.save(patient=patient, provider=provider)


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
            'daily': 179,
            'weekly': 23,
            'monthly': 11,
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

    def perform_update(self, serializer):
        print("💬 Incoming update validated_data:", serializer.validated_data)
    # Optional: get provider if it's included in update
        provider_id = self.request.data.get('provider')
        provider = None

        if provider_id:
            try:
                User = apps.get_model(settings.AUTH_USER_MODEL)
                provider = User.objects.get(id=provider_id)
            except User.DoesNotExist:
                raise ValueError("Provider not found.")

        updated = serializer.save(provider=provider if provider else None)
        print(f"✅ Saved duration_minutes: {updated.duration_minutes}")


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
        end_date_limit = availability.recurrence_end_date

        recurrence_count = {
            'daily': 179,     # up to ~6 months
            'weekly': 59,     # a bit over a year
            'monthly': 11,    # roughly 1 year
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

            next_start = start + delta
            next_end = end + delta

            # ⛔ Stop if recurrence_end_date is set and we're past it
            if end_date_limit and next_start.date() > end_date_limit:
                break

            Availability.objects.create(
                doctor=doctor,
                start_time=next_start,
                end_time=next_end,
                is_blocked=is_blocked,
                recurrence='none'  # avoid chaining
            )

class EnvironmentSettingView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.IsAuthenticated()]  # All logged-in users can read
        return [permissions.IsAdminUser()]          # Only admin can edit

    def get(self, request):
        obj, created = EnvironmentSetting.objects.get_or_create(pk=1)
        serializer = EnvironmentSettingSerializer(obj)
        return Response(serializer.data)

    def post(self, request):
        obj, created = EnvironmentSetting.objects.get_or_create(pk=1)
        serializer = EnvironmentSettingSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
class HolidayViewSet(viewsets.ModelViewSet):
    queryset = Holiday.objects.all()  # <-- Add this line
    serializer_class = HolidaySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        year = self.request.query_params.get('year')
        if year is not None:
            try:
                year = int(year)
            except ValueError:
                year = datetime.now().year
            # Ensure holidays for this year exist in the database
            self.ensure_holidays_for_year(year)
            return Holiday.objects.filter(date__year=year).order_by('date')
        else:
            # Optionally, auto-add for current year if not already in DB
            self.ensure_holidays_for_year(datetime.now().year)
            return Holiday.objects.all().order_by('date')

    @staticmethod
    def ensure_holidays_for_year(year):
        us_holidays = pyholidays.US(years=year)
        for date, name in us_holidays.items():
            Holiday.objects.get_or_create(
                name=name,
                date=date,
                defaults={'is_recognized': True}  # set to False if you want unchecked by default
            )
