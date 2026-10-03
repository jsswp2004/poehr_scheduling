"""
Staffing rules for the Staffing module.

The numbers the engine applies (total HPPD, licensed / CNA component hours,
ratio, RN per shift) live in the database (staffing.models.StaffingRule) so a
system admin can correct a state's numbers or add a state, and an organization
can select its own custom standard, without a code change. This module resolves
WHICH rule applies to an organization and hands the engine a plain StateRule.

Resolution order for an organization:
  1. the rule it selected (its own custom rule, or any shared rule), if active;
  2. the active shared rule for the organization's location state;
  3. no rule (None) -> the clinic's own coverage requirements, with a warning.
An organization with no state at all keeps the legacy Maryland default + warning.

SEED_RULES documents what the data migration loads (and is the fallback if the
rule table is empty). We never guess numbers: a state without an active rule
produces a warning, not a made-up standard.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional

from . import hppd

STATUS_ACTIVE = "active"
STATUS_DRAFT = "draft"
STATUS_INACTIVE = "inactive"


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
    min_licensed_hppd: Optional[float] = None
    min_cna_hppd: Optional[float] = None
    rule_id: Optional[int] = None
    is_custom: bool = False
    needs_verification: bool = False
    effective_date: str = ""
    last_verified_date: str = ""
    facility_type: str = "nursing_home"

    def as_dict(self):
        return {
            "id": self.rule_id,
            "state": self.state,
            "name": self.name,
            "hppd_min": self.hppd_min,
            "min_licensed_hppd": self.min_licensed_hppd,
            "min_cna_hppd": self.min_cna_hppd,
            "max_residents_per_staff": self.max_residents_per_staff,
            "min_rn_per_shift": self.min_rn_per_shift,
            "source": self.source,
            "status": self.status,
            "notes": self.notes,
            "is_custom": self.is_custom,
            "needs_verification": self.needs_verification,
            "effective_date": self.effective_date,
            "last_verified_date": self.last_verified_date,
            "facility_type": self.facility_type,
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

NEW_YORK = StateRule(
    state="NY",
    name="New York",
    hppd_min=3.5,
    min_licensed_hppd=1.1,
    min_cna_hppd=2.2,
    max_residents_per_staff=None,
    min_rn_per_shift=0,
    source="N.Y. Pub. Health Law 2895-b; 10 NYCRR 415.13(b)(2)",
    notes=(
        "3.5 hrs/resident/day: at least 1.1 from RNs/LPNs and 2.2 from CNAs. The state "
        "measures compliance as a quarterly average, so a single day is a planning target."
    ),
    effective_date="2022-04-01",
)

CONNECTICUT = StateRule(
    state="CT",
    name="Connecticut",
    hppd_min=3.0,
    min_licensed_hppd=0.84,
    max_residents_per_staff=None,
    min_rn_per_shift=0,
    source="Regs. Conn. State Agencies 19-13-D8t(m)(6); Conn. Gen. Stat. 19a-563h",
    notes=(
        "3.0 hrs/resident/day with at least 0.84 from licensed nurses. Day (7a-9p) 2.17 total / "
        "0.57 licensed; night (9p-7a) 0.83 total / 0.27 licensed -- the day/night split is shown "
        "for reference and is not enforced separately."
    ),
    needs_verification=True,
)

SEED_RULES = (MARYLAND, NEW_YORK, CONNECTICUT)
# Fallback if the rule table is empty (e.g. before the migration has run).
STATE_RULES: Dict[str, StateRule] = {r.state: r for r in SEED_RULES}

# Orgs that predate the state field have no state. They were already being
# evaluated with Maryland numbers, so keep that (and warn) instead of silently
# changing their calendar.
LEGACY_DEFAULT_STATE = "MD"


def _f(value):
    return None if value is None else float(value)


def to_state_rule(row) -> StateRule:
    """Convert a StaffingRule row to the plain StateRule the engine uses."""
    return StateRule(
        state=row.state,
        name=row.name,
        hppd_min=float(row.hppd_min),
        max_residents_per_staff=row.max_residents_per_staff,
        min_rn_per_shift=row.min_rn_per_shift,
        source=row.source,
        status=row.status,
        notes=row.notes,
        min_licensed_hppd=_f(row.min_licensed_hppd),
        min_cna_hppd=_f(row.min_cna_hppd),
        rule_id=row.pk,
        is_custom=row.organization_id is not None,
        needs_verification=row.needs_verification,
        effective_date=row.effective_date.isoformat() if row.effective_date else "",
        last_verified_date=row.last_verified_date.isoformat() if row.last_verified_date else "",
        facility_type=row.facility_type,
    )


def shared_rule_row(state_code):
    """The active shared StaffingRule row for a state, or None."""
    from .models import StaffingRule

    code = (state_code or "").strip().upper()
    if not code:
        return None
    return (
        StaffingRule.objects.filter(
            organization__isnull=True, state=code, status=STATUS_ACTIVE
        )
        .order_by("id")
        .first()
    )


def rule_for_state(state_code) -> Optional[StateRule]:
    """The ACTIVE shared rule for a state code, or None."""
    row = shared_rule_row(state_code)
    if row:
        return to_state_rule(row)
    from .models import StaffingRule

    if not StaffingRule.objects.exists():     # table never seeded: use built-ins
        rule = STATE_RULES.get((state_code or "").strip().upper())
        return rule if rule and rule.status == STATUS_ACTIVE else None
    return None


def states_with_rules():
    from .models import StaffingRule

    states = set(
        StaffingRule.objects.filter(organization__isnull=True, status=STATUS_ACTIVE)
        .exclude(state="")
        .values_list("state", flat=True)
    )
    return sorted(states or {s for s, r in STATE_RULES.items() if r.status == STATUS_ACTIVE})


@dataclass(frozen=True)
class ResolvedRule:
    rule: Optional[StateRule]   # None -> no rule applies; use the clinic's fixed requirements
    state: str                  # state the org is in ("" if unset)
    warning: str = ""           # shown to admins when something needs attention


def _state_resolution(state_code) -> ResolvedRule:
    state = (state_code or "").strip().upper()
    if not state:
        return ResolvedRule(
            rule_for_state(LEGACY_DEFAULT_STATE) or MARYLAND,
            "",
            "Clinic state is not set; Maryland rules are being used by default. "
            "Set the clinic's state so the correct rules apply.",
        )
    rule = rule_for_state(state)
    if rule:
        return ResolvedRule(rule, state, _verify_warning(rule))
    return ResolvedRule(
        None,
        state,
        f"No verified staffing rule is configured for {state}. Calendar colors use "
        "your own coverage requirements only.",
    )


def _verify_warning(rule: StateRule) -> str:
    if rule.needs_verification:
        return (
            f"The {rule.name} staffing standard is awaiting verification. "
            "Confirm the numbers with your compliance officer."
        )
    return ""


def resolve_rule(state_code) -> ResolvedRule:
    """Resolve by state only (no organization choice). Kept for existing callers/tests."""
    return _state_resolution(state_code)


def resolve_rule_for_org(org) -> ResolvedRule:
    """The rule that applies to an organization (its choice first, then its state's)."""
    from .models import OrgStaffingRule

    state = (getattr(org, "state", "") or "").strip().upper()
    choice = (
        OrgStaffingRule.objects.select_related("rule")
        .filter(organization=org)
        .first()
    )
    if choice:
        row = choice.rule
        usable = row.status == STATUS_ACTIVE and (
            row.organization_id is None or row.organization_id == org.pk
        )
        if usable:
            rule = to_state_rule(row)
            warning = _verify_warning(rule)
            if rule.is_custom:
                warning = ""      # the org owns its custom numbers; the UI labels them "Custom"
            return ResolvedRule(rule, state, warning)
    return _state_resolution(state)
