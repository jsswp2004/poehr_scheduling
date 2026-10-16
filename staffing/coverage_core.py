"""
Pure coverage classification for one shift slot (date + unit + shift type).

No Django imports, so it is unit-testable on its own. Uses staffing.hppd for the
hours / ratio / RN math, so the calendar colors can't disagree with the
Coverage Compliance report or the 24-hour understaffing alert.

Statuses
  not_met  requirement not satisfied by the people available.
  at_risk  satisfied, but fragile: (a) losing `buffer` staff would break it,
           (b) a pending time-off request from someone on the shift would break it
               or (c) simply exists on it, or (d) an emergency call-out on the
               shift is still waiting for cover.
  met      satisfied with spare capacity and nothing pending.

`buffer` = 0 turns off rule (a): amber only for pending requests / open call-outs.
"""

from dataclasses import dataclass, field
from itertools import combinations
from typing import Iterable, List, Optional, Sequence, Tuple

from . import hppd

NOT_MET = "not_met"
AT_RISK = "at_risk"
MET = "met"

MODE_FIXED = "fixed"
MODE_HPPD = "hppd"

# Higher = worse. Used to roll slots up into a day.
SEVERITY = {MET: 0, AT_RISK: 1, NOT_MET: 2}


@dataclass(frozen=True)
class Person:
    staff_id: int
    name: str
    role: str            # "rn" | "lpn" | "cna" | "other"
    hours: float
    pending_off: bool = False   # has a pending time-off request covering this date


@dataclass(frozen=True)
class Need:
    mode: str                              # "fixed" | "hppd"
    required_staff: int
    required_hours: Optional[float] = None  # hppd
    staff_by_ratio: int = 0                 # hppd
    required_rn: int = 0                    # hppd
    shift_hours: float = 8.0                # hppd
    required_licensed_hours: float = 0.0    # hppd: RN + LPN hours (component rules)
    required_cna_hours: float = 0.0         # hppd: CNA hours (component rules)


@dataclass(frozen=True)
class Evaluation:
    met: bool
    heads: int
    hours: Optional[float]
    rn: Optional[int]
    shortfalls: Tuple[str, ...] = ()


@dataclass(frozen=True)
class Classification:
    status: str
    evaluation: Evaluation
    reasons: Tuple[str, ...] = ()
    critical_names: Tuple[str, ...] = ()


def _dedupe(people: Iterable[Person]) -> List[Person]:
    """One entry per staff member (a person holding two rows keeps the longer)."""
    best = {}
    for p in people:
        if p.staff_id not in best or p.hours > best[p.staff_id].hours:
            best[p.staff_id] = p
    return list(best.values())


def evaluate(need: Need, people: Sequence[Person], facility_rns: Optional[Sequence[Person]] = None) -> Evaluation:
    """
    `facility_rns`: when given, the RN requirement is FACILITY-WIDE for this shift -- an RN
    anywhere in the facility on the same shift counts, not only RNs in this unit's slot.
    (None keeps the old per-slot RN check.)
    """
    people = _dedupe(people)

    if need.mode != MODE_HPPD:
        heads = len(people)
        met = heads >= need.required_staff
        short = () if met else (f"Short {need.required_staff - heads} staff",)
        return Evaluation(met, heads, None, None, short)

    hreq = hppd.ShiftRequirement(
        shift_name="",
        shift_type="",
        shift_hours=need.shift_hours,
        required_hours=need.required_hours or 0.0,
        staff_by_hours=0,
        staff_by_ratio=need.staff_by_ratio,
        required_staff=need.required_staff,
        required_rn=0 if facility_rns is not None else need.required_rn,
        required_licensed_hours=need.required_licensed_hours,
        required_cna_hours=need.required_cna_hours,
    )
    c = hppd.evaluate_shift(hreq, [(p.role, p.hours) for p in people])
    rn_count, rn_ok = c.rn_scheduled, c.rn_ok
    if facility_rns is not None:
        rn_ids = {p.staff_id for p in people if p.role == "rn"} | {
            p.staff_id for p in facility_rns if p.role == "rn"
        }
        rn_count = len(rn_ids)
        rn_ok = rn_count >= need.required_rn
    short = []
    if not c.hours_ok:
        short.append(f"Short {c.hours_short:g} care hours")
    if not c.ratio_ok:
        short.append(f"Short {c.staff_short} staff for the ratio")
    if not rn_ok:
        where = " in the facility" if facility_rns is not None else ""
        short.append(f"Need {need.required_rn} RN{where}, have {rn_count}")
    if not c.licensed_ok:
        short.append(f"Short {c.licensed_short:g} licensed-nurse (RN/LPN) hours")
    if not c.cna_ok:
        short.append(f"Short {c.cna_short:g} CNA hours")
    return Evaluation(c.compliant and rn_ok, c.heads_scheduled, c.hours_scheduled, rn_count, tuple(short))


def _names(people: Iterable[Person], limit=3) -> str:
    names = sorted({p.name for p in people})
    extra = len(names) - limit
    shown = ", ".join(names[:limit])
    return shown + (f" +{extra} more" if extra > 0 else "")


def classify(
    need: Need,
    people: Sequence[Person],
    buffer: int = 1,
    open_callouts: int = 0,
    facility_rns: Optional[Sequence[Person]] = None,
) -> Classification:
    people = _dedupe(people)
    facility_rns = None if facility_rns is None else _dedupe(facility_rns)
    ev = evaluate(need, people, facility_rns)
    if not ev.met:
        return Classification(NOT_MET, ev, ev.shortfalls)

    reasons: List[str] = []
    critical: set = set()

    # (a) no spare capacity: would losing `buffer` staff break coverage?
    # With a facility-wide RN rule, an RN working in another unit is also a person whose
    # absence could break this shift (RN requirement only).
    if buffer > 0:
        slot_ids = {p.staff_id for p in people}
        candidates = list(people)
        if facility_rns is not None:
            candidates += [f for f in facility_rns if f.role == "rn" and f.staff_id not in slot_ids]
        k = min(buffer, len(candidates))
        breaking = []
        if k == 0:
            # nobody scheduled but the need is zero; nothing to lose
            pass
        else:
            for combo in combinations(candidates, k):
                gone = {c.staff_id for c in combo}
                rest = [p for p in people if p.staff_id not in gone]
                rest_fac = None if facility_rns is None else [f for f in facility_rns if f.staff_id not in gone]
                if not evaluate(need, rest, rest_fac).met:
                    breaking.append(combo)
        if breaking:
            for combo in breaking:
                critical.update(combo)
            if buffer == 1:
                reasons.append(
                    f"At the minimum with no spare: if {_names(critical)} cannot work, "
                    "this shift is short."
                )
            else:
                reasons.append(
                    f"Fewer than {buffer} spare staff: losing any {buffer} of "
                    f"{_names(people, 4)} would leave this shift short."
                )

    # (b)/(c) pending time-off requests from people on this shift
    pending = [p for p in people if p.pending_off]
    if facility_rns is not None:
        pending += [f for f in facility_rns if f.pending_off and f.staff_id not in {p.staff_id for p in people}]
    if pending:
        rest = [p for p in people if not p.pending_off]
        rest_fac = None if facility_rns is None else [f for f in facility_rns if not f.pending_off]
        if evaluate(need, rest, rest_fac).met:
            reasons.append(f"Pending time-off request: {_names(pending)}.")
        else:
            reasons.append(
                f"If the pending time-off request from {_names(pending)} is approved, "
                "this shift is short."
            )

    # (d) emergency call-out on this shift still waiting for cover
    if open_callouts:
        reasons.append(
            f"{open_callouts} emergency call-out{'s' if open_callouts != 1 else ''} "
            "waiting for cover."
        )

    status = AT_RISK if reasons else MET
    return Classification(status, ev, tuple(reasons), tuple(sorted({p.name for p in critical})))


def classify_with_adhoc(
    need: Need,
    people: Sequence[Person],
    adhoc: Sequence[Person] = (),
    buffer: int = 1,
    open_callouts: int = 0,
    facility_rns: Optional[Sequence[Person]] = None,
    adhoc_facility_rns: Optional[Sequence[Person]] = None,
) -> Classification:
    """
    Classify a shift with ad hoc (on-call) staff handled separately.

    On-call time is ad hoc, so it can never be what makes a shift GREEN:
      * the shift is classified from regular staff only;
      * if that is NOT_MET but regular + on-call staff would meet it, the result is AT_RISK
        (met only thanks to on-call time) with a reason naming them;
      * otherwise the regular-staff result stands.
    """
    base = classify(need, people, buffer=buffer, open_callouts=open_callouts, facility_rns=facility_rns)
    adhoc_rns = list(adhoc_facility_rns or [])
    if base.status != NOT_MET or not (adhoc or adhoc_rns):
        return base
    everyone = list(people) + list(adhoc)
    everyone_fac = None
    if facility_rns is not None:
        everyone_fac = list(facility_rns) + adhoc_rns + [a for a in adhoc if a.role == "rn"]
    ev = evaluate(need, everyone, everyone_fac)
    if not ev.met:
        return base
    regular_ids = {p.staff_id for p in people}
    helpers = [a for a in list(adhoc) + adhoc_rns if a.staff_id not in regular_ids]
    names = _names(helpers) if helpers else "on-call staff"
    reason = (
        f"Met only with on-call time ({names}). On-call staff are ad hoc, so this shift is "
        "at risk until it is covered by regular staff."
    )
    return Classification(AT_RISK, ev, (reason,), tuple(sorted({h.name for h in helpers})))


def worst(statuses: Iterable[str]) -> Optional[str]:
    """Roll slot statuses up to one status (None if no slots)."""
    result = None
    for s in statuses:
        if result is None or SEVERITY[s] > SEVERITY[result]:
            result = s
    return result
