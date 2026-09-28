"""
Per-organization messaging usage & overage-cost calculator for automatic
email/SMS reminders.

This is deliberately just a *calculator* over the existing MessageLog table
-- it does not talk to Stripe. Reporting usage to Stripe (so it actually
shows up on a subscriber's invoice) is a separate, later step that touches
real billing and should not run until that integration is built and tested.

Pricing model (see the "fully separate configs" / billing conversation):
  - Each subscription tier gets a free monthly allowance of emails and SMS.
  - Anything sent beyond that allowance in a calendar month is billable
    "overage", at a flat per-message rate.
  - Only messages that actually went out (MessageLog.status == "sent")
    count toward usage or cost -- failed sends and consent-blocked sends
    are never billed.
"""

from datetime import datetime

from django.utils import timezone

from communicator.models import MessageLog

# Per-message overage rate, in US dollars. Applies once an organization's
# free monthly allowance (below) is exceeded for that message type.
MESSAGING_OVERAGE_RATES = {
    "email": 0.01,
    "sms": 0.03,
}

# Free monthly allowance per subscription tier. `None` means unlimited
# (no overage ever billed for that message type on that tier).
#
# Basic ("Professional Plan") only advertises email notifications today,
# so it gets 0 free SMS -- any SMS sent by a Basic org is billed in full
# at the overage rate, not just the amount past a hidden allowance.
# Premium ("Clinic Plan") advertises both email and SMS reminders as
# included, so it gets a real monthly allowance of each before overage
# billing kicks in. Enterprise ("Group Plan") is unlimited.
MESSAGING_ALLOWANCES = {
    "basic": {"email": 200, "sms": 0},
    "premium": {"email": 1000, "sms": 300},
    "enterprise": {"email": None, "sms": None},
}


def _default_tier_allowance():
    # Fallback for an organization whose subscription_tier doesn't match
    # any known key -- treat it like Basic rather than crashing or
    # silently giving it unlimited free messages.
    return MESSAGING_ALLOWANCES["basic"]


def get_allowance_for_tier(tier):
    return MESSAGING_ALLOWANCES.get(tier, _default_tier_allowance())


def _month_bounds(year, month):
    """Return (start, end) datetimes (timezone-aware, end-exclusive) for
    the given calendar month. `end` is midnight on the first day of the
    following month, so the range cleanly covers the whole month
    regardless of how many days it has."""
    start = timezone.make_aware(datetime(year, month, 1))
    if month == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, month + 1
    end = timezone.make_aware(datetime(next_year, next_month, 1))
    return start, end


def compute_messaging_usage(organization, year=None, month=None):
    """
    Compute an organization's messaging usage and overage cost for one
    calendar month (defaults to the current month).

    Returns a dict with counts, free allowance, billable overage, and the
    resulting dollar cost per message type, plus a total.
    """
    now = timezone.now()
    year = year or now.year
    month = month or now.month
    period_start, period_end = _month_bounds(year, month)

    tier = getattr(organization, "subscription_tier", "basic") or "basic"
    allowance = get_allowance_for_tier(tier)

    logs = MessageLog.objects.filter(
        organization=organization,
        status="sent",
        created_at__gte=period_start,
        created_at__lt=period_end,
    )

    email_sent = logs.filter(message_type="email").count()
    sms_sent = logs.filter(message_type="sms").count()

    def _overage(sent, free):
        if free is None:
            return 0
        return max(0, sent - free)

    email_overage = _overage(email_sent, allowance["email"])
    sms_overage = _overage(sms_sent, allowance["sms"])

    email_cost = round(email_overage * MESSAGING_OVERAGE_RATES["email"], 2)
    sms_cost = round(sms_overage * MESSAGING_OVERAGE_RATES["sms"], 2)

    return {
        "organization_id": organization.id,
        "organization_name": organization.name,
        "subscription_tier": tier,
        "period": {
            "year": year,
            "month": month,
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
        },
        "email": {
            "sent": email_sent,
            "included": allowance["email"],
            "billable": email_overage,
            "rate": MESSAGING_OVERAGE_RATES["email"],
            "cost": email_cost,
        },
        "sms": {
            "sent": sms_sent,
            "included": allowance["sms"],
            "billable": sms_overage,
            "rate": MESSAGING_OVERAGE_RATES["sms"],
            "cost": sms_cost,
        },
        "total_cost": round(email_cost + sms_cost, 2),
    }
