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


def evaluate(need: Need, people: Sequence[Person]) -> Evaluation:
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
        required_rn=need.required_rn,
    )
    c = hppd.evaluate_shift(hreq, [(p.role, p.hours) for p in people])
    short = []
    if not c.hours_ok:
        short.append(f"Short {c.hours_short:g} care hours")
    if not c.ratio_ok:
        short.append(f"Short {c.staff_short} staff for the ratio")
    if not c.rn_ok:
        short.append(f"Need {need.required_rn} RN, have {c.rn_scheduled}")
    return Evaluation(c.compliant, c.heads_scheduled, c.hours_scheduled, c.rn_scheduled, tuple(short))


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
) -> Classification:
    people = _dedupe(people)
    ev = evaluate(need, people)
    if not ev.met:
        return Classification(NOT_MET, ev, ev.shortfalls)

    reasons: List[str] = []
    critical: set = set()

    # (a) no spare capacity: would losing `buffer` staff break coverage?
    if buffer > 0:
        k = min(buffer, len(people))
        breaking = []
        if k == 0:
            # nobody scheduled but the need is zero; nothing to lose
            pass
        else:
            for combo in combinations(people, k):
                rest = [p for p in people if p not in combo]
                if not evaluate(need, rest).met:
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
    if pending:
        rest = [p for p in people if not p.pending_off]
        if evaluate(need, rest).met:
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


def worst(statuses: Iterable[str]) -> Optional[str]:
    """Roll slot statuses up to one status (None if no slots)."""
    result = None
    for s in statuses:
        if result is None or SEVERITY[s] > SEVERITY[result]:
            result = s
    return result
