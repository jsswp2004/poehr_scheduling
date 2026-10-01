"""
Per-state nursing staffing rules for the Staffing module.

Pure Python (no Django). Generalises the Maryland constants that used to live
only in staffing/hppd.py: each state supplies the same three numbers --

    hppd_min                 nursing hours per resident per day
    max_residents_per_staff  ratio rule (None = state has no ratio rule)
    min_rn_per_shift         RNs required on every shift

A rule only drives compliance when status == "active". A state with no active
rule falls back to the clinic's own coverage requirements and the UI says so;
we never guess numbers for a compliance check. To add a state: add a StateRule
below with the regulation citation, have compliance verify it, then set
status="active". Keep `source` accurate -- it is shown to admins.

Maryland is the rule already in production (previously hardcoded in hppd.py).
"""

from dataclasses import dataclass
from typing import Dict, Optional

from . import hppd

STATUS_ACTIVE = "active"
STATUS_DRAFT = "draft"


@dataclass(frozen=True)
class StateRule:
    state: str
    name: str
    hppd_min: float
    max_residents_per_staff: Optional[int]
    min_rn_per_shift: int
    source: str
    status: str = STATUS_ACTIVE
    notes: str = ""

    def as_dict(self):
        return {
            "state": self.state,
            "name": self.name,
            "hppd_min": self.hppd_min,
            "max_residents_per_staff": self.max_residents_per_staff,
            "min_rn_per_shift": self.min_rn_per_shift,
            "source": self.source,
            "status": self.status,
            "notes": self.notes,
        }


MARYLAND = StateRule(
    state="MD",
    name="Maryland",
    hppd_min=hppd.HPPD_MINIMUM,
    max_residents_per_staff=hppd.MAX_RESIDENTS_PER_STAFF,
    min_rn_per_shift=hppd.MIN_RN_PER_SHIFT,
    source="COMAR 10.07.02.19 (nursing homes) -- verify current text",
    notes="3.0 hrs per resident per day, 1 staff per 15 residents, RN on duty every shift.",
)

STATE_RULES: Dict[str, StateRule] = {
    MARYLAND.state: MARYLAND,
    # Add other states here once verified, e.g.:
    # "NY": StateRule("NY", "New York", hppd_min=..., max_residents_per_staff=None,
    #                 min_rn_per_shift=1, source="10 NYCRR ...", status=STATUS_ACTIVE),
}

# Orgs that predate the state field have no state. They were already being
# evaluated with Maryland numbers, so keep that (and warn) instead of silently
# changing their calendar.
LEGACY_DEFAULT_STATE = "MD"


def rule_for_state(state_code) -> Optional[StateRule]:
    """The ACTIVE rule for a state code, or None."""
    rule = STATE_RULES.get((state_code or "").strip().upper())
    return rule if rule and rule.status == STATUS_ACTIVE else None


@dataclass(frozen=True)
class ResolvedRule:
    rule: Optional[StateRule]   # None -> no rule applies; use the clinic's fixed requirements
    state: str                  # state the org is in ("" if unset)
    warning: str = ""           # shown to admins when something needs attention


def resolve_rule(state_code) -> ResolvedRule:
    state = (state_code or "").strip().upper()
    if not state:
        return ResolvedRule(
            MARYLAND,
            "",
            "Clinic state is not set; Maryland rules are being used by default. "
            "Set the clinic's state so the correct rules apply.",
        )
    rule = rule_for_state(state)
    if rule:
        return ResolvedRule(rule, state)
    return ResolvedRule(
        None,
        state,
        f"No verified staffing rule is configured for {state}. Calendar colors use "
        "your own coverage requirements only.",
    )
