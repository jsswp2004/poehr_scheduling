"""
Hourly automated jobs for the Staffing module:

  1. send_shift_reminders() -- SMS + email to a staff member ~3 hours
     before their shift starts, only if that staff member's
     `reminders_enabled` toggle (set from the Roster tab) is on.

  2. send_coverage_alerts() -- emails the org's admins when a shift type
     that's been marked as needing coverage (a ShiftCoverageRequirement,
     configured on the Assign Schedule tab) is under-staffed for a date
     24 hours out.

Both are called from appointments.views.RunStaffingHourlyJobsView, which
is hit once an hour by a GitHub Actions cron workflow (see
.github/workflows/staffing-hourly-jobs.yml) -- finer-grained than the
once-daily RunScheduledJobsView, since "3 hours before" / "24 hours
before" need better than daily resolution to fire on time.
"""

import datetime
import logging

from django.db.models import Q
from django.utils import timezone

from .models import StaffShift, ShiftCoverageRequirement, CoverageAlert

logger = logging.getLogger(__name__)

# The hourly cron can't hit a shift's exact "3 hours before" instant, so we
# match any shift whose start falls in a 1-hour-wide window centered on
# +3 hours from now. Since the job runs every hour, these windows tile the
# timeline with no gaps and (thanks to reminder_sent_at) no double-sends
# even if a run is late or re-triggered manually.
REMINDER_WINDOW_HOURS = 3
REMINDER_WINDOW_HALF_WIDTH = datetime.timedelta(minutes=30)

# Coverage alerts fire once for the date exactly ~24 hours out; a
# generous window tolerates the job running a little early/late.
COVERAGE_WINDOW_HOURS = 24
COVERAGE_WINDOW_HALF_WIDTH = datetime.timedelta(hours=1)


def _shift_datetime(shift):
    """Best-effort combined date+time for a StaffShift; falls back to
    midnight if no start_time was set (custom/unspecified shifts)."""
    start_time = shift.start_time or datetime.time(0, 0)
    naive = datetime.datetime.combine(shift.date, start_time)
    return timezone.make_aware(naive) if timezone.is_naive(naive) else naive


def send_shift_reminders(now=None):
    """
    Sends the "your shift starts in ~3 hours" SMS/email to every staff
    member with reminders_enabled=True who has an upcoming, non-cancelled
    shift landing in the reminder window, and hasn't already been
    reminded for that shift.

    Returns a dict summary: {"checked": N, "sent": N, "skipped_no_contact": N, "errors": [...]}
    """
    from communicator.utils import send_sms, send_email

    now = now or timezone.now()
    window_start = now + datetime.timedelta(hours=REMINDER_WINDOW_HOURS) - REMINDER_WINDOW_HALF_WIDTH
    window_end = now + datetime.timedelta(hours=REMINDER_WINDOW_HOURS) + REMINDER_WINDOW_HALF_WIDTH

    # Only need to look at shifts within +/- a day of the window to avoid
    # scanning the whole table; date filtering first, then precise
    # datetime filtering in Python (start_time granularity varies).
    candidate_shifts = (
        StaffShift.objects.filter(
            is_cancelled=False,
            reminder_sent_at__isnull=True,
            date__gte=(window_start - datetime.timedelta(days=1)).date(),
            date__lte=(window_end + datetime.timedelta(days=1)).date(),
            staff__reminders_enabled=True,
            staff__is_active=True,
            organization__staffing_messaging_enabled=True,
        )
        .select_related("staff", "organization")
    )

    checked = 0
    sent = 0
    skipped_no_contact = 0
    errors = []

    for shift in candidate_shifts:
        checked += 1
        shift_dt = _shift_datetime(shift)
        if not (window_start <= shift_dt <= window_end):
            continue

        staff = shift.staff
        time_label = shift.start_time.strftime("%I:%M %p").lstrip("0") if shift.start_time else "your scheduled time"
        message = (
            f"Reminder: you have a {shift.get_shift_type_display()} shift on "
            f"{shift.date.strftime('%b %d, %Y')} at {time_label} (in about "
            f"{REMINDER_WINDOW_HOURS} hours)."
        )

        sent_any = False
        if staff.phone_number:
            try:
                send_sms(
                    staff.phone_number,
                    message,
                    organization=shift.organization,
                    bypass_opt_out=True,
                )
                sent_any = True
            except Exception as exc:
                errors.append(f"Shift {shift.id} SMS to {staff.full_name}: {exc}")

        if staff.email:
            try:
                send_email(
                    staff.email,
                    "Upcoming shift reminder",
                    message,
                    organization=shift.organization,
                )
                sent_any = True
            except Exception as exc:
                errors.append(f"Shift {shift.id} email to {staff.full_name}: {exc}")

        if sent_any:
            shift.reminder_sent_at = now
            shift.save(update_fields=["reminder_sent_at"])
            sent += 1
        else:
            skipped_no_contact += 1

    return {
        "checked": checked,
        "sent": sent,
        "skipped_no_contact": skipped_no_contact,
        "errors": errors,
    }


def send_coverage_alerts(now=None):
    """
    For every active ShiftCoverageRequirement, checks the date ~24 hours
    from now: if that date is one the requirement applies to and fewer
    than `min_staff_required` non-cancelled StaffShift rows of that shift
    type exist for the org on that date, emails every admin/system_admin
    user in the org (once per requirement+date, via the CoverageAlert log).

    Returns a dict summary: {"checked": N, "alerts_sent": N, "errors": [...]}
    """
    from communicator.utils import send_email
    from users.models import CustomUser

    from .coverage import evaluate_requirement

    now = now or timezone.now()
    # The 24-hours-out calendar date is what actually matters here (a
    # requirement applies per-date, not per-instant) -- the
    # CoverageAlert unique_together on (requirement, date) is what keeps
    # this hourly job from re-alerting the same gap on every run.
    target_date = (now + datetime.timedelta(hours=COVERAGE_WINDOW_HOURS)).date()

    checked = 0
    alerts_sent = 0
    errors = []

    requirements = ShiftCoverageRequirement.objects.filter(
        is_active=True, organization__staffing_messaging_enabled=True
    ).select_related("organization", "unit")
    for req in requirements:
        checked += 1
        if not req.applies_on(target_date):
            continue
        if CoverageAlert.objects.filter(requirement=req, date=target_date).exists():
            continue  # already alerted for this requirement/date

        result = evaluate_requirement(req, target_date)
        assigned_count = result.assigned
        required_count = result.requirement.required_staff

        if result.met:
            continue

        admins = CustomUser.objects.filter(
            organization=req.organization,
            role__in=("admin", "system_admin"),
        ).exclude(Q(email__isnull=True) | Q(email=""))

        subject = f"Staffing alert: {req.get_shift_type_display()} shift understaffed for {target_date}"
        body = (
            f"The {req.get_shift_type_display()} shift on {target_date.strftime('%b %d, %Y')} "
            f"(about 24 hours from now) requires at least {required_count} staff "
            f"but only has {assigned_count} assigned. Please review the Assign Schedule "
            f"tab in Staffing and cover this shift."
        )
        if result.requirement.mode == "hppd" and result.shortfalls:
            body += " Shortfall: " + "; ".join(result.shortfalls) + "."

        sent_to_any = False
        for admin in admins:
            try:
                send_email(admin.email, subject, body, user=admin, organization=req.organization)
                sent_to_any = True
            except Exception as exc:
                errors.append(f"Coverage alert for requirement {req.id} to {admin.email}: {exc}")

        if sent_to_any:
            CoverageAlert.objects.create(
                requirement=req, date=target_date, staff_assigned_count=assigned_count
            )
            alerts_sent += 1

    return {"checked": checked, "alerts_sent": alerts_sent, "errors": errors}
