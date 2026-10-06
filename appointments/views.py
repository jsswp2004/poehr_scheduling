# filepath: c:\Users\jsswp\source\poehr_scheduling\poehr_scheduling\appointments\views.py
from rest_framework import viewsets, permissions
from .models import (
    Appointment,
    EnvironmentSetting,
    Holiday,
    ClinicEvent,
    AutoEmail,
    AutoSMS,
    ClinicalNote,
    NoteTemplate,
    Dictionary,
    VitalSignsFlowsheet,
    FlowsheetTemplate,
    Orderable,
    OrderSet,
    Order,
    ORDER_PRIORITY_CHOICES,
)
from .serializers import (
    AppointmentSerializer,
    AvailabilitySerializer,
    EnvironmentSettingSerializer,
    HolidaySerializer,
    ClinicEventSerializer,
    AutoEmailSerializer,
    AutoSMSSerializer,
    ClinicalNoteSerializer,
    NoteTemplateSerializer,
    NoteTemplateAdminSerializer,
    DictionaryAdminSerializer,
    VitalSignsFlowsheetSerializer,
    FlowsheetTemplateSerializer,
    FlowsheetTemplateAdminSerializer,
    OrderableSerializer,
    OrderableAdminSerializer,
    OrderSetSerializer,
    OrderSetAdminSerializer,
    OrderSerializer,
    OrderInterfaceUpdateSerializer,
)
from . import orders_workflow as ow
from .orders_csv import parse_orderable_csv, export_orderable_csv, sample_orderable_csv
from datetime import timedelta
from dateutil.relativedelta import relativedelta
from django.apps import apps  # Import apps to dynamically get the model
from django.conf import settings  # Import settings to access AUTH_USER_MODEL
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import AllowAny
import secrets
from datetime import timedelta
from django.utils import timezone
from django.utils.timezone import make_aware
from datetime import datetime as dt
from datetime import datetime, timedelta, time as dt_time
from .models import Availability
from django.core.mail import send_mail
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework import status
import holidays as pyholidays
import csv
import re
import logging
from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser
from .permissions import (
    IsAdminOrSystemAdmin,
    CanAccessClinicalNotes,
    CanAuthorClinicalNoteType,
    IsNoteTemplateAdmin,
    CanAccessVitalSignsFlowsheets,
    IsFlowsheetTemplateAdmin,
    CanAccessOrders,
)
from users.permissions import HasRight
from users.rights import user_has_right
from .note_template_csv import decode_upload, parse_template_csv
from .flowsheet_template_csv import parse_flowsheet_csv, sample_csv_text as sample_flowsheet_csv_text
from .flowsheet_template_import import apply_flowsheet_import, export_flowsheet_csv
from .note_template_import import apply_template_import, export_template_csv
from appointments.cron import send_patient_reminders, send_patient_sms_reminders
from rest_framework.permissions import IsAdminUser
from django.db.models import Q  # Add Q import for complex queries

logger = logging.getLogger(__name__)

from .models import Appointment

# Import User model properly
User = apps.get_model(settings.AUTH_USER_MODEL)


# ED and inpatient visits keep a chart appointment so orders and flowsheets have something to attach to;
# the calendar, open slots and check-in only deal with outpatient visits.
INPATIENT_CHART = Q(registration__care_setting__in=("emergency", "acute"))


class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        print("User:", user, "Role field:", getattr(user, "role", None))

        # === ADDED: System Admin sees all organizations ===
        if user.role == "system_admin":
            queryset = Appointment.all_objects.all().order_by("appointment_datetime")
        else:
            # Start by limiting to the user's organization
            queryset = Appointment.objects.filter(
                organization=user.organization
            ).order_by("appointment_datetime")

            # Optional date filter from query params
            date_str = self.request.query_params.get("date")
            if date_str:
                try:
                    date_obj = parse_date(date_str)
                    if date_obj:
                        start_of_day = make_aware(dt.combine(date_obj, dt.min.time()))
                        end_of_day = make_aware(dt.combine(date_obj, dt.max.time()))
                        queryset = queryset.filter(
                            appointment_datetime__range=(start_of_day, end_of_day)
                        )
                except Exception as e:
                    print("Date parsing failed:", e)

            # Role-based filtering
            if user.role == "patient":
                queryset = queryset.filter(patient=user)
            elif user.role == "doctor":
                queryset = queryset.filter(
                    provider=user
                )  # optional: show only their own patients
            elif user.role in ["registrar", "admin", "nurse"]:
                pass  # ✅ Allow access to all appointments for their org

            # Optional explicit patient filter for staff roles (e.g. the
            # patient detail page pulling a specific patient's visit
            # history to attach a clinical note to).
            patient_id = self.request.query_params.get("patient")
            if patient_id and user.role != "patient":
                queryset = queryset.filter(patient_id=patient_id)
            elif self.action == "list":
                # The calendar is for outpatient visits only. ED and inpatient visits keep a chart
                # appointment (for orders and flowsheets) that is reachable by patient or by id.
                queryset = queryset.exclude(INPATIENT_CHART)

        # Optional free-text search (?search=...), used by the admin
        # appointment-search page. This used to be done by fetching every
        # appointment in the organization to the browser and filtering with
        # Array.filter() client-side -- fine with a handful of demo rows,
        # but it means every search re-downloads the entire appointments
        # table (hundreds of KB and growing) and runs it through gunicorn's
        # single worker, which is slow and was the direct cause of a stale
        # request being able to clobber a newer one's results. Filtering
        # here means only matching rows ever leave the database.
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(status__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(provider__first_name__icontains=search)
                | Q(provider__last_name__icontains=search)
            ).distinct()

        # Optional cap (?limit=...), used by the admin appointment-search
        # page's initial load: rather than loading the entire org's
        # appointments table when the page first opens (the same
        # full-table-download problem the search box used to have), it
        # asks for just the most recent N rows. Only takes effect when no
        # search term was given -- a search should still return every
        # matching row, not just the newest 50 of them.
        limit = self.request.query_params.get("limit")
        if limit and not search:
            try:
                limit = int(limit)
                if limit > 0:
                    queryset = queryset.order_by("-appointment_datetime")[:limit]
            except (TypeError, ValueError):
                pass

        return queryset

    def perform_create(self, serializer):
        # Check subscription-based appointment limits
        user = self.request.user
        if hasattr(user, "subscription_tier") and user.subscription_tier == "basic":
            # Professional plan: 200 appointments per month limit
            from datetime import datetime
            from django.utils import timezone

            current_month_start = timezone.now().replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            current_month_appointments = Appointment.objects.filter(
                patient=user, appointment_datetime__gte=current_month_start
            ).count()

            if current_month_appointments >= 200:
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied(
                    {
                        "error": "Professional plan appointment limit reached",
                        "message": "You have reached your monthly limit of 200 appointments. Upgrade to Clinic plan for unlimited appointments.",
                        "current_count": current_month_appointments,
                        "limit": 200,
                        "upgrade_url": "/pricing?plan=clinic",
                    }
                )

        # Server-side validation for availability
        appointment_datetime = serializer.validated_data.get("appointment_datetime")
        duration_minutes = serializer.validated_data.get("duration_minutes", 30)
        provider_id = self.request.data.get("provider")

        if appointment_datetime and provider_id and duration_minutes:
            # Check if appointment time conflicts with provider's blocked availability
            appointment_start = appointment_datetime
            appointment_end = appointment_start + timedelta(minutes=duration_minutes)

            blocked_availabilities = Availability.objects.filter(
                doctor_id=provider_id,
                is_blocked=True,
                start_time__lt=appointment_end,
                end_time__gt=appointment_start,
            )

            if blocked_availabilities.exists():
                from rest_framework import serializers as rest_serializers

                raise rest_serializers.ValidationError(
                    "Cannot schedule appointment during provider's blocked time. Please select another time."
                )

        provider_id = self.request.data.get("provider")
        organization = None
        provider = None
        if provider_id:
            try:
                provider = User.objects.get(id=provider_id)
                organization = provider.organization
            except User.DoesNotExist:
                pass

        # Default patient logic
        user = self.request.user
        patient = user
        if user_has_right(user, "appointments.create_for_others"):
            patient_id = self.request.data.get("patient")
            if patient_id:
                try:
                    patient = User.objects.get(id=patient_id)
                except User.DoesNotExist:
                    raise ValueError("Patient not found.")

        # Patient-submitted appointments start as a request awaiting admin
        # approval, rather than going live immediately. Staff-created
        # appointments (registrar/admin/doctor/nurse booking on a patient's
        # behalf) keep the existing default of going straight to "scheduled".
        is_patient_request = self.request.user.role == "patient"
        save_kwargs = {"patient": patient, "provider": provider, "organization": organization}
        if is_patient_request:
            save_kwargs["status"] = "pending"
        appointment = serializer.save(**save_kwargs)

        # ✅ Send email notification to organization and system admins
        # Import here to avoid circular imports
        from users.serializers import get_admin_emails

        # Use the appointment organization, or fall back to user's organization
        notification_org = organization or self.request.user.organization
        admin_emails = get_admin_emails(organization=notification_org)

        if admin_emails:
            org_name = (
                notification_org.name if notification_org else "Unknown Organization"
            )
            provider_name = (
                f"Dr. {provider.first_name} {provider.last_name}" if provider else "TBD"
            )
            patient_name = (
                f"{patient.first_name} {patient.last_name}"
                if patient
                else "Unknown Patient"
            )

            # Determine who created the appointment for better messaging
            if self.request.user.role == "patient":
                created_by_text = f"by {self.request.user.get_full_name()}"
                subject = f"📅 New Appointment Request from {self.request.user.get_full_name()}"
            else:
                created_by_text = f"by {self.request.user.get_full_name()} ({self.request.user.role}) for {patient_name}"
                subject = (
                    f"📅 New Appointment Created by {self.request.user.role.title()}"
                )

            if is_patient_request:
                message = (
                    f"A new appointment REQUEST has been submitted {created_by_text} "
                    f"and is awaiting your approval:\n\n"
                    f"Patient: {patient_name}\n"
                    f"Title: {appointment.title}\n"
                    f"Requested Date & Time: {appointment.appointment_datetime}\n"
                    f"Doctor: {provider_name}\n"
                    f"Organization: {org_name}\n"
                    f"Description: {appointment.description or 'N/A'}\n\n"
                    f"Review it under Pending Requests to approve or deny."
                )
            else:
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
                fail_silently=True,  # Changed to True to prevent SMTP errors from breaking appointment creation
            )  # Handle recurrence logic
        try:
            recurrence = appointment.recurrence

            # Only process recurrence if it's not 'none'
            if recurrence and recurrence != "none":
                start_time = appointment.appointment_datetime
                duration = appointment.duration_minutes
                recurrence_end_date = appointment.recurrence_end_date

                # Fetch blocked days and holidays
                try:
                    env = EnvironmentSetting.objects.first()
                    blocked_days = env.blocked_days if env else []
                except Exception:
                    blocked_days = []

                holidays = set(
                    Holiday.objects.filter(
                        is_recognized=True, suppressed=False
                    ).values_list("date", flat=True)
                )

                repeats = {
                    "daily": 179,
                    "weekly": 59,
                    "monthly": 11,
                }
                count = repeats.get(recurrence, 0)

                for i in range(1, count + 1):
                    if recurrence == "daily":
                        next_time = start_time + timedelta(days=i)
                    elif recurrence == "weekly":
                        next_time = start_time + timedelta(weeks=i)
                    elif recurrence == "monthly":
                        next_time = start_time + relativedelta(months=i)
                    else:
                        continue

                    # Stop if recurrence_end_date is set and we're past it
                    if recurrence_end_date and next_time.date() > recurrence_end_date:
                        break
                    # Skip weekends
                    if next_time.weekday() in (5, 6):
                        continue
                    # Skip blocked days (0=Sun, ..., 6=Sat)
                    if next_time.weekday() in blocked_days:
                        continue
                    # Skip holidays
                    if next_time.date() in holidays:
                        continue
                    # Deduplication: don't create if already exists
                    exists = Appointment.objects.filter(
                        provider=provider,
                        appointment_datetime=next_time,
                        patient=appointment.patient,
                        title=appointment.title,
                    ).exists()
                    if not exists:
                        Appointment.objects.create(
                            patient=appointment.patient,
                            title=appointment.title,
                            description=appointment.description,
                            appointment_datetime=next_time,
                            duration_minutes=duration,
                            recurrence="none",  # Prevent chaining
                            provider=provider,
                            organization=organization,
                        )
        except Exception as e:
            import traceback

            print("Error in appointment recurrence logic:", e)
            traceback.print_exc()
            raise Exception(f"Error in appointment recurrence logic: {e}")

    def perform_update(self, serializer):
        # A patient must never be able to move their own appointment out of
        # "pending" by PATCHing status directly -- the only sanctioned way
        # out of "pending" is the approve/deny actions below, which are
        # gated to staff with the appointments.manage_requests right. Strip
        # any status the patient tries to send and leave the current value
        # untouched.
        if self.request.user.role == "patient" and "status" in serializer.validated_data:
            serializer.validated_data.pop("status", None)

        # IMPORTANT: this must only touch provider/organization when the
        # request actually included a "provider" field (e.g. the full
        # Edit Appointment form, which lets staff reassign the provider).
        # A partial PATCH that omits "provider" -- like the Today's
        # Appointments status dropdown, which only sends {status: ...} --
        # used to fall into the "else" branch below and unconditionally
        # save(provider=None, organization=None), silently NULLing out the
        # appointment's organization. Since Appointment.objects is tenant-
        # scoped to organization=<current org>, that made the appointment
        # vanish from every future list for that org even though the row
        # still existed in the database. Only reassign provider/organization
        # when "provider" was actually part of this request; otherwise leave
        # both fields exactly as they already are.
        if "provider" in self.request.data:
            provider_id = self.request.data.get("provider")
            provider = None
            organization = None
            if provider_id:
                try:
                    provider = User.objects.get(id=provider_id)
                    organization = provider.organization
                except User.DoesNotExist:
                    pass
            updated = serializer.save(provider=provider, organization=organization)
        else:
            updated = serializer.save()
        print(f"✅ Saved duration_minutes: {updated.duration_minutes}")

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[HasRight("appointments.manage_requests")],
    )
    def approve(self, request, pk=None):
        """Approve a pending patient appointment request: pending -> scheduled."""
        appointment = self.get_object()
        if appointment.status != "pending":
            return Response(
                {"error": f"Only pending requests can be approved (current status: {appointment.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        appointment.status = "scheduled"
        appointment.save(update_fields=["status"])

        if appointment.patient and appointment.patient.email:
            provider_name = (
                f"Dr. {appointment.provider.first_name} {appointment.provider.last_name}"
                if appointment.provider
                else "TBD"
            )
            send_mail(
                "✅ Your appointment request has been approved",
                (
                    f"Good news -- your appointment request has been approved and is now confirmed:\n\n"
                    f"Title: {appointment.title}\n"
                    f"Date & Time: {appointment.appointment_datetime}\n"
                    f"Doctor: {provider_name}\n"
                    f"Description: {appointment.description or 'N/A'}"
                ),
                settings.DEFAULT_FROM_EMAIL,
                [appointment.patient.email],
                fail_silently=True,
            )

        serializer = self.get_serializer(appointment)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[HasRight("appointments.manage_requests")],
    )
    def deny(self, request, pk=None):
        """Deny a pending patient appointment request. Rather than leaving a
        "cancelled" row behind (which still showed up on the Calendar View
        and other appointment lists), a denied request is deleted outright
        -- it was never a real appointment, just a request that didn't get
        approved."""
        appointment = self.get_object()
        if appointment.status != "pending":
            return Response(
                {"error": f"Only pending requests can be denied (current status: {appointment.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get("reason", "").strip()

        # Capture what we need for the email/response before deleting.
        appointment_id = appointment.id
        patient_email = appointment.patient.email if appointment.patient else None
        title = appointment.title
        appointment_datetime = appointment.appointment_datetime

        appointment.delete()

        if patient_email:
            reason_text = f"\n\nReason: {reason}" if reason else ""
            send_mail(
                "Your appointment request was not approved",
                (
                    f"Your requested appointment could not be approved:\n\n"
                    f"Title: {title}\n"
                    f"Requested Date & Time: {appointment_datetime}\n"
                    f"{reason_text}\n\n"
                    f"Please contact us or submit a new request for a different time."
                ),
                settings.DEFAULT_FROM_EMAIL,
                [patient_email],
                fail_silently=True,
            )

        return Response({"id": appointment_id, "deleted": True})


@api_view(["GET"])
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
            is_taken = (
                Appointment.objects.filter(provider_id=doctor_id, appointment_datetime=slot_time)
                .exclude(INPATIENT_CHART)
                .exists()
            )

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
                end_time__gt=slot_time,
            ).exists()

            if not is_blocked:
                slots.append(slot_time)
                if len(slots) == max_slots:
                    break

        days_checked += 1

    return Response([timezone.localtime(s).isoformat() for s in slots])


class ClinicEventViewSet(viewsets.ModelViewSet):
    serializer_class = ClinicEventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # System admins can see clinic events from all organizations
        if user.role == "system_admin":
            return ClinicEvent.objects.filter(is_active=True).order_by("name")

        # Regular users only see clinic events from their organization
        return ClinicEvent.objects.filter(
            organization=user.organization, is_active=True
        ).order_by("name")

    def perform_create(self, serializer):
        user = self.request.user
        # Auto-assign the organization for non-system admins
        if user.role != "system_admin":
            serializer.save(organization=user.organization)
        else:
            # System admins can specify organization or it defaults to their own
            serializer.save()


class AvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "system_admin":
            return Availability.objects.all().order_by("-start_time")
        return Availability.objects.filter(organization=user.organization).order_by(
            "-start_time"
        )

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
            "daily": 179,  # ~6 months
            "weekly": 59,  # ~1 year
            "monthly": 11,  # ~1 year
        }

        count = recurrence_count.get(recurrence, 0)

        for i in range(1, count + 1):
            if recurrence == "daily":
                delta = timedelta(days=i)
            elif recurrence == "weekly":
                delta = timedelta(weeks=i)
            elif recurrence == "monthly":
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
                organization=organization,
            ).exists()

            if not exists:
                Availability.objects.create(
                    doctor=doctor,
                    start_time=next_start,
                    end_time=next_end,
                    is_blocked=is_blocked,
                    recurrence="none",  # avoid chaining
                    organization=organization,
                )


class EnvironmentSettingView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated()]  # All logged-in users can read
        return [permissions.IsAuthenticated(), HasRight("settings.manage")()]

    def get(self, request):
        # Determine which organization to fetch settings for
        target_organization = None

        # If system admin and organization_id is provided, use that organization
        if hasattr(request.user, "role") and request.user.role == "system_admin":
            org_id = request.query_params.get("organization_id")
            if org_id:
                try:
                    from users.models import Organization

                    target_organization = Organization.objects.get(id=org_id)
                except Organization.DoesNotExist:
                    return Response(
                        {"error": "Organization not found"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        # Fallback to user's organization
        if not target_organization:
            target_organization = request.user.organization

        # If still no organization, create a default one for the user
        if not target_organization:
            from users.models import Organization

            # Create a default organization
            default_org, created = Organization.objects.get_or_create(
                name="Default Organization",
                defaults={
                    "address": "123 Main St",
                    "city": "Default City",
                    "state": "CA",
                    "zipcode": "12345",
                },
            )

            # Assign user to the default organization
            request.user.organization = default_org
            request.user.save()
            target_organization = default_org

        if not target_organization:
            return Response(
                {"error": "No organization found"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Get or create the environment settings for this organization
        env_obj, env_created = EnvironmentSetting.objects.get_or_create(
            organization=target_organization,
            defaults={"blocked_days": [0, 6]},  # Default: weekends blocked
        )
        env_serializer = EnvironmentSettingSerializer(env_obj)

        # Get auto email settings for the target organization
        auto_email_obj = None
        if target_organization:
            auto_email_obj = AutoEmail.objects.filter(
                organization=target_organization
            ).first()

        # If no organization-specific settings, try to get global settings
        if not auto_email_obj:
            auto_email_obj = AutoEmail.objects.filter(organization__isnull=True).first()

        # If no settings at all, create default settings
        if not auto_email_obj:
            auto_email_obj = AutoEmail.objects.create(
                organization=target_organization,
                auto_message_frequency="weekly",
                auto_message_day_of_week=1,  # Monday
                auto_message_start_date=timezone.now().date() + timedelta(days=1),
            )

        auto_email_serializer = AutoEmailSerializer(auto_email_obj)

        # Combine the response
        response_data = {**env_serializer.data, **auto_email_serializer.data}

        return Response(response_data)

    def post(self, request):
        # Determine which organization to save settings for
        target_organization = None

        # If system admin and organization_id is provided, use that organization
        if hasattr(request.user, "role") and request.user.role == "system_admin":
            org_id = request.data.get("organization_id")
            if org_id:
                try:
                    from users.models import Organization

                    target_organization = Organization.objects.get(id=org_id)
                except Organization.DoesNotExist:
                    return Response(
                        {"error": "Organization not found"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        # Fallback to user's own organization
        if not target_organization:
            target_organization = request.user.organization

        if not target_organization:
            return Response(
                {"error": "No organization found"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Process environment settings
        env_obj, env_created = EnvironmentSetting.objects.get_or_create(
            organization=target_organization,
            defaults={"blocked_days": [0, 6]},  # Default: weekends blocked
        )
        env_data = {k: v for k, v in request.data.items() if k in ["blocked_days"]}

        env_serializer = EnvironmentSettingSerializer(
            env_obj, data=env_data, partial=True
        )
        if env_serializer.is_valid():
            env_serializer.save()
        else:
            return Response(env_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Process auto email settings
        auto_email_data = {
            k: v
            for k, v in request.data.items()
            if k
            in [
                "auto_message_frequency",
                "auto_message_day_of_week",
                "auto_message_start_date",
                "is_active",
            ]
        }

        if auto_email_data:
            # Try to get organization-specific settings first
            auto_email_obj = None
            if target_organization:
                auto_email_obj = AutoEmail.objects.filter(
                    organization=target_organization
                ).first()

            # If no organization-specific settings, try to get or create global settings
            if not auto_email_obj:
                auto_email_obj, created = AutoEmail.objects.get_or_create(
                    organization=target_organization,
                    defaults={
                        "auto_message_frequency": "weekly",
                        "auto_message_day_of_week": 1,  # Monday
                        "auto_message_start_date": timezone.now().date()
                        + timedelta(days=1),
                    },
                )
            auto_email_serializer = AutoEmailSerializer(
                auto_email_obj, data=auto_email_data, partial=True
            )
            if auto_email_serializer.is_valid():
                auto_email_obj = auto_email_serializer.save()
                # Settings saved - django-cron will use these settings on next run
            else:
                return Response(
                    auto_email_serializer.errors, status=status.HTTP_400_BAD_REQUEST
                )

        # Combine the response
        response_data = {**env_serializer.data}

        # Add auto email serializer data if available
        if "auto_email_serializer" in locals():
            response_data.update(auto_email_serializer.data)
        return Response(response_data)


class SMSSettingView(APIView):
    """
    Fully independent settings endpoint for automatic SMS reminders.

    This is deliberately separate from EnvironmentSettingView / AutoEmail:
    Email and SMS auto-reminders used to share a single AutoEmail row per
    organization, which meant toggling "Enabled" (or changing the
    frequency/day/start date) on one channel silently changed the other.
    This endpoint reads/writes its own AutoSMS row per organization, so
    the SMS schedule and its "Enabled" toggle are fully independent of
    email's.
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated()]  # All logged-in users can read
        return [permissions.IsAuthenticated(), HasRight("settings.manage")()]

    def _resolve_organization(self, request, org_id_source):
        target_organization = None

        if hasattr(request.user, "role") and request.user.role == "system_admin":
            org_id = org_id_source.get("organization_id")
            if org_id:
                from users.models import Organization

                try:
                    target_organization = Organization.objects.get(id=org_id)
                except Organization.DoesNotExist:
                    return None, Response(
                        {"error": "Organization not found"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        if not target_organization:
            target_organization = request.user.organization

        if not target_organization:
            from users.models import Organization

            default_org, created = Organization.objects.get_or_create(
                name="Default Organization",
                defaults={
                    "address": "123 Main St",
                    "city": "Default City",
                    "state": "CA",
                    "zipcode": "12345",
                },
            )
            request.user.organization = default_org
            request.user.save()
            target_organization = default_org

        return target_organization, None

    def get(self, request):
        target_organization, error_response = self._resolve_organization(
            request, request.query_params
        )
        if error_response:
            return error_response
        if not target_organization:
            return Response(
                {"error": "No organization found"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Get auto SMS settings for the target organization
        auto_sms_obj = AutoSMS.objects.filter(
            organization=target_organization
        ).first()

        # If no organization-specific settings, try to get global settings
        if not auto_sms_obj:
            auto_sms_obj = AutoSMS.objects.filter(organization__isnull=True).first()

        # If no settings at all, create default settings
        if not auto_sms_obj:
            auto_sms_obj = AutoSMS.objects.create(
                organization=target_organization,
                auto_message_frequency="weekly",
                auto_message_day_of_week=1,  # Monday
                auto_message_start_date=timezone.now().date() + timedelta(days=1),
            )

        auto_sms_serializer = AutoSMSSerializer(auto_sms_obj)
        return Response(auto_sms_serializer.data)

    def post(self, request):
        target_organization, error_response = self._resolve_organization(
            request, request.data
        )
        if error_response:
            return error_response
        if not target_organization:
            return Response(
                {"error": "No organization found"}, status=status.HTTP_400_BAD_REQUEST
            )

        auto_sms_data = {
            k: v
            for k, v in request.data.items()
            if k
            in [
                "auto_message_frequency",
                "auto_message_day_of_week",
                "auto_message_start_date",
                "is_active",
            ]
        }

        auto_sms_obj = AutoSMS.objects.filter(
            organization=target_organization
        ).first()

        if not auto_sms_obj:
            auto_sms_obj, created = AutoSMS.objects.get_or_create(
                organization=target_organization,
                defaults={
                    "auto_message_frequency": "weekly",
                    "auto_message_day_of_week": 1,  # Monday
                    "auto_message_start_date": timezone.now().date()
                    + timedelta(days=1),
                },
            )

        auto_sms_serializer = AutoSMSSerializer(
            auto_sms_obj, data=auto_sms_data, partial=True
        )
        if auto_sms_serializer.is_valid():
            auto_sms_serializer.save()
        else:
            return Response(
                auto_sms_serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )

        return Response(auto_sms_serializer.data)


class HolidayViewSet(viewsets.ModelViewSet):
    queryset = Holiday.objects.all()  # <-- Add this line
    serializer_class = HolidaySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # Anyone authenticated can view the holiday calendar; only users
        # with the "holidays.manage" right can create/edit/delete holidays.
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), HasRight("holidays.manage")()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user

        year = self.request.query_params.get("year")
        if year is not None:
            try:
                year = int(year)
            except ValueError:
                year = datetime.now().year
            # Ensure holidays for this year exist in the database for global holidays
            self.ensure_holidays_for_year(year)

            # System admins see ALL holidays from ALL organizations
            if user.role == "system_admin":
                return Holiday.objects.filter(
                    date__year=year, suppressed=False
                ).order_by("date")
            else:
                # Regular users see global holidays + their organization's holidays
                organization = user.organization
                return Holiday.objects.filter(
                    Q(organization__isnull=True)  # Global holidays (federal)
                    | Q(organization=organization),  # Organization-specific holidays
                    date__year=year,
                    suppressed=False,
                ).order_by("date")
        else:
            # Optionally, auto-add for current year if not already in DB
            self.ensure_holidays_for_year(datetime.now().year)

            # System admins see ALL holidays from ALL organizations
            if user.role == "system_admin":
                return Holiday.objects.filter(suppressed=False).order_by("date")
            else:
                # Regular users see global holidays + their organization's holidays
                organization = user.organization
                return Holiday.objects.filter(
                    Q(organization__isnull=True)  # Global holidays (federal)
                    | Q(organization=organization),  # Organization-specific holidays
                    suppressed=False,
                ).order_by("date")

    def perform_create(self, serializer):
        # Associate new holidays with user's organization (making them organization-specific)
        user = self.request.user

        # Use direct organization_id approach to bypass Django relationship issues
        if hasattr(user, "organization_id") and user.organization_id:
            # User has an organization - save holiday with organization_id
            # Import Organization model to get the actual object
            from users.models import Organization

            try:
                org = Organization.objects.get(id=user.organization_id)
                serializer.save(organization=org)
            except Organization.DoesNotExist:
                # Organization doesn't exist, save as global holiday
                serializer.save()
        else:
            # No organization_id, save as global holiday
            serializer.save()

    @staticmethod
    def ensure_holidays_for_year(year):
        """Create global federal holidays (organization=NULL) for the specified year."""
        us_holidays = pyholidays.US(years=year)
        for date, name in us_holidays.items():
            Holiday.objects.get_or_create(
                name=name,
                date=date,
                organization=None,  # Global holidays have no organization
                defaults={"is_recognized": True, "suppressed": False},
            )


class DownloadClinicEventsTemplate(APIView):
    permission_classes = [HasRight("csv.upload_clinic_events")]

    def get(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="clinic_events_template.csv"'
        )

        writer = csv.writer(response)
        writer.writerow(["name", "description", "is_active"])  # Header row

        return response


class UploadClinicEventsCSV(APIView):
    permission_classes = [HasRight("csv.upload_clinic_events")]
    parser_classes = [MultiPartParser]

    def post(self, request):
        logger.info("🔵 Starting clinic events CSV upload")

        try:
            file = request.FILES.get("file")
            if not file:
                logger.error("❌ No file provided in clinic events upload request")
                return Response({"error": "No file provided."}, status=400)

            logger.info(f"📁 File received: {file.name}, size: {file.size} bytes")

            # Check file encoding and content
            try:
                decoded_file = file.read().decode("utf-8").splitlines()
                logger.info(f"📄 File decoded successfully, {len(decoded_file)} lines")
            except UnicodeDecodeError as e:
                logger.error(f"❌ File encoding error: {str(e)}")
                return Response({"error": f"File encoding error: {str(e)}"}, status=400)

            # Parse CSV
            try:
                reader = csv.DictReader(decoded_file)
                logger.info(f"📊 CSV headers: {reader.fieldnames}")
            except Exception as e:
                logger.error(f"❌ CSV parsing error: {str(e)}")
                return Response({"error": f"CSV parsing error: {str(e)}"}, status=400)

            created_count = 0
            skipped_count = 0
            errors = []
            row_count = 0

            for row in reader:
                row_count += 1
                logger.info(f"🔄 Processing clinic event row {row_count}: {row}")

                try:
                    name = row.get("name", "").strip()
                    description = row.get("description", "").strip()
                    is_active = row.get("is_active", "true").strip().lower() in [
                        "true",
                        "1",
                        "yes",
                    ]

                    logger.info(
                        f"📋 Row data - Name: {name}, Description: {description}, Active: {is_active}"
                    )

                    # Skip rows with empty names
                    if not name:
                        error_msg = f"Row {row_count}: Skipped - Name field is empty"
                        logger.warning(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        skipped_count += 1
                        continue

                    # Get user's organization
                    user_organization = request.user.organization
                    logger.info(
                        f"👤 User organization: ID={user_organization.id if user_organization else 'None'}, Name='{user_organization.name if user_organization else 'None'}'"
                    )

                    # For system admins, allow organization_id to be specified in CSV
                    if request.user.role == "system_admin" and "organization_id" in row:
                        try:
                            org_id = int(row["organization_id"])
                            from users.models import Organization

                            user_organization = Organization.objects.get(id=org_id)
                            logger.info(
                                f"🔧 System admin uploading for organization: {user_organization.name} (ID: {user_organization.id})"
                            )
                        except (ValueError, Organization.DoesNotExist):
                            logger.warning(
                                f"⚠️ Invalid organization_id in row {row_count}, using user's organization"
                            )

                    if not user_organization:
                        error_msg = f"Row {row_count}: Skipped - User has no organization assigned"
                        logger.warning(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        skipped_count += 1
                        continue

                    # Check if clinic event with this name already exists for this organization
                    logger.info(
                        f"🔍 Checking for duplicates: name='{name}', org_id={user_organization.id}, org_name='{user_organization.name}'"
                    )

                    existing_events = ClinicEvent.objects.filter(
                        name=name, organization_id=user_organization.id
                    )
                    existing_count = existing_events.count()

                    logger.info(
                        f"🔍 Found {existing_count} existing events with name '{name}' in organization {user_organization.id}"
                    )

                    if existing_count > 0:
                        logger.info(
                            f"🔍 Existing events: {[e.id for e in existing_events]}"
                        )
                        error_msg = f"Row {row_count}: Skipped - Clinic event '{name}' already exists in your organization"
                        logger.warning(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        skipped_count += 1
                        continue

                    # Create clinic event with organization
                    try:
                        clinic_event = ClinicEvent.objects.create(
                            name=name,
                            description=description,
                            is_active=is_active,
                            organization=user_organization,
                        )
                        created_count += 1
                        logger.info(
                            f"✅ Created clinic event: {name} (ID: {clinic_event.id}) for organization: {user_organization.name}"
                        )

                    except Exception as e:
                        error_msg = f"Row {row_count}: Error creating clinic event '{name}' - {str(e)}"
                        logger.error(f"❌ {error_msg}")
                        errors.append(error_msg)
                        skipped_count += 1
                        continue

                except Exception as e:
                    error_msg = f"Unexpected error processing row {row_count}: {str(e)}"
                    logger.error(f"❌ {error_msg}")
                    errors.append(error_msg)
                    skipped_count += 1
                    continue

            logger.info(
                f"✅ Upload completed - Created: {created_count}, Skipped: {skipped_count}, Errors: {len(errors)}"
            )

            # Prepare response message
            message = f"Upload completed: {created_count} clinic events created"
            if skipped_count > 0:
                message += f", {skipped_count} rows skipped"

            response_data = {
                "message": message,
                "created_count": created_count,
                "skipped_count": skipped_count,
                "total_rows": row_count,
                "errors": errors,
            }

            return Response(response_data, status=200)

        except Exception as e:
            logger.error(
                f"❌ Critical error in clinic events upload: {str(e)}", exc_info=True
            )
            return Response({"error": f"Upload failed: {str(e)}"}, status=500)


class DownloadAvailabilityTemplate(APIView):
    permission_classes = [HasRight("csv.upload_availability")]

    def get(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="availability_template.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(
            [
                "doctor_username",
                "start_time",
                "end_time",
                "is_blocked",
                "recurrence",
                "recurrence_end_date",
                "organization",
            ]
        )
        return response


class UploadAvailabilityCSV(APIView):
    permission_classes = [HasRight("csv.upload_availability")]
    parser_classes = [MultiPartParser]

    def post(self, request):
        logger.info("🔵 Starting availability CSV upload")

        try:
            file = request.FILES.get("file")
            if not file:
                logger.error("❌ No file provided in availability upload request")
                return Response({"error": "No file provided."}, status=400)

            logger.info(f"📁 File received: {file.name}, size: {file.size} bytes")

            # Check file encoding and content
            try:
                decoded_file = file.read().decode("utf-8").splitlines()
                logger.info(f"📄 File decoded successfully, {len(decoded_file)} lines")
            except UnicodeDecodeError as e:
                logger.error(f"❌ File encoding error: {str(e)}")
                return Response({"error": f"File encoding error: {str(e)}"}, status=400)

            # Parse CSV
            try:
                reader = csv.DictReader(decoded_file)
                logger.info(f"📊 CSV headers: {reader.fieldnames}")
            except Exception as e:
                logger.error(f"❌ CSV parsing error: {str(e)}")
                return Response({"error": f"CSV parsing error: {str(e)}"}, status=400)

            from .models import Availability
            from users.models import CustomUser, Organization

            created_count = 0
            updated_count = 0
            errors = []
            row_count = 0

            for row in reader:
                row_count += 1
                logger.info(f"🔄 Processing availability row {row_count}: {row}")

                try:
                    doctor_username = row.get("doctor_username", "").strip()
                    start_time = row.get("start_time", "").strip()
                    end_time = row.get("end_time", "").strip()
                    is_blocked = row.get("is_blocked", "false").strip().lower() in [
                        "true",
                        "1",
                        "yes",
                    ]
                    recurrence = row.get("recurrence", "").strip()
                    recurrence_end_date = row.get("recurrence_end_date", "").strip()
                    org_name = row.get("organization", "").strip()

                    logger.info(
                        f"📋 Row data - Doctor: {doctor_username}, Start: {start_time}, End: {end_time}, Blocked: {is_blocked}"
                    )

                    if not doctor_username or not start_time or not end_time:
                        error_msg = f"Row {row_count}: Missing required fields (doctor_username, start_time, end_time)"
                        logger.warning(f"⚠️ {error_msg}")
                        errors.append(error_msg)
                        continue

                    # Validate doctor
                    try:
                        doctor = CustomUser.objects.get(
                            username=doctor_username, role="doctor"
                        )
                        logger.info(
                            f"✅ Found doctor: {doctor.first_name} {doctor.last_name}"
                        )
                    except CustomUser.DoesNotExist:
                        error_msg = (
                            f"Row {row_count}: Doctor '{doctor_username}' not found."
                        )
                        logger.error(f"❌ {error_msg}")
                        errors.append(error_msg)
                        continue

                    # Validate organization
                    org = None
                    if org_name:
                        try:
                            org, org_created = Organization.objects.get_or_create(
                                name=org_name
                            )
                            if org_created:
                                logger.info(f"📋 Created new organization: {org_name}")
                            else:
                                logger.info(
                                    f"📋 Using existing organization: {org_name}"
                                )
                        except Exception as e:
                            error_msg = f"Row {row_count}: Error with organization '{org_name}' - {str(e)}"
                            logger.error(f"❌ {error_msg}")
                            errors.append(error_msg)
                            continue

                    # Try to find existing availability
                    try:
                        avail, created = Availability.objects.get_or_create(
                            doctor=doctor,
                            start_time=start_time,
                            end_time=end_time,
                            defaults={
                                "is_blocked": is_blocked,
                                "recurrence": recurrence,
                                "recurrence_end_date": recurrence_end_date or None,
                                "organization": org or doctor.organization,
                            },
                        )

                        if not created:
                            # Update existing availability
                            avail.is_blocked = is_blocked
                            avail.recurrence = recurrence
                            avail.recurrence_end_date = recurrence_end_date or None
                            avail.organization = org or doctor.organization
                            avail.save()
                            updated_count += 1
                            logger.info(
                                f"🔄 Updated availability for {doctor_username}: {start_time} - {end_time}"
                            )
                        else:
                            created_count += 1
                            logger.info(
                                f"✅ Created availability for {doctor_username}: {start_time} - {end_time}"
                            )

                    except Exception as e:
                        error_msg = f"Row {row_count}: Error creating/updating availability for '{doctor_username}' - {str(e)}"
                        logger.error(f"❌ {error_msg}")
                        errors.append(error_msg)
                        continue

                except Exception as e:
                    error_msg = f"Unexpected error processing row {row_count}: {str(e)}"
                    logger.error(f"❌ {error_msg}")
                    errors.append(error_msg)
                    continue

            logger.info(
                f"✅ Upload completed - Created: {created_count}, Updated: {updated_count}, Errors: {len(errors)}"
            )

            return Response(
                {
                    "message": f"Upload completed. {created_count} availabilities created, {updated_count} updated.",
                    "created_count": created_count,
                    "updated_count": updated_count,
                    "total_rows": row_count,
                    "errors": errors,
                }
            )

        except Exception as e:
            logger.error(
                f"❌ Critical error in availability upload: {str(e)}", exc_info=True
            )
            return Response({"error": f"Upload failed: {str(e)}"}, status=500)


class RunWeeklyPatientRemindersView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        # Using django-cron function instead of Celery task
        send_patient_reminders()
        return Response(
            {"message": "Weekly patient reminders have been sent."},
            status=status.HTTP_200_OK,
        )


class RunPatientRemindersNowView(APIView):
    permission_classes = [HasRight("reminders.trigger")]

    def post(self, request):
        try:
            send_patient_reminders()
            return Response(
                {"message": "Patient reminders have been sent successfully."},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to send patient reminders: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class RunPatientSMSRemindersNowView(APIView):
    permission_classes = [HasRight("reminders.trigger")]

    def post(self, request):
        try:
            # For manual execution, ignore day restrictions
            send_patient_sms_reminders(ignore_day_restrictions=True)
            return Response(
                {"message": "Patient SMS reminders have been sent successfully."},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to send patient SMS reminders: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class RunScheduledJobsView(APIView):
    """
    Single daily entry point for an external scheduler (e.g. a GitHub
    Actions cron workflow) to trigger everything that should happen once
    a day, without needing a logged-in user:

      1. Email reminders -- respects each organization's AutoEmail
         day-of-week/frequency settings (does NOT ignore day
         restrictions, unlike the manual "Run Now" button).
      2. SMS reminders -- respects each organization's AutoSMS settings
         the same way.
      3. Messaging overage billing -- ONLY on the 1st of the month,
         reports the month that just ended to Stripe for every
         organization that has a Stripe subscription. This runs once
         a month, not daily, because report_monthly_messaging_usage's
         Stripe meter-event identifier is per org/channel/month and
         Stripe only accepts it once -- running this daily would lock
         in partial usage on whatever day it first ran and silently
         miss everything reported after that.

    Auth: a shared secret in the X-Scheduled-Job-Secret header
    (SCHEDULED_JOBS_SECRET env var), not a user JWT -- there is no
    logged-in user for a scheduled job.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        expected_secret = getattr(settings, "SCHEDULED_JOBS_SECRET", "")
        provided_secret = request.headers.get("X-Scheduled-Job-Secret", "")
        if not expected_secret or not secrets.compare_digest(
            provided_secret, expected_secret
        ):
            return Response(
                {"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN
            )

        results = {}

        try:
            send_patient_reminders()
            results["email_reminders"] = "ok"
        except Exception as exc:
            results["email_reminders"] = f"error: {exc}"

        try:
            send_patient_sms_reminders(ignore_day_restrictions=False)
            results["sms_reminders"] = "ok"
        except Exception as exc:
            results["sms_reminders"] = f"error: {exc}"

        try:
            from staffing.shift_generation import generate_shifts_from_patterns

            results["staffing_shift_generation"] = generate_shifts_from_patterns()
        except Exception as exc:
            results["staffing_shift_generation"] = f"error: {exc}"

        today = timezone.now().date()
        if today.day == 1:
            from users.messaging_stripe import report_monthly_messaging_usage
            from users.models import Organization

            last_day_prev_month = today.replace(day=1) - timedelta(days=1)
            prev_year = last_day_prev_month.year
            prev_month = last_day_prev_month.month

            billing_results = {}
            orgs_with_subscriptions = Organization.objects.exclude(
                stripe_subscription_id__isnull=True
            ).exclude(stripe_subscription_id="")

            for org in orgs_with_subscriptions:
                try:
                    billing_results[org.id] = report_monthly_messaging_usage(
                        org, year=prev_year, month=prev_month, dry_run=False
                    )
                except Exception as exc:
                    billing_results[org.id] = {"error": str(exc)}

            results["messaging_billing"] = {
                "period": f"{prev_year}-{prev_month:02d}",
                "organizations": billing_results,
            }
        else:
            results["messaging_billing"] = "skipped (only runs on the 1st of the month)"

        return Response(results, status=status.HTTP_200_OK)


class RunStaffingHourlyJobsView(APIView):
    """
    Hourly companion to RunScheduledJobsView, for Staffing automation that
    needs finer-than-daily resolution:

      1. Staff shift reminders -- SMS/email ~3 hours before a shift
         starts, gated by each staff member's reminders_enabled toggle
         (Roster tab). See staffing.reminders.send_shift_reminders.
      2. Understaffing coverage alerts -- emails org admins when a shift
         type configured as needing coverage (Assign Schedule tab) is
         short-staffed for a date 24 hours out. See
         staffing.reminders.send_coverage_alerts.

    Auth: same shared-secret pattern as RunScheduledJobsView (there is no
    logged-in user for a scheduled job). Triggered by a separate,
    once-an-hour GitHub Actions workflow
    (.github/workflows/staffing-hourly-jobs.yml) rather than folded into
    the once-daily job, since that one only runs once a day and both of
    these need to catch their target windows on the hour.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        expected_secret = getattr(settings, "SCHEDULED_JOBS_SECRET", "")
        provided_secret = request.headers.get("X-Scheduled-Job-Secret", "")
        if not expected_secret or not secrets.compare_digest(
            provided_secret, expected_secret
        ):
            return Response(
                {"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN
            )

        results = {}

        try:
            from staffing.reminders import send_shift_reminders

            results["staff_shift_reminders"] = send_shift_reminders()
        except Exception as exc:
            results["staff_shift_reminders"] = f"error: {exc}"

        try:
            from staffing.reminders import send_coverage_alerts

            results["coverage_alerts"] = send_coverage_alerts()
        except Exception as exc:
            results["coverage_alerts"] = f"error: {exc}"

        return Response(results, status=status.HTTP_200_OK)


class AutoEmailViewSet(viewsets.ModelViewSet):
    serializer_class = AutoEmailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.organization:
            return AutoEmail.objects.filter(organization=user.organization)
        else:
            return AutoEmail.objects.filter(organization__isnull=True)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_appointment_status(request, appointment_id):
    """
    Update the arrived and no_show status of an appointment
    """
    try:
        user = request.user
        # Get the appointment
        if user.role == "system_admin":
            appointment = Appointment.all_objects.get(id=appointment_id)
        else:
            appointment = Appointment.objects.get(
                id=appointment_id, organization=user.organization
            )

        # Get the status to update
        arrived = request.data.get("arrived")
        no_show = request.data.get("no_show")

        # Update the fields if provided
        if arrived is not None:
            appointment.arrived = arrived
        if no_show is not None:
            appointment.no_show = no_show
            # If marking as no-show, automatically mark as not arrived
            if no_show:
                appointment.arrived = False

        appointment.save()

        # Return updated appointment data
        serializer = AppointmentSerializer(appointment)
        return Response(serializer.data, status=status.HTTP_200_OK)

    except Appointment.DoesNotExist:
        return Response(
            {"error": "Appointment not found"}, status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CheckInSearchView(APIView):
    """
    Search today's appointments by patient name for check-in
    """

    permission_classes = [HasRight("checkin.manage")]

    def get(self, request):
        search_query = request.GET.get("query", "").strip()

        # Debug logging
        print(
            f"[DEBUG] CheckInSearchView: user={request.user}, role={getattr(request.user, 'role', None)}"
        )
        print(f"[DEBUG] CheckInSearchView: search_query='{search_query}'")

        if not search_query:
            return Response([], status=status.HTTP_200_OK)

        user = request.user

        # Get today's date range
        today = timezone.now().date()
        print(f"[DEBUG] CheckInSearchView: today={today}")

        # Build base queryset for today's appointments
        if user.role == "system_admin":
            queryset = Appointment.all_objects.filter(appointment_datetime__date=today)
        else:
            queryset = Appointment.objects.filter(
                appointment_datetime__date=today, organization=user.organization
            )
        queryset = queryset.exclude(INPATIENT_CHART)

        print(f"[DEBUG] CheckInSearchView: base queryset count={queryset.count()}")

        # Search by patient name (first name, last name, or full name)
        search_filter = Q()

        # Search in related patient object if it exists
        search_filter |= Q(patient__first_name__icontains=search_query)
        search_filter |= Q(patient__last_name__icontains=search_query)

        # Search for full name combinations
        name_parts = search_query.split()
        if len(name_parts) > 1:
            for i in range(len(name_parts)):
                first_part = " ".join(name_parts[: i + 1])
                last_part = " ".join(name_parts[i + 1 :])
                if last_part:
                    search_filter |= Q(patient__first_name__icontains=first_part) & Q(
                        patient__last_name__icontains=last_part
                    )

        appointments = queryset.filter(search_filter).order_by("appointment_datetime")
        print(
            f"[DEBUG] CheckInSearchView: filtered appointments count={appointments.count()}"
        )

        # Serialize the results
        serializer = AppointmentSerializer(appointments, many=True)
        print(
            f"[DEBUG] CheckInSearchView: serialized data length={len(serializer.data)}"
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class CheckInStatusUpdateView(APIView):
    """
    Update the arrived status for a specific appointment
    """

    permission_classes = [HasRight("checkin.manage")]

    def patch(self, request, appointment_id):
        try:
            user = request.user

            # Get the appointment
            if user.role == "system_admin":
                appointment = Appointment.all_objects.get(id=appointment_id)
            else:
                appointment = Appointment.objects.get(
                    id=appointment_id, organization=user.organization
                )

            # Get the arrived status
            arrived = request.data.get("arrived")

            if arrived is not None:
                appointment.arrived = arrived
                # If marking as arrived, clear no_show status and set status to "in_progress"
                if arrived:
                    appointment.no_show = False
                    appointment.status = "in_progress"

                appointment.save()

            # Return updated appointment data
            serializer = AppointmentSerializer(appointment)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Appointment.DoesNotExist:
            return Response(
                {"error": "Appointment not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ClinicalNoteViewSet(viewsets.ModelViewSet):
    """
    Clinical documentation (SOAP-structured nursing/doctor assessments) tied
    to a specific appointment. Doctors, nurses, admins, and system_admins can
    author and view notes; patients have no access to this endpoint.

    Signed notes are immutable — see CanAccessClinicalNotes.has_object_permission
    and the `sign` / `addend` actions below.
    """

    serializer_class = ClinicalNoteSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        CanAccessClinicalNotes,
        CanAuthorClinicalNoteType,
    ]

    def get_queryset(self):
        user = self.request.user

        if user.role == "system_admin":
            queryset = ClinicalNote.objects.all()
        else:
            queryset = ClinicalNote.objects.filter(organization=user.organization)

        appointment_id = self.request.query_params.get("appointment")
        if appointment_id:
            queryset = queryset.filter(appointment_id=appointment_id)

        patient_id = self.request.query_params.get("patient")
        if patient_id:
            queryset = queryset.filter(patient_id=patient_id)

        return queryset.select_related("patient", "author", "appointment")

    @action(detail=True, methods=["post"])
    def sign(self, request, pk=None):
        """Lock a draft note. Once signed it can never be edited again."""
        note = self.get_object()
        if note.status == "signed":
            return Response(
                {"detail": "This note is already signed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if note.author != request.user and request.user.role not in (
            "admin",
            "system_admin",
        ):
            return Response(
                {"detail": "Only the authoring provider can sign this note."},
                status=status.HTTP_403_FORBIDDEN,
            )
        note.status = "signed"
        note.signed_at = timezone.now()
        note.save(update_fields=["status", "signed_at"])
        return Response(ClinicalNoteSerializer(note).data)

    @action(detail=True, methods=["post"])
    def addend(self, request, pk=None):
        """
        Create a new draft note that references this (presumably signed) note
        as a correction/addition, rather than editing the original in place.
        """
        original = self.get_object()
        data = request.data.copy()
        data["appointment"] = original.appointment_id
        data["note_type"] = original.note_type
        data["amends"] = original.id

        serializer = ClinicalNoteSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class VitalSignsFlowsheetViewSet(viewsets.ModelViewSet):
    """
    A flowsheet instance for a visit -- one per (appointment, template) pair.
    Created lazily -- GET /?appointment=<id>&template=<id> returns an empty
    list until the first Save from the flowsheet panel POSTs it into
    existence, at which point later saves PATCH that same row (enforced by
    VitalSignsFlowsheet.Meta.unique_together, which a second POST for the
    same appointment+template would violate).

    Despite the name (kept for backward compatibility), this now serves any
    flowsheet type an admin has defined via the flowsheet-builder
    (FlowsheetTemplateAdminViewSet below) -- `template` on each instance
    says which one.
    """

    serializer_class = VitalSignsFlowsheetSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessVitalSignsFlowsheets]

    def get_queryset(self):
        user = self.request.user
        if user.role == "system_admin":
            queryset = VitalSignsFlowsheet.objects.all()
        else:
            queryset = VitalSignsFlowsheet.objects.filter(organization=user.organization)

        appointment_id = self.request.query_params.get("appointment")
        if appointment_id:
            queryset = queryset.filter(appointment_id=appointment_id)

        patient_id = self.request.query_params.get("patient")
        if patient_id:
            queryset = queryset.filter(patient_id=patient_id)

        template_id = self.request.query_params.get("template")
        if template_id:
            queryset = queryset.filter(template_id=template_id)

        return queryset.select_related("patient", "appointment", "template")


class FlowsheetTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only definitions of flowsheet types -- e.g. "Vital Signs" -- for
    the flowsheet panel to render its type dropdown and, once a type is
    selected, its grid.

    Only active templates, and no create/update/delete here: building/
    editing flowsheet types goes through FlowsheetTemplateAdminViewSet below
    (the flowsheet-builder configuration UI) instead -- same split as
    NoteTemplateViewSet / NoteTemplateAdminViewSet.
    """

    queryset = FlowsheetTemplate.objects.filter(is_active=True).prefetch_related(
        "rows", "rows__dictionary", "rows__dictionary__items"
    )
    serializer_class = FlowsheetTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessVitalSignsFlowsheets]
    lookup_field = "code"


class FlowsheetTemplateAdminViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for FlowsheetTemplate + its nested FlowsheetRowDefinition
    rows, admin-only (see IsFlowsheetTemplateAdmin). This is what the
    flowsheet-builder configuration UI talks to -- the flowsheet panel never
    touches it, only the read-only FlowsheetTemplateViewSet above.

    Lists every template regardless of is_active, so an admin can find and
    re-enable a deactivated one.
    """

    queryset = FlowsheetTemplate.objects.all().prefetch_related(
        "rows", "rows__dictionary", "rows__dictionary__items"
    )
    permission_classes = [permissions.IsAuthenticated, IsFlowsheetTemplateAdmin]
    lookup_field = "code"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return FlowsheetTemplateAdminSerializer
        return FlowsheetTemplateSerializer

    def _read_payload(self, template, version_bumped):
        data = FlowsheetTemplateSerializer(template).data
        data["version_bumped"] = version_bumped
        data["instances_count"] = template.instances.count()
        return data

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save()
        return Response(self._read_payload(template, version_bumped=False), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        old_version = instance.version
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        template = serializer.save()
        return Response(
            self._read_payload(template, version_bumped=template.version != old_version),
            status=status.HTTP_200_OK,
        )

    # CSV upload/download -- the flowsheet twin of the note template CSV
    # (format: appointments/flowsheet_template_csv.py, database side:
    # appointments/flowsheet_template_import.py). Both inherit this
    # viewset's IsFlowsheetTemplateAdmin permission.

    @action(detail=False, methods=["get"], url_path="sample-csv")
    def sample_csv(self, request):
        """Download a Vital Signs sample as a ready-to-edit upload template."""
        response = HttpResponse(sample_flowsheet_csv_text(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="flowsheet_template_upload_template.csv"'
        return response

    @action(detail=True, methods=["get"], url_path="download-csv")
    def download_csv(self, request, code=None):
        """Download an existing flowsheet in the upload CSV format."""
        template = self.get_object()
        try:
            text = export_flowsheet_csv(template)
        except ValueError as exc:
            return Response(
                {"detail": f"This flowsheet can't be exported to CSV: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        response = HttpResponse(text, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{template.code}_flowsheet.csv"'
        return response

    @action(detail=False, methods=["post"], url_path="upload-csv", parser_classes=[MultiPartParser])
    def upload_csv(self, request):
        """
        Create or update a flowsheet from an uploaded CSV. Validates the whole
        file first and saves nothing unless every row is valid; on success the
        whole flowsheet is written in one transaction.
        """
        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "No file was uploaded. Send the CSV as multipart form field 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > 2 * 1024 * 1024:
            return Response(
                {"detail": "That file is larger than 2 MB. A flowsheet CSV should be far smaller."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        parsed, errors = parse_flowsheet_csv(decode_upload(upload.read()))
        if errors:
            return Response(
                {
                    "detail": f"The CSV has {len(errors)} problem(s). Nothing was saved.",
                    "errors": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = apply_flowsheet_import(parsed)
        except Exception:
            logging.getLogger(__name__).exception("Flowsheet CSV import failed for code %s", parsed["code"])
            return Response(
                {"detail": "The CSV was valid but the flowsheet couldn't be saved. Nothing was changed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        data = self._read_payload(result["template"], version_bumped=result["version_bumped"])
        data["created"] = result["created"]
        return Response(
            data,
            status=status.HTTP_201_CREATED if result["created"] else status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.instances.exists():
            return Response(
                {
                    "detail": (
                        "This flowsheet type has charted instances on file and can't be "
                        "deleted -- set it to inactive instead so it disappears from the "
                        "Flowsheet dropdown without breaking existing flowsheets."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class NoteTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only definitions of structured (non-SOAP) note types -- e.g.
    Admission Note -- for the frontend to render a generic form from.

    Only active templates, and no create/update/delete here: this is what
    DynamicNoteForm reads when a doctor/nurse is filling out a note.
    Building/editing templates goes through NoteTemplateAdminViewSet below
    (Phase 2's note-builder configuration UI) instead -- keeping the two
    apart means a template mid-edit, or one an admin has deliberately
    deactivated, never shows up as a choice while writing a note.
    """

    queryset = NoteTemplate.objects.filter(is_active=True, kind="note").prefetch_related(
        "fields", "fields__dictionary", "fields__dictionary__items"
    )
    serializer_class = NoteTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessClinicalNotes]
    lookup_field = "code"


class NoteTemplateAdminViewSet(viewsets.ModelViewSet):
    """
    Phase 2: full CRUD for NoteTemplate + its nested NoteFieldDefinition
    rows, admin-only (see IsNoteTemplateAdmin). This is what the note-builder
    configuration UI talks to -- the note-authoring form never touches it,
    only the read-only NoteTemplateViewSet above.

    Lists every template regardless of is_active, so an admin can find and
    re-enable a deactivated one. Write validation, the version-bump diff,
    and the depends_on client_id wiring all live in NoteTemplateAdminSerializer.
    """

    queryset = NoteTemplate.objects.all().prefetch_related(
        "fields", "fields__dictionary", "fields__dictionary__items", "fields__depends_on"
    )
    permission_classes = [permissions.IsAuthenticated, IsNoteTemplateAdmin]
    lookup_field = "code"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return NoteTemplateAdminSerializer
        return NoteTemplateSerializer

    def _read_payload(self, template, version_bumped):
        data = NoteTemplateSerializer(template).data
        data["version_bumped"] = version_bumped
        data["signed_notes_count"] = template.notes.filter(status="signed").count()
        return data

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save()
        return Response(self._read_payload(template, version_bumped=False), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        old_version = instance.version
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        template = serializer.save()
        return Response(
            self._read_payload(template, version_bumped=template.version != old_version),
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.notes.exists():
            return Response(
                {
                    "detail": (
                        "This template has notes on file and can't be deleted -- "
                        "set it to inactive instead so it disappears from the "
                        "Documentation Type list without breaking existing notes."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    # --- CSV download / upload ----------------------------------------------
    # File format + validation rules: appointments/note_template_csv.py.
    # Persistence (templates, fields, dictionaries, version bump):
    # appointments/note_template_import.py. All three actions inherit this
    # viewset's IsNoteTemplateAdmin permission.

    @action(detail=False, methods=["get"], url_path="sample-csv")
    def sample_csv(self, request):
        """Download the Admission Note sample as a ready-to-edit upload template."""
        from pathlib import Path

        content = (Path(__file__).resolve().parent / "note_template_sample.csv").read_bytes()
        response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="note_template_upload_template.csv"'
        return response

    @action(detail=True, methods=["get"], url_path="download-csv")
    def download_csv(self, request, code=None):
        """Download an existing template in the upload CSV format."""
        template = self.get_object()
        try:
            text = export_template_csv(template)
        except ValueError as exc:
            return Response(
                {"detail": f"This template can't be exported to CSV: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        response = HttpResponse(text, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{template.code}_template.csv"'
        return response

    @action(detail=False, methods=["post"], url_path="upload-csv", parser_classes=[MultiPartParser])
    def upload_csv(self, request):
        """
        Create or update a note template from an uploaded CSV. Validates the
        whole file first and saves nothing unless every row is valid; on
        success the whole template is written in one transaction.
        """
        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "No file was uploaded. Send the CSV as multipart form field 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > 2 * 1024 * 1024:
            return Response(
                {"detail": "That file is larger than 2 MB. A note template CSV should be far smaller."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        parsed, errors = parse_template_csv(decode_upload(upload.read()))
        if errors:
            return Response(
                {
                    "detail": f"The CSV has {len(errors)} problem(s). Nothing was saved.",
                    "errors": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = apply_template_import(parsed)
        except Exception:
            logging.getLogger(__name__).exception("Note template CSV import failed for code %s", parsed["code"])
            return Response(
                {"detail": "The CSV was valid but the template couldn't be saved. Nothing was changed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if result["created"] and request.query_params.get("kind") == "order_detail":
            result["template"].kind = "order_detail"
            result["template"].save(update_fields=["kind"])

        data = self._read_payload(result["template"], version_bumped=result["version_bumped"])
        data["created"] = result["created"]
        return Response(
            data,
            status=status.HTTP_201_CREATED if result["created"] else status.HTTP_200_OK,
        )


class DictionaryAdminViewSet(viewsets.ModelViewSet):
    """
    Phase 2: full CRUD for Dictionary + its DictionaryItem rows, admin-only.
    Backs the "Dictionaries" tab of the note-builder configuration UI, where
    an admin manages the shared option lists that radio/dropdown/multiselect
    fields point to.
    """

    queryset = Dictionary.objects.all().prefetch_related("items")
    serializer_class = DictionaryAdminSerializer
    permission_classes = [permissions.IsAuthenticated, IsNoteTemplateAdmin]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.notefielddefinition_set.exists():
            return Response(
                {
                    "detail": (
                        "This dictionary is used by one or more template fields "
                        "and can't be deleted -- remove it from those fields first."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)



# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

def _org_scoped(queryset, user, allow_global=False):
    if user.role == "system_admin":
        return queryset
    q = Q(organization=user.organization)
    if allow_global:
        q |= Q(organization__isnull=True)
    return queryset.filter(q)


class OrderViewSet(viewsets.ModelViewSet):
    """
    Patient orders. State changes happen only through the actions below,
    which delegate to orders_workflow; a signed order is never edited.
    """

    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessOrders]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def handle_exception(self, exc):
        if isinstance(exc, ow.OrderWorkflowError):
            body = {"detail": exc.message}
            if exc.errors:
                body["errors"] = exc.errors
            return Response(body, status=exc.status_code)
        return super().handle_exception(exc)

    def get_queryset(self):
        qs = _org_scoped(Order.objects.all(), self.request.user)
        p = self.request.query_params
        for param, lookup in (
            ("appointment", "appointment_id"),
            ("patient", "patient_id"),
            ("status", "status"),
            ("category", "orderable_category"),
            ("interface_status", "interface_status"),
            ("order_set", "order_set_id"),
        ):
            value = p.get(param)
            if value:
                qs = qs.filter(**{lookup: value})
        return qs.select_related(
            "patient", "ordering_provider", "signed_by", "cosigned_by"
        ).prefetch_related("events").order_by("-created_at")

    def perform_destroy(self, instance):
        if instance.status != "draft":
            raise ow.OrderWorkflowError(
                "Only a draft can be deleted -- discontinue a signed order instead."
            )
        instance.delete()

    @action(detail=True, methods=["post"])
    def sign(self, request, pk=None):
        order = ow.sign_order(self.get_object(), request.user)
        return Response(self.get_serializer(order).data)

    @action(detail=False, methods=["post"], url_path="sign")
    def sign_many(self, request):
        ids = request.data.get("ids") or []
        if not isinstance(ids, list) or not ids:
            raise ow.OrderWorkflowError("Send {\"ids\": [...]} with at least one order.")
        orders = list(self.get_queryset().filter(pk__in=ids))
        if len(orders) != len(set(ids)):
            raise ow.OrderWorkflowError("One or more orders were not found.", 404)
        signed = ow.sign_orders(orders, request.user)
        return Response(self.get_serializer(signed, many=True).data)

    @action(detail=True, methods=["post"])
    def cosign(self, request, pk=None):
        order = ow.cosign_order(self.get_object(), request.user)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        order = ow.complete_order(
            self.get_object(),
            request.user,
            result_text=request.data.get("result_text", ""),
            result_data=request.data.get("result_data"),
        )
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def discontinue(self, request, pk=None):
        order = ow.discontinue_order(
            self.get_object(), request.user, request.data.get("reason", "")
        )
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def replace(self, request, pk=None):
        _old, new = ow.replace_order(self.get_object(), request.user, request.data.get("reason", ""))
        return Response(self.get_serializer(new).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="interface-update")
    def interface_update(self, request, pk=None):
        ser = OrderInterfaceUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        order = ow.apply_interface_update(self.get_object(), request.user, **ser.validated_data)
        return Response(self.get_serializer(order).data)

    @action(detail=False, methods=["get"], url_path="interface-queue")
    def interface_queue(self, request):
        qs = self.get_queryset().filter(
            status__in=("active", "in_progress"),
            interface_status__in=("not_sent", "queued"),
        )
        return Response(self.get_serializer(qs, many=True).data)


class OrderableViewSet(viewsets.ReadOnlyModelViewSet):
    """Orderable catalog for pickers: active entries, global or the user's org."""

    serializer_class = OrderableSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessOrders]
    pagination_class = None

    def get_queryset(self):
        qs = _org_scoped(Orderable.objects.filter(is_active=True), self.request.user, allow_global=True)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        q = (self.request.query_params.get("q") or "").strip()
        for term in q.split():
            qs = qs.filter(
                Q(name__icontains=term) | Q(code__icontains=term)
                | Q(external_code__icontains=term) | Q(description__icontains=term)
            )
        qs = qs.select_related("detail_template").order_by("category", "name")
        try:
            limit = int(self.request.query_params.get("limit", 0))
        except ValueError:
            limit = 0
        return qs[:limit] if limit > 0 and self.action == "list" else qs


class OrderSetViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrderSetSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessOrders]
    lookup_field = "code"
    pagination_class = None

    def handle_exception(self, exc):
        if isinstance(exc, ow.OrderWorkflowError):
            return Response({"detail": exc.message}, status=exc.status_code)
        return super().handle_exception(exc)

    def get_queryset(self):
        return _org_scoped(
            OrderSet.objects.filter(is_active=True), self.request.user, allow_global=True
        ).prefetch_related("items", "items__orderable")

    @action(detail=True, methods=["post"])
    def place(self, request, code=None):
        order_set = self.get_object()
        appointment = _org_scoped(Appointment.objects.all(), request.user).filter(
            pk=request.data.get("appointment")
        ).first()
        if appointment is None:
            raise ow.OrderWorkflowError("Appointment not found.", 404)
        orders = ow.place_order_set(
            request.user,
            order_set,
            appointment,
            clinical_note=None,
            item_ids=request.data.get("item_ids"),
        )
        return Response(
            OrderSerializer(orders, many=True, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class _CatalogAdminMixin:
    permission_classes = [permissions.IsAuthenticated, HasRight("orders.manage_catalog")]
    pagination_class = None

    def get_queryset(self):
        return _org_scoped(self.model.objects.all(), self.request.user, allow_global=True)

    def _check_editable(self, obj):
        # Entries shared by all organizations can be seen but only changed by a system admin.
        if obj.organization_id is None and self.request.user.role != "system_admin":
            raise ow.OrderWorkflowError(
                "This entry is shared by all organizations and can only be changed by a system administrator.", 403
            )

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == "system_admin":
            serializer.save()
        else:
            serializer.save(organization=user.organization)

    def perform_update(self, serializer):
        self._check_editable(serializer.instance)
        user = self.request.user
        if user.role == "system_admin":
            serializer.save()
        else:
            serializer.save(organization=user.organization)

    def handle_exception(self, exc):
        if isinstance(exc, ow.OrderWorkflowError):
            return Response({"detail": exc.message}, status=exc.status_code)
        return super().handle_exception(exc)

    def destroy(self, request, *args, **kwargs):
        from django.db.models import ProtectedError

        self._check_editable(self.get_object())
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "This entry is used by existing orders; deactivate it instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class OrderableAdminViewSet(_CatalogAdminMixin, viewsets.ModelViewSet):
    model = Orderable
    serializer_class = OrderableAdminSerializer

    # CSV: same all-or-nothing approach as the note template upload (see
    # appointments/orders_csv.py for the format).

    @action(detail=False, methods=["get"], url_path="sample-csv")
    def sample_csv(self, request):
        response = HttpResponse(sample_orderable_csv(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="orderables_upload_template.csv"'
        return response

    @action(detail=False, methods=["get"], url_path="download-csv")
    def download_csv(self, request):
        # Only the entries an upload would write back to: the user's own
        # organization (or, for a system admin, the shared catalog).
        org_id = None if request.user.role == "system_admin" else request.user.organization_id
        qs = (
            Orderable.objects.filter(organization_id=org_id)
            .select_related("detail_template")
            .order_by("category", "name")
        )
        response = HttpResponse(export_orderable_csv(qs), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="orderables.csv"'
        return response

    @action(detail=False, methods=["post"], url_path="upload-csv", parser_classes=[MultiPartParser])
    def upload_csv(self, request):
        from django.db import transaction

        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "No file was uploaded. Send the CSV as multipart form field 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > 2 * 1024 * 1024:
            return Response({"detail": "That file is larger than 2 MB."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        is_sysadmin = user.role == "system_admin"
        rows, errors = parse_orderable_csv(
            decode_upload(upload.read()),
            [c[0] for c in Orderable.CATEGORY_CHOICES],
            [c[0] for c in Orderable.CODE_SYSTEM_CHOICES],
            [c[0] for c in ORDER_PRIORITY_CHOICES],
        )

        # Checks that need the database: detail forms and who owns each code.
        org_id = None if is_sysadmin else user.organization_id
        if rows:
            forms = {
                t.code: t
                for t in _org_scoped(
                    NoteTemplate.objects.filter(kind="order_detail"), user, allow_global=True
                )
            }
            code_filter = Q()
            for r in rows:
                code_filter |= Q(code__iexact=r["code"])
            existing = {o.code.lower(): o for o in Orderable.objects.filter(code_filter)} if rows else {}
            for r in rows:
                form_code = r["detail_form_code"]
                if form_code and form_code not in forms:
                    errors.append({
                        "row": r["_row"], "column": "detail_form_code",
                        "message": f"No Order detail form with code '{form_code}'.",
                    })
                current = existing.get(r["code"].lower())
                if current is not None and current.organization_id != org_id:
                    errors.append({
                        "row": r["_row"], "column": "code",
                        "message": "That code already belongs to another organization or to the shared catalog.",
                    })
        if errors:
            return Response(
                {"detail": f"The CSV has {len(errors)} problem(s). Nothing was saved.", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = updated = 0
        with transaction.atomic():
            for r in rows:
                fields = {
                    "name": r["name"],
                    "category": r["category"],
                    "code_system": r["code_system"],
                    "external_code": r["external_code"],
                    "description": r["description"],
                    "default_priority": r["default_priority"],
                    "requires_cosign": r["requires_cosign"],
                    "is_active": r["is_active"],
                    "detail_template": forms.get(r["detail_form_code"]) if r["detail_form_code"] else None,
                }
                current = existing.get(r["code"].lower())
                if current is None:
                    Orderable.objects.create(code=r["code"], organization_id=org_id, **fields)
                    created += 1
                else:
                    for k, val in fields.items():
                        setattr(current, k, val)
                    current.save()
                    updated += 1
        return Response({"created": created, "updated": updated, "total": created + updated})


class OrderSetAdminViewSet(_CatalogAdminMixin, viewsets.ModelViewSet):
    model = OrderSet
    serializer_class = OrderSetAdminSerializer
