import csv
import logging

from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Staff, StaffRecurringPattern, StaffShift, ShiftCoverageRequirement
from .shift_generation import generate_shifts_for_pattern
from .serializers import (
    StaffRecurringPatternSerializer,
    StaffSerializer,
    StaffShiftSerializer,
    ShiftCoverageRequirementSerializer,
)

logger = logging.getLogger(__name__)

ADMIN_ROLES = ("admin", "system_admin")


class StaffingAdminWriteMixin:
    """
    Shared gating for the Staffing module: any authenticated user in the
    organization can view the roster/calendar, but only admins can create,
    edit, or delete staffing data. Uses a simple inline role check
    (matching the pattern already live in production, e.g.
    users.payment_views.messaging_usage) rather than the newer
    users.rights.HasRight system, since that system's migration has not
    been applied/deployed yet -- see claude/rights-permissions-system.md.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _require_admin(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response(
                {"error": "Only admins can manage Staffing data."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def create(self, request, *args, **kwargs):
        denied = self._require_admin(request)
        if denied:
            return denied
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        denied = self._require_admin(request)
        if denied:
            return denied
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        denied = self._require_admin(request)
        if denied:
            return denied
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        denied = self._require_admin(request)
        if denied:
            return denied
        return super().destroy(request, *args, **kwargs)


def _org_queryset(model, request):
    """System admins see everything; everyone else is scoped to their org."""
    user = request.user
    if user.role == "system_admin":
        return model.objects.all()
    return model.objects.filter(organization=user.organization)


class StaffViewSet(StaffingAdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = StaffSerializer

    def get_queryset(self):
        qs = _org_queryset(Staff, self.request)
        active_only = self.request.query_params.get("active_only")
        if active_only in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        profession = self.request.query_params.get("profession")
        if profession:
            qs = qs.filter(profession=profession)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == "system_admin" and self.request.data.get("organization"):
            serializer.save()
        else:
            serializer.save(organization=user.organization)


class StaffRecurringPatternViewSet(StaffingAdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = StaffRecurringPatternSerializer

    def get_queryset(self):
        qs = _org_queryset(StaffRecurringPattern, self.request)
        staff_id = self.request.query_params.get("staff")
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        active_only = self.request.query_params.get("active_only")
        if active_only in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == "system_admin" and self.request.data.get("organization"):
            pattern = serializer.save()
        else:
            pattern = serializer.save(organization=user.organization)
        # Generate this pattern's shifts immediately so the schedule shows
        # up on the calendar right away, rather than waiting for the next
        # daily automated generate_shifts_from_patterns() run.
        generate_shifts_for_pattern(pattern)

    def perform_update(self, serializer):
        pattern = serializer.save()
        generate_shifts_for_pattern(pattern)

    def perform_destroy(self, instance):
        # StaffShift.recurring_pattern uses on_delete=SET_NULL (by design,
        # so a shift already worked keeps existing if its pattern is later
        # removed) -- but that means deleting a pattern would otherwise
        # leave its generated shifts behind as orphaned "ghost" entries
        # still showing on the calendar. Explicitly delete them here so
        # removing a mistaken schedule actually clears it from the
        # calendar, not just the pattern itself.
        instance.generated_shifts.all().delete()
        instance.delete()


class StaffShiftViewSet(StaffingAdminWriteMixin, viewsets.ModelViewSet):
    """
    Doubles as the calendar-fetch endpoint: GET /api/staffing/shifts/?start=YYYY-MM-DD&end=YYYY-MM-DD
    returns every duty assignment in that window for the calendar view.
    """

    serializer_class = StaffShiftSerializer

    def get_queryset(self):
        qs = _org_queryset(StaffShift, self.request)
        start = self.request.query_params.get("start")
        end = self.request.query_params.get("end")
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        staff_id = self.request.query_params.get("staff")
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        include_cancelled = self.request.query_params.get("include_cancelled")
        if include_cancelled not in ("1", "true", "True"):
            qs = qs.filter(is_cancelled=False)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == "system_admin" and self.request.data.get("organization"):
            serializer.save(source="manual")
        else:
            serializer.save(organization=user.organization, source="manual")


class UploadStaffCSV(APIView):
    """
    CSV upload for the staff roster. Expected columns: first_name,
    last_name, profession (free text -- nurse, physician, CNA, tech,
    whatever the org uses), email (optional), phone_number (optional).
    Matches existing rows by (organization, first_name, last_name,
    profession) -- re-uploading the same file updates rather than
    duplicates.
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response(
                {"error": "Only admins can upload the staff roster."},
                status=status.HTTP_403_FORBIDDEN,
            )

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided."}, status=400)

        try:
            decoded_file = file.read().decode("utf-8-sig").splitlines()
        except UnicodeDecodeError as e:
            return Response({"error": f"File encoding error: {e}"}, status=400)

        try:
            reader = csv.DictReader(decoded_file)
        except Exception as e:
            return Response({"error": f"CSV parsing error: {e}"}, status=400)

        organization = request.user.organization
        created_count = 0
        updated_count = 0
        errors = []

        for row_num, row in enumerate(reader, start=2):
            try:
                first_name = (row.get("first_name") or "").strip()
                last_name = (row.get("last_name") or "").strip()
                profession = (row.get("profession") or "").strip()
                email = (row.get("email") or "").strip() or None
                phone_number = (row.get("phone_number") or "").strip() or None

                if not first_name or not last_name:
                    errors.append(f"Row {row_num}: first_name and last_name are required.")
                    continue

                if not profession:
                    errors.append(f"Row {row_num}: profession is required.")
                    continue

                staff, created = Staff.objects.update_or_create(
                    organization=organization,
                    first_name=first_name,
                    last_name=last_name,
                    profession=profession,
                    defaults={
                        "email": email,
                        "phone_number": phone_number,
                        "is_active": True,
                    },
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1
            except Exception as e:
                errors.append(f"Row {row_num}: {e}")

        return Response(
            {
                "created": created_count,
                "updated": updated_count,
                "errors": errors,
            },
            status=status.HTTP_200_OK,
        )


class ShiftCoverageRequirementViewSet(StaffingAdminWriteMixin, viewsets.ModelViewSet):
    """
    Admin-configured coverage obligations, e.g. "night shift needs at
    least 1 person every Mon/Wed/Fri". Managed from the Assign Schedule
    tab. This is the "schedule type setting" that the 24-hours-before
    understaffing alert (staffing.reminders.send_coverage_alerts) checks
    against -- it only alerts for shift types an admin has explicitly
    marked as needing coverage, not literally every shift ever created.
    """

    serializer_class = ShiftCoverageRequirementSerializer

    def get_queryset(self):
        qs = _org_queryset(ShiftCoverageRequirement, self.request)
        active_only = self.request.query_params.get("active_only")
        if active_only in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == "system_admin" and self.request.data.get("organization"):
            serializer.save()
        else:
            serializer.save(organization=user.organization)


class SendStaffMessageView(APIView):
    """
    Admin-triggered ad-hoc SMS or email to a single roster staff member --
    powers the SMS/Email buttons on the Roster tab. Distinct from the
    automatic 3-hours-before-shift reminder job (staffing.reminders): this
    is a manual, one-off send, and it deliberately bypasses the
    CustomUser SMS opt-out check since staff-roster entries aren't login
    accounts and that consent system is for patients/contacts.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, staff_id):
        if request.user.role not in ADMIN_ROLES:
            return Response(
                {"error": "Only admins can message staff."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            staff = _org_queryset(Staff, request).get(pk=staff_id)
        except Staff.DoesNotExist:
            return Response({"error": "Staff member not found."}, status=404)

        channel = (request.data.get("channel") or "").strip().lower()
        message = (request.data.get("message") or "").strip()
        if channel not in ("sms", "email"):
            return Response(
                {"error": "channel must be 'sms' or 'email'."}, status=400
            )
        if not message:
            return Response({"error": "message is required."}, status=400)

        from communicator.utils import send_sms, send_email

        if channel == "sms":
            if not staff.phone_number:
                return Response(
                    {"error": f"{staff.full_name} has no phone number on file."},
                    status=400,
                )
            try:
                send_sms(
                    staff.phone_number,
                    message,
                    user=request.user,
                    organization=staff.organization,
                    bypass_opt_out=True,
                )
            except Exception as exc:
                return Response({"error": f"Failed to send SMS: {exc}"}, status=502)
        else:
            if not staff.email:
                return Response(
                    {"error": f"{staff.full_name} has no email on file."},
                    status=400,
                )
            subject = (request.data.get("subject") or "").strip() or "Schedule message"
            try:
                send_email(
                    staff.email,
                    subject,
                    message,
                    user=request.user,
                    organization=staff.organization,
                )
            except Exception as exc:
                return Response({"error": f"Failed to send email: {exc}"}, status=502)

        return Response({"ok": True}, status=status.HTTP_200_OK)
