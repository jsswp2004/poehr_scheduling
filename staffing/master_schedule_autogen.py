"""
Automatic schedule for the nursing sections of the Master Schedule.

Pure functions (no database) so the rules are easy to read and test.

Rules, by section header (sub-headings such as "Unit 2" and "AGENCY" follow the
header above them):

    FT 7AM - 7PM   -> 7A, 12-hour shifts, 3 a week
    FT 7PM - 7AM   -> 7P, 12-hour shifts, 3 a week
    FT 7-3 CMAs / 7-3 GNA     -> 7,  8-hour shifts, 5 a week
    FT 3-11 CMAs / 3-11 GNA   -> 3,  8-hour shifts, 5 a week
    11-7 CGAs      -> 11, 8-hour shifts, 5 a week

PT and PRN sections are left alone, and so are rows whose Status is PT or PRN.
Administrative sections (ADON, Supervisors, Unit Managers, MDS, Unit Clerks,
Staffing) are not nursing personnel and are never scheduled.

How a week is built: people work every other weekend (alternating by person and
by week, counted from a fixed date so months line up), and their other days are
the weekdays with the fewest people already on that shift. "R" (requested off)
and "x" cells are respected, and anything already entered counts toward the
week's total.
"""

import datetime
import re
from collections import defaultdict

OFF_CODES = {"R", "x"}
ANCHOR = datetime.date(2026, 1, 1)  # fixed Thursday so weekend rotation continues across months

# normalized header -> (shift code, hours per shift)
SHIFT_RULES = {
    "ft 7am-7pm": ("7A", 12),
    "ft 7pm-7am": ("7P", 12),
    "ft 7-3 cmas": ("7", 8),
    "7-3 gna": ("7", 8),
    "7-3 gnas": ("7", 8),
    "ft 3-11 cmas": ("3", 8),
    "3-11 gna": ("3", 8),
    "3-11 gnas": ("3", 8),
    "11-7 cgas": ("11", 8),
    "11-7 gna": ("11", 8),
    "11-7 gnas": ("11", 8),
}
SHIFTS_PER_WEEK = {12: 3, 8: 5}


def _norm(name):
    return re.sub(r"\s*-\s*", "-", " ".join((name or "").lower().split()))


def _is_skipped_group(norm_name):
    return norm_name.startswith("pt ") or norm_name == "pt" or "prn" in norm_name


def shifts_for_sections(sections):
    """sections: ordered [(section_id, name, level)]. Returns {section_id: (code, hours)}
    for the nursing sections that should be scheduled automatically."""
    out = {}
    last_active = None   # last full-time shift header seen
    current = None       # what the header we are under resolves to
    for sid, name, level in sections:
        n = _norm(name)
        if level >= 1:
            if current:
                out[sid] = current
            continue
        if n in SHIFT_RULES:
            last_active = current = SHIFT_RULES[n]
        elif _is_skipped_group(n):
            current = None
        elif n == "agency":
            current = last_active
        else:
            current = None
            last_active = last_active  # administrative sections do not change it
        if current:
            out[sid] = current
    return out


def plan_schedule(days, groups, existing, writable):
    """
    days      every date in the grid (whole work weeks, in order)
    groups    {(code, hours): [row_id, ...]} people to schedule, in display order
    existing  {(row_id, date): code} everything already entered (any row)
    writable  set of dates we may write (the chosen month)
    Returns   {(row_id, date): code} new entries.
    """
    coverage = defaultdict(int)
    for (_, d), code in existing.items():
        if code and code not in OFF_CODES:
            coverage[(code, d)] += 1

    new = {}
    for start in range(0, len(days), 7):
        chunk = days[start : start + 7]
        parity = ((chunk[0] - ANCHOR).days // 7) % 2
        for (code, hours), row_ids in groups.items():
            target = SHIFTS_PER_WEEK[hours]
            for idx, rid in enumerate(row_ids):
                worked = sum(
                    1 for d in chunk if existing.get((rid, d)) and existing[(rid, d)] not in OFF_CODES
                )
                need = target - worked
                if need <= 0:
                    continue
                free = [d for d in chunk if not existing.get((rid, d))]
                weekend_on = (idx + parity) % 2 == 0
                picks = [d for d in free if d.weekday() >= 5][:need] if weekend_on else []
                weekdays = [d for d in free if d.weekday() < 5]
                weekdays.sort(key=lambda d: (coverage[(code, d)], (d.toordinal() + idx) % 7))
                picks += weekdays[: need - len(picks)]
                for d in picks:
                    coverage[(code, d)] += 1
                    if d in writable:
                        new[(rid, d)] = code
    return new
