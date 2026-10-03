"""
Per-day coverage status for the Staffing calendar (web + mobile).

For a date range this answers, for every day: is coverage MET, AT RISK or NOT MET?

Requirements come from two places:
  * the clinic's explicit ShiftCoverageRequirement rows (fixed or hppd), and
  * AUTOMATIC state-rule requirements: for every active Unit with a census, the
    state's rule (hours / ratio / RN, see staffing.state_rules) is applied to each
    shift of the unit's pattern -- no requirement row has to be created by hand.
    (If an explicit hppd requirement already covers the same unit + shift on a day,
    the explicit one is used so the day is not counted twice.)

Time off feeds in directly: approved off requests and emergency call-outs take the
person OUT of the count; pending requests mark the slot at risk.

All math is delegated to staffing.coverage_core / staffing.hppd (the same code the
compliance report uses), and everything is loaded in a handful of queries.
"""

import datetime
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Optional

from . import hppd, state_rules
from .coverage import DEFAULT_SHIFT_HOURS, MAX_CARRY_FORWARD_DAYS, shift_hours
from .coverage_core import (
    AT_RISK, MET, MODE_FIXED, MODE_HPPD, NOT_MET, Need, Person, classify, worst,
)
from .models import (
    ShiftCoverageRequirement, StaffShift, StaffTimeOffRequest, Unit, UnitCensus,
)

UNKNOWN = "unknown"   # a requirement exists but its inputs (census) are missing
NONE = "none"         # nothing to evaluate that day
MAX_RANGE_DAYS = 62


@dataclass
class _Entry:
    shift: StaffShift
    name: str
    role: str
    pending: bool


class _Census:
    """In-memory census lookup with the same carry-forward rule as coverage.census_for."""

    def __init__(self, unit_ids, start, end):
        self.data = defaultdict(dict)
        if unit_ids:
            rows = UnitCensus.objects.filter(
                unit_id__in=unit_ids,
                date__gte=start - datetime.timedelta(days=MAX_CARRY_FORWARD_DAYS),
                date__lte=end,
            ).values_list("unit_id", "date", "census")
            for unit_id, d, c in rows:
                self.data[unit_id][d] = c

    def get(self, unit_id, d):
        by_date = self.data.get(unit_id, {})
        if d in by_date:
            return by_date[d], "entered"
        for i in range(1, MAX_CARRY_FORWARD_DAYS + 1):
            prior = d - datetime.timedelta(days=i)
            if prior in by_date:
                return by_date[prior], "carried_forward"
        return None, None


def _daterange(start, end):
    d = start
    while d <= end:
        yield d
        d += datetime.timedelta(days=1)


def _pattern_hours(unit, shift_type):
    if unit is not None:
        for s in hppd.get_pattern(unit.shift_pattern):
            if s.shift_type == shift_type:
                return float(s.hours)
    return DEFAULT_SHIFT_HOURS


def _hppd_need(rule, unit, shift_type, census) -> Need:
    """Need for one shift of a unit's pattern. A shift not in the pattern needs nothing."""
    for r in hppd.required_staff_by_shift(
        census,
        unit.shift_pattern,
        hppd=rule.hppd_min,
        max_residents_per_staff=rule.max_residents_per_staff,
        min_rn=rule.min_rn_per_shift,
    ):
        if r.shift_type == shift_type:
            return Need(
                MODE_HPPD, r.required_staff, r.required_hours, r.staff_by_ratio,
                r.required_rn, float(r.shift_hours),
            )
    return Need(MODE_HPPD, 0, 0.0, 0, 0, _pattern_hours(unit, shift_type))


def _load_time_off(org, start, end):
    out_staff_dates: Dict = {}      # (staff_id, date) -> "open" | "done"
    out_shift_ids: Dict = {}        # shift_id -> "open" | "done"
    pending = set()                 # (staff_id, date)
    open_emergencies = defaultdict(int)
    pending_requests = defaultdict(int)

    qs = (
        StaffTimeOffRequest.objects.filter(
            organization=org, start_date__lte=end, end_date__gte=start
        )
        .exclude(status__in=[StaffTimeOffRequest.STATUS_DENIED, StaffTimeOffRequest.STATUS_CANCELLED])
    )
    for r in qs:
        lo, hi = max(r.start_date, start), min(r.end_date, end)
        state = "open" if r.status == StaffTimeOffRequest.STATUS_OPEN else "done"
        for d in _daterange(lo, hi):
            if r.takes_staff_out:
                if r.shift_id:
                    out_shift_ids[r.shift_id] = state
                else:
                    out_staff_dates[(r.staff_id, d)] = state
            elif r.is_pending_off:
                pending.add((r.staff_id, d))
                pending_requests[d] += 1
            if r.status == StaffTimeOffRequest.STATUS_OPEN:
                open_emergencies[d] += 1
    return out_staff_dates, out_shift_ids, pending, open_emergencies, pending_requests


def compute_coverage_status(organization, start, end, unit_id=None) -> dict:
    if end < start:
        raise ValueError("end must be on or after start")
    if (end - start).days > MAX_RANGE_DAYS:
        raise ValueError(f"Date range too large (max {MAX_RANGE_DAYS} days).")

    resolved = state_rules.resolve_rule(organization.state)
    rule = resolved.rule
    buffer = organization.staffing_spare_buffer

    units_qs = Unit.objects.filter(organization=organization, is_active=True)
    if unit_id:
        units_qs = units_qs.filter(pk=unit_id)
    units = list(units_qs)
    units_by_id = {u.id: u for u in units}

    requirements = list(
        ShiftCoverageRequirement.objects.filter(
            organization=organization, is_active=True, start_date__lte=end
        ).select_related("unit")
    )
    if unit_id:
        # A unit filter shows only that unit's requirements; org-wide rows span units.
        requirements = [r for r in requirements if r.unit_id == int(unit_id)]
    for r in requirements:
        if r.unit_id and r.unit_id not in units_by_id:
            units_by_id[r.unit_id] = r.unit

    census = _Census(list(units_by_id.keys()), start, end)
    out_staff_dates, out_shift_ids, pending, open_emerg, pending_reqs = _load_time_off(
        organization, start, end
    )

    # ---- shifts -> slot entries -------------------------------------------------
    shifts = StaffShift.objects.filter(
        organization=organization, date__gte=start, date__lte=end, is_cancelled=False
    ).select_related("staff")
    if unit_id:
        shifts = shifts.filter(unit_id=unit_id)

    slot_entries = defaultdict(list)      # (date, unit_id, shift_type) -> [_Entry]
    slot_callouts = defaultdict(int)      # (date, unit_id, shift_type) -> open call-outs
    for s in shifts:
        slot = (s.date, s.unit_id, s.shift_type)
        state = out_shift_ids.get(s.id) or out_staff_dates.get((s.staff_id, s.date))
        if state:
            if state == "open":
                slot_callouts[slot] += 1
            continue
        slot_entries[slot].append(
            _Entry(s, s.staff.full_name, s.staff.nursing_role, (s.staff_id, s.date) in pending)
        )

    def entries_for(d, req_unit_id, shift_type):
        if req_unit_id:
            return slot_entries.get((d, req_unit_id, shift_type), []), slot_callouts.get((d, req_unit_id, shift_type), 0)
        # org-wide requirement: every unit (and unit-less shifts) on that date
        merged, callouts = [], 0
        for (sd, _u, st), lst in slot_entries.items():
            if sd == d and st == shift_type:
                merged.extend(lst)
        for (sd, _u, st), n in slot_callouts.items():
            if sd == d and st == shift_type:
                callouts += n
        return merged, callouts

    def build_item(d, unit, shift_type, shift_label, source, need, default_hours, note=""):
        entries, callouts = entries_for(d, unit.id if unit else None, shift_type)
        people = [
            Person(e.shift.staff_id, e.name, e.role, shift_hours(e.shift, default_hours), e.pending)
            for e in entries
        ]
        c = classify(need, people, buffer=buffer, open_callouts=callouts)
        ev = c.evaluation
        return {
            "unit_id": unit.id if unit else None,
            "unit_name": unit.name if unit else None,
            "shift_type": shift_type,
            "shift_label": shift_label,
            "source": source,
            "mode": need.mode,
            "status": c.status,
            "required": need.required_staff,
            "assigned": ev.heads,
            "required_hours": need.required_hours,
            "hours_scheduled": ev.hours,
            "required_rn": need.required_rn if need.mode == MODE_HPPD else None,
            "rn_scheduled": ev.rn,
            "reasons": list(c.reasons),
            "critical": list(c.critical_names),
            "callouts_open": callouts,
            "note": note,
        }

    days: Dict[str, dict] = {}
    for d in _daterange(start, end):
        items: List[dict] = []
        explicit_hppd_keys = set()

        # ---- explicit requirements ---------------------------------------------
        for req in requirements:
            if not req.applies_on(d):
                continue
            label = req.get_shift_type_display()
            unit = req.unit if req.unit_id else None
            need, note, default_hours = None, "", DEFAULT_SHIFT_HOURS

            if req.mode == "hppd":
                if unit is None:
                    note = "HPPD mode needs a unit; using the fixed minimum."
                elif rule is None:
                    note = resolved.warning
                elif req.shift_type == "custom":
                    note = "Custom shifts have no HPPD pattern; using the fixed minimum."
                else:
                    value, source = census.get(unit.id, d)
                    if value is None:
                        note = f"No census for {unit.name}; using the fixed minimum."
                    else:
                        need = _hppd_need(rule, unit, req.shift_type, value)
                        default_hours = _pattern_hours(unit, req.shift_type)
                        explicit_hppd_keys.add((unit.id, req.shift_type))
                        if source == "carried_forward":
                            note = "Census carried forward from an earlier day."
            if need is None:
                need = Need(MODE_FIXED, req.min_staff_required)

            item = build_item(d, unit, req.shift_type, label, "requirement", need, default_hours, note)
            items.append(item)

        # ---- automatic state-rule requirements ---------------------------------
        if rule is not None:
            for unit in units:
                value, source = census.get(unit.id, d)
                if value is None:
                    items.append({
                        "unit_id": unit.id, "unit_name": unit.name, "shift_type": None,
                        "shift_label": None, "source": "state_rule", "mode": MODE_HPPD,
                        "status": UNKNOWN, "required": None, "assigned": None,
                        "required_hours": None, "hours_scheduled": None,
                        "required_rn": None, "rn_scheduled": None, "reasons": [],
                        "critical": [], "callouts_open": 0,
                        "note": f"Enter a census for {unit.name} to calculate {rule.name} staffing.",
                    })
                    continue
                for sdef in hppd.get_pattern(unit.shift_pattern):
                    if (unit.id, sdef.shift_type) in explicit_hppd_keys:
                        continue
                    need = _hppd_need(rule, unit, sdef.shift_type, value)
                    note = "Census carried forward from an earlier day." if source == "carried_forward" else ""
                    item = build_item(
                        d, unit, sdef.shift_type, sdef.name, "state_rule", need, float(sdef.hours), note
                    )
                    item["census"] = value
                    item["census_source"] = source
                    items.append(item)

        evaluated = [i["status"] for i in items if i["status"] in (MET, AT_RISK, NOT_MET)]
        day_status = worst(evaluated)
        if day_status is None:
            day_status = UNKNOWN if items else NONE
        days[d.isoformat()] = {
            "status": day_status,
            "open_emergencies": open_emerg.get(d, 0),
            "pending_requests": pending_reqs.get(d, 0),
            "items": items,
        }

    counts = {NOT_MET: 0, AT_RISK: 0, MET: 0}
    for info in days.values():
        if info["status"] in counts:
            counts[info["status"]] += 1

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "state": resolved.state,
        "state_name": rule.name if rule else "",
        "rule": rule.as_dict() if rule else None,
        "warnings": [resolved.warning] if resolved.warning else [],
        "spare_buffer": buffer,
        "summary": counts,
        "days": days,
    }
