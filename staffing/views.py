import csv
import datetime
import logging
import re

from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Staff,
    StaffRecurringPattern,
    StaffShift,
    ShiftCoverageRequirement,
    SHIFT_TYPE_CHOICES,
    DAY_OF_WEEK_CHOICES,
    VALID_DAY_CODES,
)
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


_DAY_NAME_TO_CODE = {label.lower(): code for code, label in DAY_OF_WEEK_CHOICES}
_VALID_SHIFT_TYPES = {code for code, _label in SHIFT_TYPE_CHOICES}


def _parse_shift_type_cell(raw):
    """Returns a valid shift_type code, or raises ValueError with a helpful message."""
    value = (raw or "").strip().lower()
    if value not in _VALID_SHIFT_TYPES:
        valid = ", ".join(sorted(_VALID_SHIFT_TYPES))
        raise ValueError(f"invalid shift '{raw}' (must be one of: {valid})")
    return value


def _parse_days_of_week_cell(raw):
    """
    Accepts day codes ('mon', 'Tue') or full names ('Monday', 'wednesday'),
    separated by comma, semicolon, pipe, or whitespace -- e.g.
    "mon,wed,fri" or "Monday; Wednesday; Friday". Returns a list of valid
    day codes, or raises ValueError with a helpful message.
    """
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("days is required when shift/start/end are given")
    tokens = [t.strip() for t in re.split(r"[,;|/\s]+", raw) if t.strip()]
    codes = []
    bad = []
    for token in tokens:
        lower = token.lower()
        if lower in VALID_DAY_CODES:
            codes.append(lower)
        elif lower in _DAY_NAME_TO_CODE:
            codes.append(_DAY_NAME_TO_CODE[lower])
        else:
            bad.append(token)
    if bad:
        raise ValueError(
            f"invalid day(s) {bad} (use mon, tue, wed, thu, fri, sat, sun or full day names)"
        )
    # De-dupe while preserving first-seen order.
    seen = set()
    unique_codes = []
    for code in codes:
        if code not in seen:
            seen.add(code)
            unique_codes.append(code)
    return unique_codes


def _parse_time_cell(raw, field_label):
    """Accepts 'HH:MM' or 'HH:MM:SS' (24-hour). Raises ValueError otherwise."""
    raw = (raw or "").strip()
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    raise ValueError(f"invalid {field_label} '{raw}' (expected 24-hour HH:MM, e.g. 19:00)")


def _parse_date_cell(raw, field_label):
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return datetime.datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"invalid {field_label} '{raw}' (expected YYYY-MM-DD)")


class UploadStaffCSV(APIView):
    """
    CSV upload for the staff roster. Required columns: first_name,
    last_name, profession (free text -- nurse, physician, CNA, tech,
    whatever the org uses). Optional: email, phone_number.

    Also optionally accepts a recurring-schedule block per row: shift
    (day/evening/night/custom), days (e.g. "mon,wed,fri" or full day
    names), start (HH:MM), end (HH:MM), and optionally start_date /
    end_date (YYYY-MM-DD, start_date defaults to today, end_date blank =
    ongoing). When shift/days/start/end are all present for a row, a
    StaffRecurringPattern is created or updated for that staff member and
    its shifts are generated immediately (same as creating one by hand on
    the Assign Schedule tab), so the schedule shows up on the calendar
    right away rather than waiting for the daily/hourly automation.

    Staff rows match existing rows by (organization, first_name,
    last_name, profession); schedule rows match by (organization, staff,
    shift_type) -- re-uploading the same file updates rather than
    duplicates either one.
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
        schedules_created_count = 0
        schedules_updated_count = 0
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

                # Optional recurring-schedule columns: shift, days, start,
                # end (start_date/end_date optional too). A row with none
                # of these is just a plain roster entry -- nothing else to
                # do. A row with SOME but not all of shift/days/start/end
                # is a mistake worth flagging rather than silently
                # skipping or guessing.
                shift_raw = (row.get("shift") or "").strip()
                days_raw = (row.get("days") or "").strip()
                start_raw = (row.get("start") or "").strip()
                end_raw = (row.get("end") or "").strip()
                schedule_cells = [shift_raw, days_raw, start_raw, end_raw]

                if not any(schedule_cells):
                    continue

                if not all(schedule_cells):
                    errors.append(
                        f"Row {row_num}: staff saved, but schedule needs shift, "
                        f"days, start, and end all filled in to create a "
                        f"schedule -- skipped the schedule for this row."
                    )
                    continue

                shift_type = _parse_shift_type_cell(shift_raw)
                days_of_week = _parse_days_of_week_cell(days_raw)
                start_time = _parse_time_cell(start_raw, "start")
                end_time = _parse_time_cell(end_raw, "end")
                start_date = _parse_date_cell(row.get("start_date"), "start_date") or timezone.now().date()
                end_date = _parse_date_cell(row.get("end_date"), "end_date")

                pattern, pattern_created = StaffRecurringPattern.objects.update_or_create(
                    organization=organization,
                    staff=staff,
                    shift_type=shift_type,
                    defaults={
                        "days_of_week": days_of_week,
                        "start_time": start_time,
                        "end_time": end_time,
                        "start_date": start_date,
                        "end_date": end_date,
                        "is_active": True,
                    },
                )
                if pattern_created:
                    schedules_created_count += 1
                else:
                    schedules_updated_count += 1

                # Generate this pattern's shifts immediately, same as
                # creating/editing one by hand on the Assign Schedule tab,
                # so it shows up on the calendar right away instead of
                # waiting for the next automated generation run.
                generate_shifts_for_pattern(pattern)
            except ValueError as e:
                errors.append(f"Row {row_num}: {e}")
            except Exception as e:
                errors.append(f"Row {row_num}: {e}")

        return Response(
            {
                "created": created_count,
                "updated": updated_count,
                "schedules_created": schedules_created_count,
                "schedules_updated": schedules_updated_count,
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
