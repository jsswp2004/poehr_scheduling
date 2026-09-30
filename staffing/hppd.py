"""
Hours-per-patient-day (HPPD) staffing requirements for the Staffing module.

Pure Python -- no Django imports -- so it can be unit-tested on its own and
reused by the compliance report, the 24-hour understaffing alert and the
mobile API.

Rule set (Maryland nursing homes, COMAR 10.07.02.19 -- verify current text):
  1. Hours:  at least 3.0 hours of bedside care per occupied bed per day,
             from RNs, LPNs and support personnel (CNAs).
  2. Ratio:  nursing staff on duty giving bedside care may not at any time
             be fewer than one per 15 residents.
  3. RN:     at least one registered nurse on duty 24 hours a day.

Every number a state or facility might change lives in the constants block
below so it can later move into a settings/rule table without touching the
calculation code.
"""

import math
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

# ---------------------------------------------------------------------------
# Configuration (constants for now; becomes per-state/per-facility settings)
# ---------------------------------------------------------------------------
HPPD_MINIMUM = 3.0            # nursing hours per resident per day
MAX_RESIDENTS_PER_STAFF = 15  # ratio rule: 1 staff per 15 residents
MIN_RN_PER_SHIFT = 1          # RN on duty every shift

ROLE_RN = "rn"
ROLE_LPN = "lpn"
ROLE_CNA = "cna"
ROLE_OTHER = "other"

# Roles whose hours and heads count toward the hours and ratio checks.
# "other" (administrative staff, etc.) does not count.
COUNTED_ROLES = frozenset({ROLE_RN, ROLE_LPN, ROLE_CNA})


@dataclass(frozen=True)
class ShiftDef:
    name: str          # display name
    shift_type: str    # matches staffing.models.SHIFT_TYPE_CHOICES codes
    start: str         # "HH:MM", informational
    hours: float       # length of the shift in hours
    share: float       # share of the 24-hour day's care hours assigned here


# The 8h/12h toggle: a unit picks one pattern key. Shares are placeholders
# to be tuned to how the facility actually staffs.
SHIFT_PATTERNS: Dict[str, Tuple[ShiftDef, ...]] = {
    "8h": (
        ShiftDef("Day", "day", "07:00", 8, 0.40),
        ShiftDef("Evening", "evening", "15:00", 8, 0.35),
        ShiftDef("Night", "night", "23:00", 8, 0.25),
    ),
    "12h": (
        ShiftDef("Day", "day", "07:00", 12, 0.50),
        ShiftDef("Night", "night", "19:00", 12, 0.50),
    ),
}

DEFAULT_PATTERN = "8h"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _ceil(value: float) -> int:
    """ceil() that ignores floating-point noise (48.00000000000001 -> 48)."""
    return int(math.ceil(round(value, 6)))


def get_pattern(pattern_key: str) -> Tuple[ShiftDef, ...]:
    try:
        return SHIFT_PATTERNS[pattern_key]
    except KeyError:
        raise ValueError(
            f"Unknown shift pattern {pattern_key!r}; expected one of "
            f"{sorted(SHIFT_PATTERNS)}"
        )


def validate_patterns() -> None:
    """Raise ValueError if any pattern's shares do not sum to 1.0."""
    for key, shifts in SHIFT_PATTERNS.items():
        total = sum(s.share for s in shifts)
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"Pattern {key!r} shares sum to {total}, not 1.0")


# ---------------------------------------------------------------------------
# Requirement: how much staff a shift needs
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ShiftRequirement:
    shift_name: str
    shift_type: str
    shift_hours: float
    required_hours: float   # care hours this shift must supply (hours rule)
    staff_by_hours: int     # heads needed to supply those hours
    staff_by_ratio: int     # heads needed by the 1:15 ratio rule
    required_staff: int     # max of the two (0 when census is 0)
    required_rn: int        # minimum RNs on the shift


def required_staff_by_shift(
    census: int,
    pattern_key: str = DEFAULT_PATTERN,
    hppd: float = HPPD_MINIMUM,
    max_residents_per_staff: int = MAX_RESIDENTS_PER_STAFF,
    min_rn: int = MIN_RN_PER_SHIFT,
) -> List[ShiftRequirement]:
    """
    Required staffing for every shift of the pattern, for one unit and day.

    Rounds each shift up so the daily total never falls below census * hppd.
    A census of 0 requires nothing.
    """
    if census < 0:
        raise ValueError("census cannot be negative")

    shifts = get_pattern(pattern_key)
    daily_hours = census * hppd
    by_ratio = _ceil(census / max_residents_per_staff) if census else 0
    rn_needed = min_rn if census else 0

    result = []
    for s in shifts:
        hours_needed = daily_hours * s.share
        by_hours = _ceil(hours_needed / s.hours)
        # The RN counts as one of the staff, so total can't be below RN min.
        required = max(by_hours, by_ratio, rn_needed)
        result.append(
            ShiftRequirement(
                shift_name=s.name,
                shift_type=s.shift_type,
                shift_hours=s.hours,
                required_hours=round(hours_needed, 6),
                staff_by_hours=by_hours,
                staff_by_ratio=by_ratio,
                required_staff=required,
                required_rn=rn_needed,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Compliance: does a scheduled shift meet its requirement
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ShiftCompliance:
    hours_scheduled: float
    heads_scheduled: int
    rn_scheduled: int
    hours_ok: bool
    ratio_ok: bool
    rn_ok: bool
    hours_short: float      # 0 when the hours rule is met
    staff_short: int        # heads short of the ratio requirement
    compliant: bool


def evaluate_shift(
    requirement: ShiftRequirement,
    scheduled: Iterable[Tuple[str, float]],
) -> ShiftCompliance:
    """
    Compare scheduled staff against a ShiftRequirement.

    `scheduled` is an iterable of (role, hours_on_this_shift) pairs, with
    role one of "rn", "lpn", "cna", "other". Only rn/lpn/cna count.
    """
    hours = 0.0
    heads = 0
    rns = 0
    for role, hrs in scheduled:
        if role not in COUNTED_ROLES:
            continue
        hours += hrs
        heads += 1
        if role == ROLE_RN:
            rns += 1

    hours_ok = round(hours, 6) >= round(requirement.required_hours, 6)
    ratio_ok = heads >= requirement.staff_by_ratio
    rn_ok = rns >= requirement.required_rn

    return ShiftCompliance(
        hours_scheduled=round(hours, 6),
        heads_scheduled=heads,
        rn_scheduled=rns,
        hours_ok=hours_ok,
        ratio_ok=ratio_ok,
        rn_ok=rn_ok,
        hours_short=0.0 if hours_ok else round(requirement.required_hours - hours, 6),
        staff_short=max(0, requirement.staff_by_ratio - heads),
        compliant=hours_ok and ratio_ok and rn_ok,
    )
