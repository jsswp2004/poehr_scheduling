"""
Scheduled report emails: when a subscription is due, build its report file(s) for the period it
covers and email them to its recipients.

Called from the hourly Staffing job (appointments.views.RunStaffingHourlyJobsView), so a send
goes out on the hour it is scheduled for (or at the next hourly run if that one was late).
"""

import calendar
import datetime
import logging
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import EmailMessage
from django.utils import timezone

from . import report_export
from .models import ReportSubscription

logger = logging.getLogger(__name__)

# covers -> label shown in the Subscribe dialog
COVERS = {
    "today": "Today",
    "yesterday": "Yesterday",
    "tomorrow": "Tomorrow",
    "previous_week": "The previous week (Mon - Sun)",
    "this_week": "The current week (Mon - Sun)",
    "next_week": "The coming week (Mon - Sun)",
    "last_7_days": "The last 7 days",
    "next_7_days": "The next 7 days",
    "previous_month": "The previous month",
    "this_month": "The current month",
    "next_month": "The coming month",
}
SINGLE_DAY_COVERS = ("today", "yesterday", "tomorrow")
MAX_RECIPIENTS = 25
PARAM_KEYS = ("profession", "staff", "unit", "shift", "status", "form")


def zone(name):
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("America/New_York")


def _month_bounds(year, month):
    return datetime.date(year, month, 1), datetime.date(year, month, calendar.monthrange(year, month)[1])


def period_for(covers, today):
    """(start, end) dates for a `covers` value, where `today` is the date in the subscription's zone."""
    one = datetime.timedelta(days=1)
    monday = today - datetime.timedelta(days=today.weekday())
    if covers == "today":
        return today, today
    if covers == "yesterday":
        return today - one, today - one
    if covers == "tomorrow":
        return today + one, today + one
    if covers == "this_week":
        return monday, monday + datetime.timedelta(days=6)
    if covers == "previous_week":
        return monday - datetime.timedelta(days=7), monday - one
    if covers == "next_week":
        return monday + datetime.timedelta(days=7), monday + datetime.timedelta(days=13)
    if covers == "last_7_days":
        return today - datetime.timedelta(days=7), today - one
    if covers == "next_7_days":
        return today + one, today + datetime.timedelta(days=7)
    first = today.replace(day=1)
    if covers == "this_month":
        return _month_bounds(today.year, today.month)
    if covers == "previous_month":
        prev = first - one
        return _month_bounds(prev.year, prev.month)
    if covers == "next_month":
        nxt = (first + datetime.timedelta(days=32)).replace(day=1)
        return _month_bounds(nxt.year, nxt.month)
    raise ValueError(f"Unknown period '{covers}'.")


def compute_next_run(sub, now=None):
    """
    The next UTC moment `sub` is due, strictly after `now` (None when a one-time send has passed).

    `start_date` is the calendar date of the first send: nothing is due before that date at the chosen
    hour, and weekly / monthly subscriptions repeat on that date's weekday / day number.
    """
    now = now or timezone.now()
    tz = zone(sub.timezone)
    local_now = now.astimezone(tz)
    hour = int(sub.send_hour or 0)

    def at(day):
        return datetime.datetime(day.year, day.month, day.day, hour, 0, tzinfo=tz)

    start = sub.start_date
    if sub.frequency == "once":
        if start is None:
            return None
        return at(start).astimezone(datetime.timezone.utc) if at(start) > local_now else None

    # Nothing is due before the first send: look for the first slot strictly after the moment just before it.
    base = local_now
    if start is not None and at(start) > local_now:
        base = at(start) - datetime.timedelta(seconds=1)
    today = base.date()
    if sub.frequency == "daily":
        day = today
        if at(day) <= base:
            day += datetime.timedelta(days=1)
    elif sub.frequency == "weekly":
        weekday = start.weekday() if start is not None else int(sub.weekday)
        day = today + datetime.timedelta(days=(weekday - today.weekday()) % 7)
        if at(day) <= base:
            day += datetime.timedelta(days=7)
    else:  # monthly
        month_day = start.day if start is not None else int(sub.month_day)
        year, month = today.year, today.month
        while True:
            last = calendar.monthrange(year, month)[1]
            wanted = last if month_day == 0 else min(month_day, last)
            day = datetime.date(year, month, wanted)
            if at(day) > base:
                break
            month += 1
            if month == 13:
                year, month = year + 1, 1
    return at(day).astimezone(datetime.timezone.utc)


def describe_schedule(sub):
    days = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]
    hour = int(sub.send_hour)
    clock = f"{hour % 12 or 12}:00 {'AM' if hour < 12 else 'PM'}"
    start = sub.start_date
    if sub.frequency == "once":
        return f"Once on {start:%b} {start.day}, {start:%Y} {clock}" if start else f"Once {clock}"
    if sub.frequency == "daily":
        return f"Every day {clock}"
    if sub.frequency == "weekly":
        weekday = start.weekday() if start else int(sub.weekday)
        return f"{days[weekday % 7]} {clock}"
    month_day = start.day if start else int(sub.month_day)
    return ("Last day of the month " if month_day == 0 else f"Day {month_day} of the month ") + clock


def _range_text(start, end):
    def f(d):
        return f"{d:%b} {d.day}, {d:%Y}"

    return f(start) if start == end else f"{f(start)} - {f(end)}"


def _owner(sub):
    user = sub.created_by
    if user is None or not user.is_active:
        return None
    return user


def build_files(sub, now=None, user=None):
    """([ReportFile...], (start, end)) for one subscription, for the period it covers right now."""
    now = now or timezone.now()
    user = user or _owner(sub)
    if user is None:
        raise report_export.ReportError("The person who set up this subscription is no longer active.")
    today = now.astimezone(zone(sub.timezone)).date()
    start, end = period_for(sub.covers, today)
    if sub.custom_report_id:  # a saved Reports-module report, built as the person running it
        from . import report_subscription_custom as custom

        return custom.build_files(sub, start, end, user), (start, end)
    params = {k: v for k, v in (sub.params or {}).items() if k in PARAM_KEYS}
    params.update({"start": start.isoformat(), "end": end.isoformat()})
    if sub.report == "daily_forms":
        params["date"] = start.isoformat()
    files = [
        report_export.build_report(sub.report, fmt, user, sub.organization, params, tz=sub.timezone)
        for fmt in (sub.formats or [])
    ]
    return files, (start, end)


def _send(sub, recipient, subject, body, files, user):
    from communicator.models import MessageLog

    log = dict(
        user=user,
        organization=sub.organization,
        recipient=recipient,
        subject=subject,
        body=body,
        message_type="email",
    )
    try:
        message = EmailMessage(subject=subject, body=body, from_email=settings.DEFAULT_FROM_EMAIL, to=[recipient])
        for f in files:
            message.attach(f.filename, f.data, f.content_type)
        message.send(fail_silently=False)
        MessageLog.objects.create(status="sent", **log)
        return None
    except Exception as exc:  # one bad address must not stop the others
        MessageLog.objects.create(status="failed", provider_id=str(exc)[:250], **log)
        return str(exc)


def deliver(sub, recipients=None, now=None, record=True, user=None):
    """
    Email the report. `recipients` overrides the saved list (Send now to me / Send me a test).
    Returns (status, detail): status is "sent", "partial" or "failed".
    """
    now = now or timezone.now()
    targets = list(recipients if recipients is not None else (sub.recipients or []))
    status, detail = "failed", ""
    try:
        files, (start, end) = build_files(sub, now, user=user)
        label = sub.custom_report.name if sub.custom_report_id else report_export.REPORTS[sub.report][0]
        rng = _range_text(start, end)
        subject = f"{label}: {rng}"
        summary = " ".join(f.summary for f in files[:1]).strip()
        errors = []
        total = len(targets)
        extra = ""
        if sub.custom_report_id:
            from . import report_subscription_custom as custom

            owner = user or _owner(sub)
            if custom.needs_phi_check(sub.custom_report, bool(sub.hide_phi), owner):
                # Patient names go only to active users who may run this report themselves (checked at every send).
                allowed = [a for a in targets if custom.recipient_ok(sub.custom_report, a)]
                errors += [f"{a}: not allowed to receive patient names" for a in targets if a not in allowed]
                targets = allowed
                extra = "This report contains patient information. Do not forward it. "
            elif sub.hide_phi:
                extra = "Patient names and free text are hidden in this report. "
        body = (
            f"Hello,\n\n"
            f"Your {sub.get_frequency_display().lower()} {label} report for {sub.organization.name} is attached. "
            f"It covers {rng}. {summary}\n\n{extra}"
            f"You get this because you are subscribed in POWER Staffing. "
            f"Manage or stop it under Reports > Subscriptions.\n"
        )
        for address in targets:
            err = _send(sub, address, subject, body, files, sub.created_by if user is None else user)
            if err:
                errors.append(f"{address}: {err}")
        sent = total - len(errors)
        status = "sent" if not errors else ("partial" if sent else "failed")
        detail = f"{sent} of {total} delivered" + (("; " + "; ".join(errors))[:600] if errors else "")
    except Exception as exc:
        logger.exception("Report subscription %s failed", getattr(sub, "pk", "?"))
        detail = str(exc)[:600]
    if record and sub.pk:
        ReportSubscription.objects.filter(pk=sub.pk).update(
            last_run_at=now, last_status=status, last_detail=detail
        )
    return status, detail


def send_due_subscriptions(now=None):
    """Hourly: send every active subscription whose time has come. Returns a short summary dict."""
    now = now or timezone.now()
    due = list(
        ReportSubscription.objects.filter(is_active=True, next_run_at__isnull=False, next_run_at__lte=now)
        .select_related("organization", "created_by")
    )
    sent = failed = skipped = 0
    for sub in due:
        # Claim the run first so an overlapping job cannot send the same email twice.
        following = compute_next_run(sub, now)
        changes = {"next_run_at": following}
        if sub.frequency == "once":
            changes["is_active"] = False  # a one-time send is finished once it goes out
        claimed = ReportSubscription.objects.filter(pk=sub.pk, next_run_at=sub.next_run_at).update(**changes)
        if not claimed:
            skipped += 1
            continue
        status, _detail = deliver(sub, now=now)
        if status == "failed":
            failed += 1
        else:
            sent += 1
    return {"due": len(due), "sent": sent, "failed": failed, "skipped": skipped}
