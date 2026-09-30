"""
Effective staffing requirement for a ShiftCoverageRequirement on a date.

One place that decides "how many staff does this requirement need on this
day", so the compliance report, the 24-hour understaffing alert and the
API can't disagree.

  * mode "fixed"  -> the typed min_staff_required (existing behavior).
  * mode "hppd"   -> calculated from the unit's census with staffing.hppd
                     (Maryland hours rule, 1:15 ratio, RN present).

If an "hppd" requirement can't be calculated (no unit, no recent census, or
a shift type outside the unit's pattern) it falls back to the fixed minimum
and says why in `note`, instead of silently reporting nothing.
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Optional, Tuple

from . import hppd
from .models import StaffShift, UnitCensus

# How far back a census entry is carried forward when no entry exists for the
# date. Beyond this the census is treated as missing (stale data is worse than
# none for a compliance check).
MAX_CARRY_FORWARD_DAYS = 7

MODE_FIXED = "fixed"
MODE_HPPD = "hppd"


@dataclass(frozen=True)
class EffectiveRequirement:
    mode: str                          # mode actually applied: "fixed" or "hppd"
    required_staff: int
    required_hours: Optional[float] = None
    required_rn: int = 0
    staff_by_ratio: int = 0
    census: Optional[int] = None
    census_source: Optional[str] = None   # "entered" | "carried_forward" | None
    note: str = ""


def census_for(unit, a_date) -> Tuple[Optional[int], Optional[str]]:
    """Census for a unit on a date: (count, "entered"|"carried_forward") or (None, None)."""
    exact = UnitCensus.objects.filter(unit=unit, date=a_date).first()
    if exact:
        return exact.census, "entered"
    earliest = a_date - timedelta(days=MAX_CARRY_FORWARD_DAYS)
    prior = (
        UnitCensus.objects.filter(unit=unit, date__lt=a_date, date__gte=earliest)
        .order_by("-date")
        .first()
    )
    if prior:
        return prior.census, "carried_forward"
    return None, None


def _fixed(req, note="") -> EffectiveRequirement:
    return EffectiveRequirement(
        mode=MODE_FIXED, required_staff=req.min_staff_required, note=note
    )


def effective_requirement(req, a_date) -> EffectiveRequirement:
    """What `req` demands on `a_date`. Assumes req.applies_on(a_date) was checked."""
    if req.mode != MODE_HPPD:
        return _fixed(req)

    if not req.unit_id:
        return _fixed(req, "HPPD mode needs a unit; using the fixed minimum.")

    unit = req.unit
    census, source = census_for(unit, a_date)
    if census is None:
        return _fixed(
            req,
            f"No census for {unit.name} within {MAX_CARRY_FORWARD_DAYS} days; "
            "using the fixed minimum.",
        )

    if req.shift_type == "custom":
        return _fixed(req, "Custom shifts have no HPPD pattern; using the fixed minimum.")

    for shift in hppd.required_staff_by_shift(census, unit.shift_pattern):
        if shift.shift_type == req.shift_type:
            note = "Census carried forward from an earlier day." if source == "carried_forward" else ""
            return EffectiveRequirement(
                mode=MODE_HPPD,
                required_staff=shift.required_staff,
                required_hours=shift.required_hours,
                required_rn=shift.required_rn,
                staff_by_ratio=shift.staff_by_ratio,
                census=census,
                census_source=source,
                note=note,
            )

    return EffectiveRequirement(
        mode=MODE_HPPD,
        required_staff=0,
        census=census,
        census_source=source,
        note=f"{req.get_shift_type_display()} is not a shift in {unit.name}'s {unit.shift_pattern} pattern.",
    )


def assigned_staff_count(req, a_date) -> int:
    """Distinct staff with a non-cancelled shift matching the requirement (and unit, if set)."""
    qs = StaffShift.objects.filter(
        organization=req.organization,
        date=a_date,
        shift_type=req.shift_type,
        is_cancelled=False,
    )
    if req.unit_id:
        qs = qs.filter(unit_id=req.unit_id)
    return qs.values("staff_id").distinct().count()
