"""
Emergency call-out alerting + "who can cover" suggestions.

When a staff member reports an emergency (or an admin logs a phone call-out),
notify_emergency() tells every admin in the org right away -- email always, SMS to
admins who have consented -- with the affected shift(s) and a short list of people
who are free and could be called to cover.
"""

import datetime
import logging

from django.conf import settings
from django.utils import timezone

from .coverage import shift_hours
from .models import Staff, StaffShift, StaffTimeOffRequest

logger = logging.getLogger(__name__)

FRONTEND_BASE_URL = getattr(settings, "FRONTEND_BASE_URL", "https://www.powerhealthcareit.com")


def affected_shifts(req):
    """The shifts a request takes the person off: the named shift, or all in range."""
    if req.shift_id:
        return list(StaffShift.objects.filter(pk=req.shift_id).select_related("unit"))
    return list(
        StaffShift.objects.filter(
            staff=req.staff,
            date__gte=req.start_date,
            date__lte=req.end_date,
            is_cancelled=False,
        ).select_related("unit")
    )


def cover_candidates(req, limit=15):
    """
    Active staff who could be called to cover: not the requester, not already
    scheduled on any affected date, and not themselves out. Best matches first
    (same nursing role, then other direct-care roles), then the lightest week.
    """
    start, end = req.start_date, req.end_date

    busy = set(
        StaffShift.objects.filter(
            organization=req.organization, date__gte=start, date__lte=end, is_cancelled=False
        ).values_list("staff_id", flat=True)
    )
    out = {
        r.staff_id
        for r in StaffTimeOffRequest.objects.filter(
            organization=req.organization, start_date__lte=end, end_date__gte=start
        )
        if r.takes_staff_out
    }
    excluded = busy | out | {req.staff_id}

    pool = list(
        Staff.objects.filter(organization=req.organization, is_active=True).exclude(pk__in=excluded)
    )
    if not pool:
        return []

    # Hours already worked in the surrounding week (fairness / overtime awareness).
    week_lo, week_hi = start - datetime.timedelta(days=3), end + datetime.timedelta(days=3)
    week_hours = {}
    for s in StaffShift.objects.filter(
        staff__in=pool, date__gte=week_lo, date__lte=week_hi, is_cancelled=False
    ):
        week_hours[s.staff_id] = week_hours.get(s.staff_id, 0.0) + shift_hours(s)

    want = req.staff.nursing_role
    counted = {"rn", "lpn", "cna"}

    def rank(st):
        if st.nursing_role == want:
            tier = 0
        elif st.nursing_role in counted and want in counted:
            tier = 1
        else:
            tier = 2
        return (tier, week_hours.get(st.id, 0.0), st.last_name, st.first_name)

    pool.sort(key=rank)
    return [
        {
            "id": st.id,
            "name": st.full_name,
            "profession": st.profession,
            "nursing_role": st.nursing_role,
            "phone_number": st.phone_number,
            "email": st.email,
            "week_hours": round(week_hours.get(st.id, 0.0), 1),
        }
        for st in pool[:limit]
    ]


def _shift_line(s):
    when = s.date.strftime("%a %b %d")
    label = s.get_shift_type_display()
    t = s.start_time.strftime("%I:%M %p").lstrip("0") if s.start_time else ""
    unit = f" - {s.unit.name}" if s.unit_id else ""
    return f"{when}: {label}{unit}{' ' + t if t else ''}"


def build_alert_text(req):
    staff = req.staff
    shifts = affected_shifts(req)
    lines = [
        f"EMERGENCY CALL-OUT: {staff.full_name} ({staff.profession}) cannot work.",
        "",
    ]
    if shifts:
        lines.append("Shift(s) needing cover:")
        lines += [f"  - {_shift_line(s)}" for s in shifts]
    else:
        lines.append(f"Dates: {req.start_date} to {req.end_date} (no shift is currently scheduled).")
    if req.reason:
        lines += ["", f"Reason given: {req.reason}"]

    cands = cover_candidates(req, limit=5)
    lines += ["", "People who are free and could be called to cover:"]
    if cands:
        for c in cands:
            contact = c["phone_number"] or c["email"] or "no contact on file"
            lines.append(f"  - {c['name']} ({c['nursing_role'].upper()}) {contact}")
    else:
        lines.append("  - No available staff found. Consider agency or on-call staff.")

    lines += ["", f"Arrange cover in Staffing > Time Off: {FRONTEND_BASE_URL}/staffing"]
    body = "\n".join(lines)

    first = shifts[0] if shifts else None
    sms = (
        f"POWER Staffing: {staff.full_name} called out"
        + (f" - {_shift_line(first)}" if first else f" ({req.start_date})")
        + (f" (+{len(shifts) - 1} more)" if len(shifts) > 1 else "")
        + ". Cover needed. Open Staffing > Time Off."
    )
    return f"Staffing emergency: {staff.full_name} cannot work", body, sms


def notify_emergency(req):
    """
    Alert the org's admins. Never raises -- reporting an emergency must not fail
    because an email/SMS provider is down. Returns {"emails": n, "sms": n, "errors": [...]}.
    """
    summary = {"emails": 0, "sms": 0, "errors": []}
    try:
        from communicator.utils import send_email, send_sms
        from users.models import CustomUser

        subject, body, sms = build_alert_text(req)
        org = req.organization
        admins = CustomUser.objects.filter(
            organization=org, role__in=("admin", "system_admin"), is_active=True
        )
        for admin in admins:
            if admin.email:
                try:
                    send_email(admin.email, subject, body, user=admin, organization=org)
                    summary["emails"] += 1
                except Exception as exc:  # noqa: BLE001
                    summary["errors"].append(f"email {admin.email}: {exc}")
            if (
                org.staffing_messaging_enabled
                and admin.phone_number
                and admin.sms_consent
                and not admin.sms_opt_out
            ):
                try:
                    send_sms(admin.phone_number, sms, user=admin, organization=org)
                    summary["sms"] += 1
                except Exception as exc:  # noqa: BLE001
                    summary["errors"].append(f"sms {admin.phone_number}: {exc}")

        if summary["emails"] or summary["sms"]:
            req.alert_sent_at = timezone.now()
            req.save(update_fields=["alert_sent_at", "updated_at"])
    except Exception as exc:  # noqa: BLE001
        logger.exception("Emergency alert failed for request %s", getattr(req, "pk", None))
        summary["errors"].append(str(exc))
    return summary
