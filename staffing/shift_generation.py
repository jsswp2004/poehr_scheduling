"""
Daily top-up generation of StaffShift rows from active
StaffRecurringPattern rows, for a rolling window ahead of today.

Called by RunScheduledJobsView (appointments/views.py) as part of the
existing daily GitHub Actions automation, the same way messaging billing
was wired in -- see Task #11. Idempotent: uses get_or_create keyed on
(staff, date, shift_type, recurring_pattern), so running it more than
once for the same day/pattern never creates duplicates.
"""

import logging
from datetime import timedelta

from django.utils import timezone

from .models import DAY_OF_WEEK_CHOICES, StaffRecurringPattern, StaffShift

logger = logging.getLogger(__name__)

DEFAULT_WINDOW_DAYS = 30


def generate_shifts_from_patterns(window_days=DEFAULT_WINDOW_DAYS):
    """
    For every active recurring pattern, ensure a StaffShift row exists for
    each matching date in [today, today + window_days]. Returns a summary
    dict: {"patterns_processed": N, "shifts_created": N}.
    """
    today = timezone.now().date()
    end_date = today + timedelta(days=window_days)

    patterns_processed = 0
    shifts_created = 0

    for pattern in StaffRecurringPattern.objects.filter(is_active=True).select_related(
        "staff", "organization"
    ):
        patterns_processed += 1
        current = max(pattern.start_date, today)
        pattern_end = min(pattern.end_date, end_date) if pattern.end_date else end_date

        a_date = current
        while a_date <= pattern_end:
            if pattern.applies_on(a_date):
                _shift, created = StaffShift.objects.get_or_create(
                    staff=pattern.staff,
                    date=a_date,
                    shift_type=pattern.shift_type,
                    recurring_pattern=pattern,
                    defaults={
                        "organization": pattern.organization,
                        "start_time": pattern.start_time,
                        "end_time": pattern.end_time,
                        "source": "recurring",
                    },
                )
                if created:
                    shifts_created += 1
            a_date += timedelta(days=1)

    logger.info(
        "Staffing shift generation: %s patterns processed, %s shifts created",
        patterns_processed,
        shifts_created,
    )
    return {"patterns_processed": patterns_processed, "shifts_created": shifts_created}
