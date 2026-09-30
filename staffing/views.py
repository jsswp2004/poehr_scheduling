import csv
import datetime
import logging
import re

from django.db.models import Q
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
    CoverageAlert,
    Unit,
    UnitCensus,
    SHIFT_TYPE_CHOICES,
    DAY_OF_WEEK_CHOICES,
    VALID_DAY_CODES,
)
from .coverage import evaluate_requirement
from .shift_generation import generate_shifts_for_pattern
from .serializers import (
    StaffRecurringPatternSerializer,
    StaffSerializer,
    StaffShiftSerializer,
    ShiftCoverageRequirementSerializer,
    UnitSerializer,
    UnitCensusSerializer,
)

logger = logging.getLogger(__name__)

ADMIN_ROLES = ("admin", "system_admin")
# Roles allowed to use the manager side of Staffing (same list as the web
# StaffingPage). Read access used to be open to ANY authenticated user in the
# organization -- including patient accounts -- which exposed the roster's
# phone numbers/emails and every shift.
MANAGER_ROLES = ("admin", "system_admin", "doctor", "nurse", "registrar")
# Roster staff with an app login (Staff.user) get read-only access to the
# shared shift calendar only (they may see coworkers), never to roster
# contact details, patterns, coverage settings, reports or messaging.
STAFF_LOGIN_ROLE = "staff"


class IsStaffingManager(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in MANAGER_ROLES)


class IsStaffingManagerOrStaffReadOnly(permissions.BasePermission):
    """Managers: as before. Role 'staff': safe (read) methods only."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role in MANAGER_ROLES:
            return True
        return user.role == STAFF_LOGIN_ROLE and request.method in permissions.SAFE_METHODS


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

    permission_classes = [IsStaffingManager]

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

    def perform_update(self, serializer):
        staff = serializer.save()
        # Keep the linked app login in step with the roster entry: a
        # deactivated staff member must not be able to keep signing in.
        if staff.user_id and staff.user.is_active != staff.is_active:
            staff.user.is_active = staff.is_active
            staff.user.save(update_fields=["is_active"])


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
    permission_classes = [IsStaffingManagerOrStaffReadOnly]

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
        profession = self.request.query_params.get("profession")
        if profession:
            qs = qs.filter(staff__profession=profession)
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

    permission_classes = [IsStaffingManager]
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


class UnitViewSet(StaffingAdminWriteMixin, viewsets.ModelViewSet):
    """
    Nursing units (e.g. "2 West"). Each has a shift pattern toggle
    (8h = Day/Evening/Night, 12h = Day/Night) that drives HPPD staffing
    requirements. Managers can read; only admins can change.
    """

    serializer_class = UnitSerializer

    def get_queryset(self):
        qs = _org_queryset(Unit, self.request)
        active_only = self.request.query_params.get("active_only")
        if active_only in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        return qs.order_by("name")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # One query for every unit's most recent census, instead of one each.
        latest = {}
        qs = _org_queryset_for_census(self.request).order_by("unit_id", "-date")
        for entry in qs:
            latest.setdefault(entry.unit_id, entry)
        ctx["latest_census"] = latest
        return ctx

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == "system_admin" and self.request.data.get("organization"):
            serializer.save(organization_id=self.request.data.get("organization"))
        else:
            serializer.save(organization=user.organization)

    def destroy(self, request, *args, **kwargs):
        denied = self._require_admin(request)
        if denied:
            return denied
        unit = self.get_object()
        # Deleting would cascade to the unit's census history and coverage
        # requirements, silently removing staffing rules. Deactivate instead.
        if unit.coverage_requirements.exists() or unit.census_entries.exists():
            return Response(
                {
                    "error": "This unit has census history or coverage "
                    "requirements. Mark it inactive instead of deleting it."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


def _org_queryset_for_census(request):
    user = request.user
    qs = UnitCensus.objects.all()
    if user.role != "system_admin":
        qs = qs.filter(unit__organization=user.organization)
    return qs


class UnitCensusViewSet(viewsets.ModelViewSet):
    """
    Daily census per unit. Open to every staffing manager role (charge
    nurses enter census, not just admins). Entering a census for a unit and
    date that already has one updates it rather than erroring, so the
    daily grid can simply save what is on screen.

    GET /api/staffing/census/?unit=<id>&start=YYYY-MM-DD&end=YYYY-MM-DD
    """

    serializer_class = UnitCensusSerializer
    permission_classes = [IsStaffingManager]

    def get_queryset(self):
        qs = _org_queryset_for_census(self.request).select_related(
            "unit", "entered_by"
        )
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        start = self.request.query_params.get("start")
        end = self.request.query_params.get("end")
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        entry, created = UnitCensus.objects.update_or_create(
            unit=data["unit"],
            date=data["date"],
            defaults={
                "census": data["census"],
                "notes": data.get("notes", ""),
                "entered_by": request.user,
            },
        )
        out = self.get_serializer(entry)
        return Response(
            out.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def perform_update(self, serializer):
        serializer.save(entered_by=self.request.user)


class SendStaffMessageView(APIView):
    """
    Admin-triggered ad-hoc SMS or email to a single roster staff member --
    powers the SMS/Email buttons on the Roster tab. Distinct from the
    automatic 3-hours-before-shift reminder job (staffing.reminders): this
    is a manual, one-off send, and it deliberately bypasses the
    CustomUser SMS opt-out check since staff-roster entries aren't login
    accounts and that consent system is for patients/contacts.
    """

    permission_classes = [IsStaffingManager]

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


class UnscheduledStaffReportView(APIView):
    """
    Reports tab -- "No Schedule" report: active staff members who have
    zero non-cancelled StaffShift rows anywhere in [start, end]. Lets an
    admin quickly see who hasn't been put on the calendar for a given
    week/month, as opposed to StaffShiftViewSet which reports shifts that
    DO exist.

    GET /api/staffing/reports/unscheduled/?start=YYYY-MM-DD&end=YYYY-MM-DD
    Both params are optional; defaults to the current week (today ..
    today + 6 days) if omitted, so a bare GET is still meaningful.
    """

    permission_classes = [IsStaffingManager]

    def get(self, request):
        today = timezone.now().date()
        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = _parse_date_cell(start_raw, "start") if start_raw else today
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        try:
            end = _parse_date_cell(end_raw, "end") if end_raw else start + datetime.timedelta(days=6)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        staff_qs = _org_queryset(Staff, request).filter(is_active=True)
        profession = request.query_params.get("profession")
        if profession:
            staff_qs = staff_qs.filter(profession=profession)

        scheduled_staff_ids = (
            StaffShift.objects.filter(
                staff__in=staff_qs,
                date__gte=start,
                date__lte=end,
                is_cancelled=False,
            )
            .values_list("staff_id", flat=True)
            .distinct()
        )

        unscheduled = staff_qs.exclude(id__in=scheduled_staff_ids).order_by(
            "last_name", "first_name"
        )

        return Response(
            {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "count": unscheduled.count(),
                "staff": StaffSerializer(unscheduled, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


def _shift_duration_hours(shift):
    """
    Hours between a shift's start_time and end_time, handling overnight
    shifts (end clock-time earlier than/equal to start clock-time means it
    crosses midnight, same convention as the calendar rendering fix in
    StaffingCalendarTab.js). Returns None if either time is missing.
    """
    if not shift.start_time or not shift.end_time:
        return None
    start_dt = datetime.datetime.combine(shift.date, shift.start_time)
    end_dt = datetime.datetime.combine(shift.date, shift.end_time)
    if end_dt <= start_dt:
        end_dt += datetime.timedelta(days=1)
    return (end_dt - start_dt).total_seconds() / 3600.0


class LaborHoursReportView(APIView):
    """
    Reports tab -- "Labor Hours Summary": total scheduled hours per staff
    member over a date range, from non-cancelled StaffShift rows with
    both a start_time and end_time set. Useful for a quick payroll
    cross-check or spotting who's creeping into overtime.

    GET /api/staffing/reports/labor-hours/?start=YYYY-MM-DD&end=YYYY-MM-DD&profession=...
    Both start/end default to the current week if omitted.
    """

    permission_classes = [IsStaffingManager]

    def get(self, request):
        today = timezone.now().date()
        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = _parse_date_cell(start_raw, "start") if start_raw else today - datetime.timedelta(days=today.weekday())
            end = _parse_date_cell(end_raw, "end") if end_raw else start + datetime.timedelta(days=6)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        shifts = _org_queryset(StaffShift, request).filter(
            date__gte=start,
            date__lte=end,
            is_cancelled=False,
            start_time__isnull=False,
            end_time__isnull=False,
        ).select_related("staff")

        profession = request.query_params.get("profession")
        if profession:
            shifts = shifts.filter(staff__profession=profession)

        totals = {}
        for shift in shifts:
            hours = _shift_duration_hours(shift)
            if hours is None:
                continue
            key = shift.staff_id
            entry = totals.setdefault(
                key,
                {
                    "staff_id": shift.staff_id,
                    "full_name": shift.staff.full_name,
                    "profession": shift.staff.profession,
                    "shift_count": 0,
                    "total_hours": 0.0,
                },
            )
            entry["shift_count"] += 1
            entry["total_hours"] += hours

        rows = sorted(totals.values(), key=lambda r: r["total_hours"], reverse=True)
        for row in rows:
            row["total_hours"] = round(row["total_hours"], 2)

        return Response(
            {"start": start.isoformat(), "end": end.isoformat(), "rows": rows},
            status=status.HTTP_200_OK,
        )


class CoverageComplianceReportView(APIView):
    """
    Reports tab -- "Coverage Compliance": for every active
    ShiftCoverageRequirement, walks each date in the range it applies to
    and reports whether that date/shift-type combination was actually met
    (enough distinct staff assigned) or understaffed, plus whether the
    understaffing alert email already fired for it. Turns the
    once-per-gap CoverageAlert log into a full picture of the period,
    including the days that WERE covered, not just the misses.

    GET /api/staffing/reports/coverage-compliance/?start=YYYY-MM-DD&end=YYYY-MM-DD
    Defaults to the current week if omitted. The range is capped at 62
    days to keep the per-day requirement walk bounded.
    """

    permission_classes = [IsStaffingManager]
    MAX_RANGE_DAYS = 62

    def get(self, request):
        today = timezone.now().date()
        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = _parse_date_cell(start_raw, "start") if start_raw else today - datetime.timedelta(days=today.weekday())
            end = _parse_date_cell(end_raw, "end") if end_raw else start + datetime.timedelta(days=6)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        if (end - start).days > self.MAX_RANGE_DAYS:
            return Response(
                {"error": f"Date range too large for this report (max {self.MAX_RANGE_DAYS} days)."},
                status=400,
            )

        requirements = _org_queryset(ShiftCoverageRequirement, request).filter(is_active=True).select_related("unit")

        rows = []
        understaffed_count = 0
        for req in requirements:
            a_date = start
            while a_date <= end:
                if req.applies_on(a_date):
                    result = evaluate_requirement(req, a_date)
                    eff = result.requirement
                    assigned = result.assigned
                    met = result.met
                    if not met:
                        understaffed_count += 1
                    rows.append(
                        {
                            "requirement_id": req.id,
                            "shift_type": req.shift_type,
                            "shift_type_display": req.get_shift_type_display(),
                            "date": a_date.isoformat(),
                            "required": eff.required_staff,
                            "mode": eff.mode,
                            "unit_id": req.unit_id,
                            "unit_name": req.unit.name if req.unit_id else None,
                            "census": eff.census,
                            "census_source": eff.census_source,
                            "required_hours": eff.required_hours,
                            "required_rn": eff.required_rn,
                            "note": eff.note,
                            "hours_scheduled": result.hours_scheduled,
                            "rn_scheduled": result.rn_scheduled,
                            "shortfalls": list(result.shortfalls),
                            "assigned": assigned,
                            "status": "Met" if met else "Understaffed",
                            "alert_sent": CoverageAlert.objects.filter(
                                requirement=req, date=a_date
                            ).exists(),
                        }
                    )
                a_date += datetime.timedelta(days=1)

        rows.sort(key=lambda r: (r["date"], r["shift_type"]))

        return Response(
            {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "understaffed_count": understaffed_count,
                "checked_count": len(rows),
                "rows": rows,
            },
            status=status.HTTP_200_OK,
        )


class MessageDeliveryLogReportView(APIView):
    """
    Reports tab -- "Message Delivery Log": every SMS/email this
    organization's Staffing module has sent in the date range --
    automated shift reminders, ad-hoc messages sent from the Roster tab's
    SMS/Email buttons, and understaffing alert emails to admins -- pulled
    from communicator.models.MessageLog and matched back to a staff
    member (or flagged as an admin alert) so it reads like a Staffing
    report rather than a raw message log.

    GET /api/staffing/reports/message-log/?start=YYYY-MM-DD&end=YYYY-MM-DD&staff=<id>
    Defaults to the current week if omitted. Capped at 1000 rows.
    """

    permission_classes = [IsStaffingManager]
    MAX_ROWS = 1000

    def get(self, request):
        from communicator.models import MessageLog
        from communicator.utils import format_phone_to_international

        today = timezone.now().date()
        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = _parse_date_cell(start_raw, "start") if start_raw else today - datetime.timedelta(days=today.weekday())
            end = _parse_date_cell(end_raw, "end") if end_raw else start + datetime.timedelta(days=6)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        staff_qs = _org_queryset(Staff, request)
        staff_id = request.query_params.get("staff")
        if staff_id:
            staff_qs = staff_qs.filter(id=staff_id)

        phone_to_staff = {}
        email_to_staff = {}
        for s in staff_qs:
            if s.phone_number:
                phone_to_staff[format_phone_to_international(s.phone_number)] = s
                phone_to_staff[s.phone_number] = s
            if s.email:
                email_to_staff[s.email.strip().lower()] = s

        if request.user.role == "system_admin":
            org_filter = {}
        else:
            org_filter = {"organization": request.user.organization}

        base_qs = MessageLog.objects.filter(
            created_at__date__gte=start,
            created_at__date__lte=end,
            **org_filter,
        ).filter(
            Q(recipient__in=phone_to_staff.keys())
            | Q(recipient__in=email_to_staff.keys())
            | Q(subject__startswith="Staffing alert:")
        )
        total_matching = base_qs.count()
        logs = base_qs.order_by("-created_at")[: self.MAX_ROWS]

        rows = []
        for log in logs:
            staff_match = phone_to_staff.get(log.recipient) or email_to_staff.get(
                log.recipient.strip().lower()
            )
            if log.body.startswith("Reminder: you have a"):
                category = "Automated Shift Reminder"
            elif log.subject.startswith("Staffing alert:"):
                category = "Coverage Alert (to admin)"
            else:
                category = "Manual Message"

            # Skip a coverage-alert row if staff filtering was requested --
            # those go to admins, not a specific staff member.
            if staff_id and category == "Coverage Alert (to admin)":
                continue

            rows.append(
                {
                    "sent_at": log.created_at.isoformat(),
                    "channel": log.message_type,
                    "category": category,
                    "recipient": log.recipient,
                    "staff_name": staff_match.full_name if staff_match else None,
                    "subject": log.subject,
                    "status": log.status,
                }
            )

        return Response(
            {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "truncated": total_matching > self.MAX_ROWS,
                "rows": rows,
            },
            status=status.HTTP_200_OK,
        )


class ShiftDistributionReportView(APIView):
    """
    Reports tab -- "Shift-Type Distribution": how day/evening/night/custom
    shifts break down per staff member over a date range, to spot
    workload imbalance (e.g. one person getting every night shift).

    GET /api/staffing/reports/shift-distribution/?start=YYYY-MM-DD&end=YYYY-MM-DD&profession=...
    Defaults to the current week if omitted.
    """

    permission_classes = [IsStaffingManager]

    def get(self, request):
        today = timezone.now().date()
        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        try:
            start = _parse_date_cell(start_raw, "start") if start_raw else today - datetime.timedelta(days=today.weekday())
            end = _parse_date_cell(end_raw, "end") if end_raw else start + datetime.timedelta(days=6)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        shifts = _org_queryset(StaffShift, request).filter(
            date__gte=start, date__lte=end, is_cancelled=False
        ).select_related("staff")

        profession = request.query_params.get("profession")
        if profession:
            shifts = shifts.filter(staff__profession=profession)

        shift_type_codes = [code for code, _label in SHIFT_TYPE_CHOICES]
        by_staff = {}
        totals = {code: 0 for code in shift_type_codes}

        for shift in shifts:
            totals[shift.shift_type] = totals.get(shift.shift_type, 0) + 1
            entry = by_staff.setdefault(
                shift.staff_id,
                {
                    "staff_id": shift.staff_id,
                    "full_name": shift.staff.full_name,
                    "profession": shift.staff.profession,
                    "total": 0,
                    **{code: 0 for code in shift_type_codes},
                },
            )
            entry[shift.shift_type] = entry.get(shift.shift_type, 0) + 1
            entry["total"] += 1

        rows = sorted(by_staff.values(), key=lambda r: r["total"], reverse=True)

        return Response(
            {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "totals": totals,
                "rows": rows,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# "My Shifts": app login for roster staff
# ---------------------------------------------------------------------------

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.utils.encoding import force_bytes, force_str
from django.utils.html import escape
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode


def _staff_for_login(request):
    """The Staff row linked to the requesting user, or None."""
    return getattr(request.user, "staff_profile", None)


class IsStaffLogin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.role == STAFF_LOGIN_ROLE
            and getattr(user, "staff_profile", None) is not None
        )


class MyStaffProfileView(APIView):
    """
    GET/PATCH /api/staffing/me/ -- the signed-in staff member's own roster
    entry. Only reminders_enabled and phone_number are editable.
    """

    permission_classes = [IsStaffLogin]

    def _payload(self, staff):
        org = staff.organization
        return {
            "id": staff.id,
            "full_name": staff.full_name,
            "first_name": staff.first_name,
            "last_name": staff.last_name,
            "profession": staff.profession,
            "phone_number": staff.phone_number,
            "reminders_enabled": staff.reminders_enabled,
            "organization_name": org.name,
            "messaging_enabled": bool(getattr(org, "staffing_messaging_enabled", False)),
        }

    def get(self, request):
        return Response(self._payload(_staff_for_login(request)))

    def patch(self, request):
        staff = _staff_for_login(request)
        fields = []
        if "reminders_enabled" in request.data:
            value = request.data["reminders_enabled"]
            if not isinstance(value, bool):
                return Response({"error": "reminders_enabled must be true or false."}, status=400)
            staff.reminders_enabled = value
            fields.append("reminders_enabled")
        if "phone_number" in request.data:
            phone = (request.data["phone_number"] or "").strip() or None
            if phone and len(phone) > 20:
                return Response({"error": "phone_number is too long."}, status=400)
            staff.phone_number = phone
            fields.append("phone_number")
        if fields:
            staff.save(update_fields=fields + ["updated_at"])
        return Response(self._payload(staff))


class MyShiftsView(APIView):
    """GET /api/staffing/me/shifts/?start=&end= -- only the caller's own shifts."""

    permission_classes = [IsStaffLogin]

    def get(self, request):
        staff = _staff_for_login(request)
        qs = StaffShift.objects.filter(staff=staff, is_cancelled=False)
        try:
            start = _parse_date_cell(request.query_params.get("start"), "start")
            end = _parse_date_cell(request.query_params.get("end"), "end")
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return Response(StaffShiftSerializer(qs, many=True).data)


def _invite_url(request, user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    base = request.build_absolute_uri("/")
    host = request.get_host()
    if not settings.DEBUG and not host.startswith(("localhost", "127.")):
        base = base.replace("http://", "https://", 1)
    return f"{base}api/staffing/accept-invite/{uid}/{token}/"


class InviteStaffView(APIView):
    """
    POST /api/staffing/staff/<id>/invite/ (admin only). Creates the staff
    member's app login (role 'staff', username = email) if they don't have
    one yet, links it to the roster entry, and emails a set-password link.
    Safe to call again to resend the link.
    """

    permission_classes = [IsStaffingManager]

    def post(self, request, staff_id):
        if request.user.role not in ADMIN_ROLES:
            return Response({"error": "Only admins can invite staff."}, status=403)
        try:
            staff = _org_queryset(Staff, request).select_related("organization", "user").get(pk=staff_id)
        except Staff.DoesNotExist:
            return Response({"error": "Staff member not found."}, status=404)
        if not staff.is_active:
            return Response({"error": "Reactivate this staff member before inviting them."}, status=400)
        email = (staff.email or "").strip().lower()
        if not email:
            return Response({"error": f"{staff.full_name} has no email on file."}, status=400)

        User = get_user_model()
        created = False
        user = staff.user
        if user is None:
            if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
                return Response(
                    {"error": "An account with this email already exists. Use a different email for this staff member or contact support."},
                    status=409,
                )
            user = User(
                username=email,
                email=email,
                first_name=staff.first_name,
                last_name=staff.last_name,
                role=STAFF_LOGIN_ROLE,
                organization=staff.organization,
                phone_number=staff.phone_number,
                is_active=True,
            )
            if hasattr(user, "registered"):
                user.registered = True
            user.set_unusable_password()
            user.save()
            staff.user = user
            staff.save(update_fields=["user", "updated_at"])
            created = True

        link = _invite_url(request, user)
        from communicator.utils import send_email

        org_name = staff.organization.name
        body = (
            f"Hello {staff.first_name},\n\n"
            f"{org_name} has invited you to POWER Staffing, where you can see your schedule.\n\n"
            f"Set your password here (the link expires in a few days):\n{link}\n\n"
            f"Your username is: {user.username}\n\n"
            "Then sign in to the POWER Staffing app with that username and password."
        )
        try:
            send_email(email, f"You're invited to POWER Staffing ({org_name})", body,
                       user=request.user, organization=staff.organization)
        except Exception as exc:
            return Response({"error": f"Account created but the email failed to send: {exc}"}, status=502)

        return Response({"ok": True, "created": created, "username": user.username})


_ACCEPT_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>POWER Staffing</title>
<style>body{{font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:40px auto;padding:0 16px}}
input,button{{width:100%;padding:12px;margin:6px 0;font-size:16px;box-sizing:border-box}}
button{{background:#1976d2;color:#fff;border:0;border-radius:8px}}.err{{color:#c62828}}.ok{{color:#2e7d32}}</style></head>
<body><h2>POWER Staffing</h2>{content}</body></html>"""


class AcceptStaffInviteView(APIView):
    """Public set-password page for an invite link (no web-app page needed)."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def _user(self, uidb64, token):
        User = get_user_model()
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(uidb64)))
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return None
        if user.role != STAFF_LOGIN_ROLE or not default_token_generator.check_token(user, token):
            return None
        return user

    def _page(self, content, status=200):
        return HttpResponse(_ACCEPT_PAGE.format(content=content), status=status)

    def get(self, request, uidb64, token):
        user = self._user(uidb64, token)
        if not user:
            return self._page('<p class="err">This link is invalid or has expired. Ask your administrator to resend the invite.</p>', 400)
        return self._page(
            f"<p>Set a password for <b>{escape(user.username)}</b>.</p>"
            '<form method="post"><input type="password" name="password" placeholder="New password" required>'
            '<input type="password" name="confirm" placeholder="Confirm password" required>'
            "<button type=\"submit\">Save password</button></form>"
        )

    def post(self, request, uidb64, token):
        user = self._user(uidb64, token)
        if not user:
            return self._page('<p class="err">This link is invalid or has expired. Ask your administrator to resend the invite.</p>', 400)
        pw = request.POST.get("password", "")
        if pw != request.POST.get("confirm", ""):
            return self._page('<p class="err">Passwords do not match.</p><p><a href="">Try again</a></p>', 400)
        try:
            validate_password(pw, user)
        except DjangoValidationError as e:
            msg = escape(" ".join(e.messages))
            return self._page(f'<p class="err">{msg}</p><p><a href="">Try again</a></p>', 400)
        user.set_password(pw)
        user.save(update_fields=["password"])
        return self._page('<p class="ok">Password saved. Open the POWER Staffing app and sign in with your username and this password.</p>')
