"""
Vaccine Manager service: gathers a patient's facts from the database, hands them to the rule engine
(immunization_engine, pure logic) and returns what is due.

Which rules apply
  * One approved age schedule per population (child under 19, adult 19 and over). A clinic's own approved schedule
    takes the place of the shared one. If the chosen tier has more than one, nothing is recommended and the response says
    which schedules clash: the clinic must retire one. We never pick between two clinical sources silently.
  * Risk schedules the patient is on (PatientSchedule status "active", schedule approved). For a vaccine a risk schedule
    covers at the patient's age, the risk rule replaces the age rule. Risk schedules are listed first, so when two risk
    schedules cover the same vaccine the one with the later minimum age wins, then the first in name order.
  * Problem-list entries can suggest a risk schedule through its diagnosis-code triggers. A suggestion does nothing until a
    clinician confirms it.
"""

import datetime

from django.db.models import Q

from . import immunization_engine as engine
from .models import (
    ImmunizationRule,
    ImmunizationSchedule,
    PatientImmunization,
    PatientSchedule,
    ProblemListEntry,
)

ADULT_FROM_MONTHS = 228  # 19 years: where the child schedules end and the adult schedule begins


def patient_facts(patient):
    """(date of birth or None, sex as the engine wants it: 'female', 'male' or '')."""
    profile = getattr(patient, "patient_profile", None)
    dob = getattr(profile, "date_of_birth", None)
    sex = {"F": "female", "M": "male"}.get(getattr(profile, "legal_sex", "") or "", "")
    return dob, sex


def _visible_schedules(org):
    return ImmunizationSchedule.objects.filter(status="approved").filter(Q(organization=org) | Q(organization__isnull=True))


def pick_age_schedule(org, age_months):
    """Returns (schedule or None, list of clashing schedules). A clash means more than one choice in the same tier."""
    population = "adult" if age_months >= ADULT_FROM_MONTHS else "child"
    pool = _visible_schedules(org).filter(is_risk_group=False, population__in=[population, "all"])
    for tier in (pool.filter(organization=org), pool.filter(organization__isnull=True)):
        found = list(tier.order_by("name", "id"))
        if len(found) == 1:
            return found[0], []
        if len(found) > 1:
            return None, found
    return None, []


def _spec(rule):
    item = rule.item
    return engine.RuleSpec(
        item_code=item.code, item_name=item.display_name or item.name, kind=item.kind,
        min_age_months=rule.min_age_months, max_age_months=rule.max_age_months, sex=rule.sex,
        dose_count=rule.dose_count, dose_min_ages_months=tuple(rule.dose_min_ages_months or ()),
        dose_min_intervals_days=tuple(rule.dose_min_intervals_days or ()), recurrence_months=rule.recurrence_months,
        near_due_days=rule.near_due_days, overdue_after_days=rule.overdue_after_days,
        review_reason=rule.review_reason, why_text=rule.why_text, rule_id=rule.pk,
    )


def _rules_of(schedules):
    qs = (
        ImmunizationRule.objects.filter(schedule__in=schedules, active=True, item__active=True)
        .select_related("item", "schedule")
        .order_by("schedule__name", "schedule_id", "item__sort_order", "min_age_months", "id")
    )
    return list(qs)


def assigned_risk_schedules(patient, org):
    return list(
        PatientSchedule.all_objects.filter(organization=org, patient=patient, status="active", schedule__status="approved")
        .select_related("schedule").order_by("schedule__name", "id")
    )


def build_rules(age_schedule, risk_schedules, age_months):
    """Age rules with risk rules in front; risk rules replace the age rule for a vaccine they cover at this age."""
    risk_rules = _rules_of(risk_schedules) if risk_schedules else []
    covered = {
        r.item.code for r in risk_rules
        if r.min_age_months <= age_months and (r.max_age_months is None or age_months <= r.max_age_months)
    }
    age_rules = [r for r in (_rules_of([age_schedule]) if age_schedule else []) if r.item.code not in covered]
    return [_spec(r) for r in risk_rules + age_rules]


def record_specs(patient, org):
    out = []
    for rec in PatientImmunization.all_objects.filter(organization=org, patient=patient).exclude(status="entered_in_error").select_related("item"):
        out.append(engine.RecordSpec(
            item_code=rec.item.code, status=rec.status, dose_number=rec.dose_number, given_on=rec.given_on,
            offer_again_on=rec.offer_again_on, not_done_reason=rec.not_done_reason,
            recorded_on=rec.created_at.date() if rec.created_at else None,
        ))
    return out


def suggested_risk_schedules(patient, org, age_months):
    """Approved risk schedules whose diagnosis triggers match an active problem and that the patient is not already on."""
    already = set(PatientSchedule.all_objects.filter(organization=org, patient=patient)
                  .filter(status__in=["suggested", "active", "dismissed"]).values_list("schedule_id", flat=True))
    problems = [
        p for p in ProblemListEntry.objects.filter(organization=org, patient=patient, status__in=["active", "chronic"])
        if p.code and (p.code_system or "icd10cm") == "icd10cm"
    ]
    population = "adult" if age_months >= ADULT_FROM_MONTHS else "child"
    out = []
    for schedule in _visible_schedules(org).filter(is_risk_group=True, population__in=[population, "all"]).prefetch_related("triggers"):
        if schedule.pk in already:
            continue
        for trigger in schedule.triggers.all():
            hit = next((p for p in problems if trigger.code_system == (p.code_system or "icd10cm")
                        and p.code.upper().startswith(trigger.code_prefix.upper())), None)
            if hit:
                out.append({"schedule": schedule, "problem": hit, "trigger": trigger.code_prefix})
                break
    return out


def recommend_for_patient(patient, org, as_of=None):
    """Everything the chart page needs from the engine for one patient."""
    as_of = as_of or datetime.date.today()
    dob, sex = patient_facts(patient)
    result = {"as_of": as_of, "dob": dob, "sex": sex, "age_schedule": None, "clash": [], "risk": [],
              "suggestions": [], "recommendations": [], "problem": ""}
    if dob is None:
        result["problem"] = "no_dob"
        return result
    if dob > as_of:
        result["problem"] = "future_dob"
        return result
    age = engine.age_in_months(dob, as_of)
    schedule, clash = pick_age_schedule(org, age)
    result["age_schedule"], result["clash"] = schedule, clash
    if clash:
        result["problem"] = "schedule_clash"
    elif schedule is None:
        result["problem"] = "no_schedule"
    risk = assigned_risk_schedules(patient, org)
    result["risk"] = risk
    result["suggestions"] = suggested_risk_schedules(patient, org, age)
    if schedule is None and not risk:
        return result
    rules = build_rules(schedule, [r.schedule for r in risk], age)
    recs = engine.recommend(dob, sex, as_of, rules, record_specs(patient, org))
    recs.sort(key=lambda r: (engine.STATUS_ORDER[r.status], r.name))
    result["recommendations"] = recs
    return result
