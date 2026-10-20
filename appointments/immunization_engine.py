"""
Vaccine Manager recommendation engine.

Pure logic: no database, no clock, no network. Give it a date of birth, sex, "today", the schedule rules and the
patient's recorded doses, and it returns one Recommendation per vaccine or screening. Nothing here decides
anything the schedule data does not say, so a change to a rule (through the configuration builder) changes the
result with no code change, and every line of "why" can be traced to a rule.

Statuses
    overdue    past the due date by more than the rule's overdue_after_days
    due        due now
    near_due   due within the rule's near_due_days
    review     age alone cannot decide (risk conditions, proof of immunity): a clinician must look
    future     not yet eligible
    done       series complete, or up to date
    not_done   a clinician recorded a decision not to give it, and it is not time to offer again
    aged_out   past the rule's age range
"""

import calendar
import datetime
from dataclasses import dataclass, field
from typing import List, Optional

OVERDUE = "overdue"
DUE = "due"
NEAR_DUE = "near_due"
REVIEW = "review"
FUTURE = "future"
DONE = "done"
NOT_DONE = "not_done"
AGED_OUT = "aged_out"

# Display order: what needs attention first.
STATUS_ORDER = {OVERDUE: 0, DUE: 1, NEAR_DUE: 2, REVIEW: 3, FUTURE: 4, NOT_DONE: 5, DONE: 6, AGED_OUT: 7}

# A refusal with no "offer again" date comes back to the list after this long.
DECLINE_RESURFACE_DAYS = 365
# Reasons that hold an item off the due list. Others (illness, not available, given elsewhere) do not: the item
# stays due until a dose is recorded.
SUPPRESSING_REASONS = {"declined", "medical"}
REASON_LABELS = {
    "declined": "declined",
    "medical": "medical reason",
    "illness": "temporary illness",
    "immune": "evidence of immunity",
    "given_elsewhere": "given elsewhere",
    "unavailable": "not available",
    "other": "other reason",
}


@dataclass(frozen=True)
class RuleSpec:
    item_code: str
    item_name: str
    kind: str = "vaccine"
    min_age_months: int = 0
    max_age_months: Optional[int] = None
    sex: str = "any"
    dose_count: int = 1
    dose_min_ages_months: tuple = ()
    dose_min_intervals_days: tuple = ()
    recurrence_months: Optional[int] = None
    near_due_days: int = 60
    overdue_after_days: Optional[int] = None
    review_reason: str = ""
    why_text: str = ""
    rule_id: Optional[int] = None


@dataclass(frozen=True)
class RecordSpec:
    item_code: str
    status: str = "done"
    dose_number: int = 1
    given_on: Optional[datetime.date] = None
    offer_again_on: Optional[datetime.date] = None
    not_done_reason: str = ""
    recorded_on: Optional[datetime.date] = None


@dataclass
class Recommendation:
    item_code: str
    name: str
    kind: str
    status: str
    why: str
    last_done: Optional[datetime.date] = None
    next_due: Optional[datetime.date] = None
    dose_number: Optional[int] = None
    dose_count: int = 1
    doses: List[str] = field(default_factory=list)  # "given" | "due" | "later", one per dose of a series
    rule_id: Optional[int] = None


# ---- dates ----------------------------------------------------------------

def add_months(d, months):
    index = d.month - 1 + months
    year = d.year + index // 12
    month = index % 12 + 1
    return datetime.date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def age_in_months(dob, as_of):
    months = (as_of.year - dob.year) * 12 + (as_of.month - dob.month)
    if as_of.day < dob.day:
        months -= 1
    return months


def _timing(as_of, due_date, rule):
    """Status of something that becomes due on due_date."""
    if as_of >= due_date:
        if rule.overdue_after_days is not None and as_of > due_date + datetime.timedelta(days=rule.overdue_after_days):
            return OVERDUE
        return DUE
    if (due_date - as_of).days <= rule.near_due_days:
        return NEAR_DUE
    return FUTURE


# ---- one item -------------------------------------------------------------

def _choose_rule(rules, age, sex):
    sex_known = sex in ("female", "male")
    candidates = [r for r in rules if r.sex == "any" or r.sex == sex or not sex_known]
    applicable = [r for r in candidates if r.min_age_months <= age and (r.max_age_months is None or age <= r.max_age_months)]
    if applicable:
        return max(applicable, key=lambda r: r.min_age_months), "applies", sex_known
    upcoming = [r for r in candidates if r.min_age_months > age]
    if upcoming:
        return min(upcoming, key=lambda r: r.min_age_months), "future", sex_known
    if any(r.max_age_months is not None and age > r.max_age_months for r in candidates):
        return max((r for r in candidates if r.max_age_months is not None), key=lambda r: r.max_age_months), "aged_out", sex_known
    return None, "none", sex_known


def _item_records(records, code, as_of):
    mine = [r for r in records if r.item_code == code]
    done = sorted(
        (r for r in mine if r.status == "done" and r.given_on and r.given_on <= as_of), key=lambda r: r.given_on
    )
    not_done = [r for r in mine if r.status == "not_done"]
    return done, not_done


def _suppression(not_done, done, as_of):
    """The not-done decision that currently holds the item off the list, as (record, offer_again_date or None)."""
    last_given = done[-1].given_on if done else None
    live = [
        r for r in not_done
        if r.not_done_reason in SUPPRESSING_REASONS
        and (last_given is None or r.recorded_on is None or r.recorded_on >= last_given)
    ]
    if not live:
        return None
    rec = max(live, key=lambda r: r.recorded_on or datetime.date.min)
    resurface = rec.offer_again_on
    if resurface is None and rec.not_done_reason == "declined" and rec.recorded_on:
        resurface = rec.recorded_on + datetime.timedelta(days=DECLINE_RESURFACE_DAYS)
    if resurface is not None and as_of >= resurface:
        return None
    return rec, resurface


def _recommend_item(rules, records, dob, sex, as_of):
    age = age_in_months(dob, as_of)
    rule, mode, sex_known = _choose_rule(rules, age, sex)
    if rule is None:
        return None
    code, name, kind = rules[0].item_code, rules[0].item_name, rules[0].kind
    base = dict(item_code=code, name=name, kind=kind, dose_count=rule.dose_count, rule_id=rule.rule_id)
    done, not_done = _item_records(records, code, as_of)
    last_done = done[-1].given_on if done else None

    if mode == "future":
        first = add_months(dob, rule.min_age_months)
        return Recommendation(status=FUTURE, why=rule.why_text or "Not yet eligible.", next_due=first, last_done=last_done, **base)
    if mode == "aged_out":
        return Recommendation(status=AGED_OUT, why="Past the age range for this item.", last_done=last_done, **base)

    if rule.sex != "any" and not sex_known:
        return Recommendation(status=REVIEW, why="Sex is not recorded, and this rule depends on it.", last_done=last_done, **base)

    immune = any(r.not_done_reason == "immune" for r in not_done)
    series = rule.dose_count > 1
    n_done = len(done)
    next_due = None
    dose_number = None
    doses: List[str] = []
    why = rule.why_text

    if immune:
        return Recommendation(status=DONE, why="Evidence of immunity recorded.", last_done=last_done, **base)

    if series:
        if n_done >= rule.dose_count:
            return Recommendation(
                status=DONE, why="Series complete.", last_done=last_done, doses=["given"] * rule.dose_count, **base
            )
        k = n_done
        floor = add_months(dob, rule.min_age_months)
        if k < len(rule.dose_min_ages_months):
            floor = max(floor, add_months(dob, rule.dose_min_ages_months[k]))
        if k > 0 and k < len(rule.dose_min_intervals_days) and rule.dose_min_intervals_days[k]:
            floor = max(floor, last_done + datetime.timedelta(days=rule.dose_min_intervals_days[k]))
        status = _timing(as_of, floor, rule)
        next_due, dose_number = floor, k + 1
        why = ((why + " ") if why else "") + f"Dose {k + 1} of {rule.dose_count}."
        nxt = "due" if status in (DUE, OVERDUE) else "later"
        doses = ["given"] * n_done + [nxt] + ["later"] * (rule.dose_count - n_done - 1)
    elif rule.recurrence_months:
        if done:
            next_due = add_months(last_done, rule.recurrence_months)
            beyond = rule.max_age_months is not None and age_in_months(dob, next_due) > rule.max_age_months
            if beyond:
                return Recommendation(status=DONE, why="Up to date. No further doses in this age range.", last_done=last_done, **base)
            if as_of < next_due:
                status = NEAR_DUE if (next_due - as_of).days <= rule.near_due_days else DONE
                if status == DONE:
                    return Recommendation(status=DONE, why="Up to date.", last_done=last_done, next_due=next_due, **base)
            else:
                status = _timing(as_of, next_due, rule)
        else:
            next_due = add_months(dob, rule.min_age_months)
            status = _timing(as_of, next_due, rule)
    else:  # a single dose, once
        if done:
            return Recommendation(status=DONE, why="Done.", last_done=last_done, **base)
        next_due = add_months(dob, rule.min_age_months)
        status = _timing(as_of, next_due, rule)

    if status in (DUE, OVERDUE, NEAR_DUE):
        held = _suppression(not_done, done, as_of)
        if held:
            rec, resurface = held
            label = REASON_LABELS.get(rec.not_done_reason, rec.not_done_reason)
            text = f"Not done: {label}." + (f" Offer again {resurface:%m/%d/%Y}." if resurface else "")
            return Recommendation(
                status=NOT_DONE, why=text, last_done=last_done, next_due=resurface, dose_number=dose_number, doses=doses, **base
            )
        if rule.review_reason:
            return Recommendation(
                status=REVIEW, why=rule.review_reason, last_done=last_done, dose_number=dose_number, doses=doses, **base
            )
    return Recommendation(
        status=status, why=why or "Recommended for this age.", last_done=last_done, next_due=next_due,
        dose_number=dose_number, doses=doses, **base,
    )


# ---- all items ------------------------------------------------------------

def recommend(dob, sex, as_of, rules, records):
    """One Recommendation per item that has any rule for this patient, in the rules' own order of first appearance."""
    by_item = {}
    for rule in rules:
        by_item.setdefault(rule.item_code, []).append(rule)
    out = []
    for item_rules in by_item.values():
        rec = _recommend_item(item_rules, records, dob, (sex or "").lower(), as_of)
        if rec is not None:
            out.append(rec)
    return out


def summarize(recommendations):
    counts = {s: 0 for s in STATUS_ORDER}
    for r in recommendations:
        counts[r.status] += 1
    return counts
