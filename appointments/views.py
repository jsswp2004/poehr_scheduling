from rest_framework import viewsets, permissions
from .models import Appointment, EnvironmentSetting, Holiday, ClinicEvent
from .serializers import AppointmentSerializer,AvailabilitySerializer, EnvironmentSettingSerializer, HolidaySerializer, ClinicEventSerializer
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
import csv
from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser

from .models import Appointment

class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        print("User:", user, "Role field:", getattr(user, 'role', None))

        # === ADDED: System Admin sees all organizations ===
        if user.role == 'system_admin':
            queryset = Appointment.objects.all().order_by('appointment_datetime')
        else:
            # Start by limiting to the user's organization
            queryset = Appointment.objects.filter(
                organization=user.organization
            ).order_by('appointment_datetime')

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
                pass  # ✅ Allow access to all appointments for their org        return queryset

    def perform_create(self, serializer):
        # Server-side validation for availability
        appointment_datetime = serializer.validated_data.get('appointment_datetime')
        duration_minutes = serializer.validated_data.get('duration_minutes', 30)
        provider_id = self.request.data.get('provider')
        
        if appointment_datetime and provider_id and duration_minutes:
            # Check if appointment time conflicts with provider's availability
            appointment_start = appointment_datetime
            appointment_end = appointment_start + timedelta(minutes=duration_minutes)
            
            # First, check if doctor has ANY availability scheduled for this time
            any_availability = Availability.objects.filter(
                doctor_id=provider_id,
                start_time__lt=appointment_end,
                end_time__gt=appointment_start
            )
            
            if not any_availability.exists():
                from rest_framework import serializers as rest_serializers
                # Get doctor name for better error message
                try:
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    doctor = User.objects.get(id=provider_id)
                    doctor_name = f"Dr. {doctor.first_name} {doctor.last_name}".strip()
                    if not doctor.first_name and not doctor.last_name:
                        doctor_name = f"Dr. {doctor.username}"
                except:
                    doctor_name = "The selected doctor"
                
                raise rest_serializers.ValidationError(
                    f"{doctor_name} is not scheduled for {appointment_start.strftime('%A, %B %d, %Y')}. "
                    f"Please select a different date or time when the doctor is available."
                )
            
            # Then, check if any of the overlapping availability is blocked
            blocked_availabilities = any_availability.filter(is_blocked=True)
            
            if blocked_availabilities.exists():
                from rest_framework import serializers as rest_serializers
                raise rest_serializers.ValidationError(
                    "Cannot schedule appointment during provider's blocked time. Please select another time."
                )

        provider_id = self.request.data.get('provider')
        organization = None
        provider = None
        if provider_id:
            try:
                User = apps.get_model(settings.AUTH_USER_MODEL)
                provider = User.objects.get(id=provider_id)
                organization = provider.organization
            except User.DoesNotExist:
                pass        # Default patient logic
        user = self.request.user
        patient = user
        if user.role in ['registrar', 'admin', 'system_admin']:
            patient_id = self.request.data.get('patient')
            if patient_id:
                try:
                    User = apps.get_model(settings.AUTH_USER_MODEL)
                    patient = User.objects.get(id=patient_id)
                except User.DoesNotExist:
                    raise ValueError("Patient not found.")
        
        appointment = serializer.save(patient=patient, provider=provider, organization=organization)
        
        # ✅ Send email notification to organization and system admins
        # Import here to avoid circular imports
        from users.serializers import get_admin_emails
        
        # Use the appointment organization, or fall back to user's organization
        notification_org = organization or self.request.user.organization
        admin_emails = get_admin_emails(organization=notification_org)
        
        if admin_emails:
            org_name = notification_org.name if notification_org else 'Unknown Organization'
            provider_name = f"Dr. {provider.first_name} {provider.last_name}" if provider else "TBD"
            patient_name = f"{patient.first_name} {patient.last_name}" if patient else "Unknown Patient"
            
            # Determine who created the appointment for better messaging
            if self.request.user.role == 'patient':
                created_by_text = f"by {self.request.user.get_full_name()}"
                subject = f"📅 New Appointment from {self.request.user.get_full_name()}"
            else:
                created_by_text = f"by {self.request.user.get_full_name()} ({self.request.user.role}) for {patient_name}"
                subject = f"📅 New Appointment Created by {self.request.user.role.title()}"
            
            message = (
                f"A new appointment has been scheduled {created_by_text}:\n\n"
                f"Patient: {patient_name}\n"
                f"Title: {appointment.title}\n"
                f"Date & Time: {appointment.appointment_datetime}\n"
                f"Doctor: {provider_name}\n"
                f"Organization: {org_name}\n"
                f"Description: {appointment.description or 'N/A'}"
            )
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                admin_emails,
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
        provider_id = self.request.data.get('provider')
        organization = None
        provider = None
        if provider_id:
            try:
                User = apps.get_model(settings.AUTH_USER_MODEL)
                provider = User.objects.get(id=provider_id)
                organization = provider.organization
            except User.DoesNotExist:
                pass
        updated = serializer.save(provider=provider if provider else None, organization=organization)
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

            # Check if slot is taken by existing appointment
            is_taken = Appointment.objects.filter(
                provider_id=doctor_id,
                appointment_datetime=slot_time
            ).exists()

            if is_taken:
                continue

            # Check if slot conflicts with blocked availability
            # Default appointment duration is 30 minutes
            appointment_duration = 30
            slot_end_time = slot_time + timedelta(minutes=appointment_duration)
            
            is_blocked = Availability.objects.filter(
                doctor_id=doctor_id,
                is_blocked=True,
                start_time__lt=slot_end_time,
                end_time__gt=slot_time
            ).exists()

            if not is_blocked:
                slots.append(slot_time)
                if len(slots) == max_slots:
                    break

        days_checked += 1

    return Response([timezone.localtime(s).isoformat() for s in slots])

class ClinicEventViewSet(viewsets.ModelViewSet):
    queryset = ClinicEvent.objects.filter(is_active=True)
    serializer_class = ClinicEventSerializer
    permission_classes = [permissions.IsAuthenticated]  # Or adjust as needed

class AvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'system_admin':
            return Availability.objects.all().order_by('-start_time')
        return Availability.objects.filter(organization=user.organization).order_by('-start_time')

    def perform_create(self, serializer):
        organization = self.request.user.organization

        # Save the initial availability
        availability = serializer.save(organization=organization)

        recurrence = availability.recurrence
        start = availability.start_time
        end = availability.end_time
        doctor = availability.doctor
        is_blocked = availability.is_blocked
        end_date_limit = availability.recurrence_end_date

        recurrence_count = {
            'daily': 179,     # ~6 months
            'weekly': 59,     # ~1 year
            'monthly': 11,    # ~1 year
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

            # Stop if recurrence_end_date is set and we're past it
            if end_date_limit and next_start.date() > end_date_limit:
                break
    
        # 👉 Skip Saturdays (5) and Sundays (6)
            if next_start.weekday() in (5, 6):
                continue

            # Deduplication logic: check if this slot exists before creating!
            exists = Availability.objects.filter(
                doctor=doctor,
                start_time=next_start,
                end_time=next_end,
                is_blocked=is_blocked,
                organization=organization
            ).exists()

            if not exists:
                Availability.objects.create(
                    doctor=doctor,
                    start_time=next_start,
                    end_time=next_end,
                    is_blocked=is_blocked,
                    recurrence='none',  # avoid chaining
                    organization=organization
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
            return Holiday.objects.filter(date__year=year, suppressed=False).order_by('date')
        else:
            # Optionally, auto-add for current year if not already in DB
            self.ensure_holidays_for_year(datetime.now().year)
            return Holiday.objects.filter(suppressed=False).order_by('date')

    @staticmethod
    def ensure_holidays_for_year(year):
        us_holidays = pyholidays.US(years=year)
        for date, name in us_holidays.items():
            Holiday.objects.get_or_create(
                name=name,
                date=date,
                defaults={'is_recognized': True, 'suppressed': False}  # set to False if you want unchecked by default
            )

class DownloadClinicEventsTemplate(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="clinic_events_template.csv"'

        writer = csv.writer(response)
        writer.writerow(['name', 'description', 'is_active'])  # Header row

        return response

class UploadClinicEventsCSV(APIView):
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file provided."}, status=400)

        decoded_file = file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(decoded_file)

        created_count = 0
        for row in reader:
            ClinicEvent.objects.create(
                name=row.get('name', '').strip(),
                description=row.get('description', '').strip(),
                is_active=row.get('is_active', 'true').strip().lower() in ['true', '1', 'yes']
            )
            created_count += 1

        return Response({"message": f"{created_count} clinic events uploaded successfully."})

class DownloadAvailabilityTemplate(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="availability_template.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'doctor_username', 'start_time', 'end_time', 'is_blocked', 'recurrence', 'recurrence_end_date', 'organization'
        ])
        return response

class UploadAvailabilityCSV(APIView):
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file provided."}, status=400)
        decoded_file = file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(decoded_file)
        from .models import Availability
        from users.models import CustomUser, Organization
        created_count = 0
        updated_count = 0
        errors = []
        for row in reader:
            doctor_username = row.get('doctor_username', '').strip()
            start_time = row.get('start_time', '').strip()
            end_time = row.get('end_time', '').strip()
            is_blocked = row.get('is_blocked', 'false').strip().lower() in ['true', '1', 'yes']
            recurrence = row.get('recurrence', '').strip()
            recurrence_end_date = row.get('recurrence_end_date', '').strip()
            org_name = row.get('organization', '').strip()
            # Validate doctor
            try:
                doctor = CustomUser.objects.get(username=doctor_username, role='doctor')
            except CustomUser.DoesNotExist:
                errors.append(f"Doctor '{doctor_username}' not found.")
                continue
            # Validate org
            org = None
            if org_name:
                org, _ = Organization.objects.get_or_create(name=org_name)
            # Try to find existing availability
            avail, created = Availability.objects.get_or_create(
                doctor=doctor,
                start_time=start_time,
                end_time=end_time,
                defaults={
                    'is_blocked': is_blocked,
                    'recurrence': recurrence,
                    'recurrence_end_date': recurrence_end_date or None,
                    'organization': org or doctor.organization
                }
            )
            if not created:
                avail.is_blocked = is_blocked
                avail.recurrence = recurrence
                avail.recurrence_end_date = recurrence_end_date or None
                avail.organization = org or doctor.organization
                avail.save()
                updated_count += 1
            else:
                created_count += 1
        return Response({
            "message": f"{created_count} availabilities created, {updated_count} updated.",
            "errors": errors
        })
