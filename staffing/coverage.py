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
from datetime import datetime, timedelta
from typing import Optional, Tuple

from . import hppd, state_rules
from django.db.models import Q

from .models import StaffShift, StaffTimeOffRequest, UnitCensus

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
    required_licensed_hours: float = 0.0
    required_cna_hours: float = 0.0


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

    # The clinic's state decides the numbers (hours, ratio, RN). No active
    # rule for the state -> fixed minimum, with the reason in `note`.
    resolved = state_rules.resolve_rule_for_org(req.organization)
    if resolved.rule is None:
        return _fixed(req, resolved.warning)
    rule = resolved.rule

    for shift in hppd.required_staff_by_shift(
        census,
        unit.shift_pattern,
        hppd=rule.hppd_min,
        max_residents_per_staff=rule.max_residents_per_staff,
        min_rn=rule.min_rn_per_shift,
        min_licensed_hppd=rule.min_licensed_hppd or 0.0,
        min_cna_hppd=rule.min_cna_hppd or 0.0,
    ):
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
                required_licensed_hours=shift.required_licensed_hours,
                required_cna_hours=shift.required_cna_hours,
            )

    return EffectiveRequirement(
        mode=MODE_HPPD,
        required_staff=0,
        census=census,
        census_source=source,
        note=f"{req.get_shift_type_display()} is not a shift in {unit.name}'s {unit.shift_pattern} pattern.",
    )



def _exclude_out(qs, organization, a_date):
    """
    Drop shifts belonging to people who are OUT that day: approved time off, or an
    emergency call-out (open or resolved). Keeps this report / the 24-hour alert
    consistent with the calendar colors (staffing.coverage_status).
    """
    out = StaffTimeOffRequest.objects.filter(
        organization=organization, start_date__lte=a_date, end_date__gte=a_date
    ).filter(
        Q(kind="off_request", status="approved")
        | Q(kind="emergency", status__in=["open", "resolved"])
    )
    staff_ids = list(out.filter(shift__isnull=True).values_list("staff_id", flat=True))
    shift_ids = list(out.filter(shift__isnull=False).values_list("shift_id", flat=True))
    if staff_ids:
        qs = qs.exclude(staff_id__in=staff_ids)
    if shift_ids:
        qs = qs.exclude(pk__in=shift_ids)
    return qs

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
    qs = _exclude_out(qs, req.organization, a_date)
    return qs.values("staff_id").distinct().count()


DEFAULT_SHIFT_HOURS = 8.0


def shift_hours(shift, default_hours=DEFAULT_SHIFT_HOURS) -> float:
    """
    Hours worked on a StaffShift. Uses start/end times (an end at or before the
    start means the shift crosses midnight); if either is missing, falls back
    to `default_hours` (the unit pattern's shift length).
    """
    if shift.start_time and shift.end_time:
        start = datetime.combine(shift.date, shift.start_time)
        end = datetime.combine(shift.date, shift.end_time)
        if end <= start:
            end += timedelta(days=1)
        return (end - start).total_seconds() / 3600.0
    return default_hours


@dataclass(frozen=True)
class RequirementStatus:
    requirement: EffectiveRequirement
    assigned: int                        # heads counted (RN/LPN/CNA only in hppd mode)
    hours_scheduled: Optional[float]     # hppd mode only
    rn_scheduled: Optional[int]          # hppd mode only
    met: bool
    shortfalls: Tuple[str, ...] = ()


def _pattern_shift_hours(req) -> float:
    if req.unit_id:
        for s in hppd.get_pattern(req.unit.shift_pattern):
            if s.shift_type == req.shift_type:
                return float(s.hours)
    return DEFAULT_SHIFT_HOURS


def evaluate_requirement(req, a_date) -> RequirementStatus:
    """
    Does the schedule meet `req` on `a_date`?

      * fixed mode: distinct staff scheduled >= min_staff_required (as before).
      * hppd mode : scheduled care hours >= required hours, RN/LPN/CNA heads
                    >= the 1:15 ratio, and at least the required RNs. Only staff
                    whose nursing_role is rn/lpn/cna count.
    """
    eff = effective_requirement(req, a_date)

    qs = StaffShift.objects.filter(
        organization=req.organization,
        date=a_date,
        shift_type=req.shift_type,
        is_cancelled=False,
    ).select_related("staff")
    if req.unit_id:
        qs = qs.filter(unit_id=req.unit_id)
    qs = _exclude_out(qs, req.organization, a_date)
    shifts = list(qs)

    if eff.mode != MODE_HPPD:
        heads = len({s.staff_id for s in shifts})
        met = heads >= eff.required_staff
        shortfalls = () if met else (f"Short {eff.required_staff - heads} staff",)
        return RequirementStatus(eff, heads, None, None, met, shortfalls)

    default_hours = _pattern_shift_hours(req)
    per_staff = {}  # one entry per person; if they hold two rows, keep the longer
    for s in shifts:
        hrs = shift_hours(s, default_hours)
        if s.staff_id not in per_staff or hrs > per_staff[s.staff_id][1]:
            per_staff[s.staff_id] = (s.staff.nursing_role, hrs)

    hreq = hppd.ShiftRequirement(
        shift_name=req.get_shift_type_display(),
        shift_type=req.shift_type,
        shift_hours=default_hours,
        required_hours=eff.required_hours or 0.0,
        staff_by_hours=0,
        staff_by_ratio=eff.staff_by_ratio,
        required_staff=eff.required_staff,
        required_rn=eff.required_rn,
        required_licensed_hours=eff.required_licensed_hours,
        required_cna_hours=eff.required_cna_hours,
    )
    c = hppd.evaluate_shift(hreq, per_staff.values())

    shortfalls = []
    if not c.hours_ok:
        shortfalls.append(f"Short {c.hours_short:g} care hours")
    if not c.ratio_ok:
        shortfalls.append(f"Short {c.staff_short} staff for the 1:15 ratio")
    if not c.rn_ok:
        shortfalls.append(f"Need {eff.required_rn} RN, have {c.rn_scheduled}")
    if not c.licensed_ok:
        shortfalls.append(f"Short {c.licensed_short:g} licensed-nurse (RN/LPN) hours")
    if not c.cna_ok:
        shortfalls.append(f"Short {c.cna_short:g} CNA hours")

    return RequirementStatus(
        eff, c.heads_scheduled, c.hours_scheduled, c.rn_scheduled, c.compliant, tuple(shortfalls)
    )
