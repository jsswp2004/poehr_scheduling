"""
Loads an immunization schedule from a JSON document into ImmunizationItem, ImmunizationSchedule and ImmunizationRule.

The document is plain data, so the same shape can later be produced by the configuration builder:

{
  "schedule": {"name", "description", "population": "adult|child|all", "is_risk_group": false,
               "source", "edition", "triggers": [{"code_system": "icd10cm", "code_prefix": "E11"}]},
  "items":    [{"code", "name", "display_name", "kind": "vaccine|screening", "description", "sort_order", "cvx": ["115", ...]}],
  "rules":    [{"item", "min_age_months", "max_age_months", "sex", "dose_count", "dose_min_ages_months",
                "dose_min_intervals_days", "recurrence_months", "near_due_days", "overdue_after_days",
                "review_reason", "why_text"}]
}

Rules for loading:
  * Every CVX code listed must already exist in VaccineProduct (run import_cvx first). A missing code stops the load.
  * A schedule is matched by (name, edition) among the shared (no organization) schedules. Loading it again replaces its
    rules, bumps the version and puts it back to "draft": changed rules are never live without being approved again.
  * Loading never approves a schedule. Approval needs a named user (approve_as), who is recorded as the approver.
"""

from django.db import transaction
from django.utils import timezone

from .models import (
    ImmunizationItem,
    ImmunizationRule,
    ImmunizationSchedule,
    ImmunizationScheduleTrigger,
    VaccineProduct,
)

SCHEDULE_KEYS = {"name", "description", "population", "is_risk_group", "source", "edition", "triggers"}
ITEM_KEYS = {"code", "name", "display_name", "kind", "description", "sort_order", "cvx"}
RULE_KEYS = {
    "item", "min_age_months", "max_age_months", "sex", "dose_count", "dose_min_ages_months",
    "dose_min_intervals_days", "recurrence_months", "near_due_days", "overdue_after_days", "review_reason", "why_text",
}
POPULATIONS = {"adult", "child", "all"}
KINDS = {"vaccine", "screening"}
SEXES = {"any", "female", "male"}


class ScheduleFormatError(ValueError):
    pass


def _int(value, where, minimum=0, allow_none=False):
    if value is None and allow_none:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ScheduleFormatError(f"{where}: expected a whole number of at least {minimum}, found {value!r}")
    return value


def _int_list(value, where):
    if value is None:
        return []
    if not isinstance(value, list):
        raise ScheduleFormatError(f"{where}: expected a list of whole numbers")
    return [_int(v, f"{where}[{i}]") for i, v in enumerate(value)]


def _unknown(obj, allowed, where):
    extra = sorted(set(obj) - allowed)
    if extra:
        raise ScheduleFormatError(f"{where}: unknown field(s) {', '.join(extra)}")


def validate_document(doc):
    """Return a cleaned copy of the document or raise ScheduleFormatError naming the part that is wrong."""
    if not isinstance(doc, dict) or not {"schedule", "items", "rules"} <= set(doc):
        raise ScheduleFormatError("the document needs 'schedule', 'items' and 'rules'")
    sched = doc["schedule"]
    if not isinstance(sched, dict):
        raise ScheduleFormatError("schedule: expected an object")
    _unknown(sched, SCHEDULE_KEYS, "schedule")
    name = (sched.get("name") or "").strip()
    if not name:
        raise ScheduleFormatError("schedule.name is required")
    if not (sched.get("source") or "").strip() or not (sched.get("edition") or "").strip():
        raise ScheduleFormatError("schedule.source and schedule.edition are required: every schedule must say where it came from")
    population = sched.get("population", "all")
    if population not in POPULATIONS:
        raise ScheduleFormatError(f"schedule.population {population!r} is not one of {sorted(POPULATIONS)}")
    triggers = []
    for i, t in enumerate(sched.get("triggers") or []):
        prefix = (t.get("code_prefix") or "").strip()
        if not prefix:
            raise ScheduleFormatError(f"schedule.triggers[{i}]: code_prefix is required")
        triggers.append({"code_system": (t.get("code_system") or "icd10cm").strip(), "code_prefix": prefix})
    if triggers and not sched.get("is_risk_group"):
        raise ScheduleFormatError("schedule.triggers only make sense on a risk schedule (is_risk_group true)")

    items, seen = [], set()
    if not isinstance(doc["items"], list) or not doc["items"]:
        raise ScheduleFormatError("items: expected a non-empty list")
    for i, item in enumerate(doc["items"]):
        where = f"items[{i}]"
        _unknown(item, ITEM_KEYS, where)
        code = (item.get("code") or "").strip()
        if not code or not (item.get("name") or "").strip():
            raise ScheduleFormatError(f"{where}: code and name are required")
        if code in seen:
            raise ScheduleFormatError(f"{where}: duplicate item code {code!r}")
        seen.add(code)
        kind = item.get("kind", "vaccine")
        if kind not in KINDS:
            raise ScheduleFormatError(f"{where}: kind {kind!r} is not one of {sorted(KINDS)}")
        cvx = [str(c).strip() for c in item.get("cvx", [])]
        if kind == "vaccine" and not cvx:
            raise ScheduleFormatError(f"{where}: a vaccine item needs at least one CVX code")
        items.append({
            "code": code, "name": item["name"].strip(), "display_name": (item.get("display_name") or "").strip(),
            "description": (item.get("description") or "").strip(), "kind": kind,
            "sort_order": _int(item.get("sort_order", 100), f"{where}.sort_order"), "cvx": cvx,
        })

    rules = []
    if not isinstance(doc["rules"], list) or not doc["rules"]:
        raise ScheduleFormatError("rules: expected a non-empty list")
    for i, rule in enumerate(doc["rules"]):
        where = f"rules[{i}]"
        _unknown(rule, RULE_KEYS, where)
        if rule.get("item") not in seen:
            raise ScheduleFormatError(f"{where}: item {rule.get('item')!r} is not in the items list")
        sex = rule.get("sex", "any")
        if sex not in SEXES:
            raise ScheduleFormatError(f"{where}: sex {sex!r} is not one of {sorted(SEXES)}")
        lo = _int(rule.get("min_age_months", 0), f"{where}.min_age_months")
        hi = _int(rule.get("max_age_months"), f"{where}.max_age_months", allow_none=True)
        if hi is not None and hi < lo:
            raise ScheduleFormatError(f"{where}: max_age_months {hi} is below min_age_months {lo}")
        count = _int(rule.get("dose_count", 1), f"{where}.dose_count", minimum=1)
        ages = _int_list(rule.get("dose_min_ages_months"), f"{where}.dose_min_ages_months")
        gaps = _int_list(rule.get("dose_min_intervals_days"), f"{where}.dose_min_intervals_days")
        if len(ages) > count or len(gaps) > count:
            raise ScheduleFormatError(f"{where}: dose lists are longer than dose_count {count}")
        rules.append({
            "item": rule["item"], "min_age_months": lo, "max_age_months": hi, "sex": sex, "dose_count": count,
            "dose_min_ages_months": ages, "dose_min_intervals_days": gaps,
            "recurrence_months": _int(rule.get("recurrence_months"), f"{where}.recurrence_months", minimum=1, allow_none=True),
            "near_due_days": _int(rule.get("near_due_days", 60), f"{where}.near_due_days"),
            "overdue_after_days": _int(rule.get("overdue_after_days"), f"{where}.overdue_after_days", allow_none=True),
            "review_reason": (rule.get("review_reason") or "").strip(),
            "why_text": (rule.get("why_text") or "").strip(),
        })
    return {
        "schedule": {
            "name": name, "description": (sched.get("description") or "").strip(), "population": population,
            "is_risk_group": bool(sched.get("is_risk_group")), "source": sched["source"].strip(),
            "edition": sched["edition"].strip(), "triggers": triggers,
        },
        "items": items, "rules": rules,
    }


@transaction.atomic
def load_schedule(doc, user=None, approve_as=None):
    """
    Validate and load a schedule document. Returns a dict of counts and the schedule. Raises ScheduleFormatError when the
    document is wrong or names a CVX code that has not been imported.
    """
    clean = validate_document(doc)
    wanted = {c for item in clean["items"] for c in item["cvx"]}
    products = {p.cvx_code: p for p in VaccineProduct.objects.filter(cvx_code__in=wanted)}
    missing = sorted(wanted - set(products))
    if missing:
        hint = " Run import_cvx first." if not VaccineProduct.objects.exists() else ""
        raise ScheduleFormatError(f"CVX code(s) not in the vaccine catalog: {', '.join(missing)}.{hint}")

    s = clean["schedule"]
    schedule = ImmunizationSchedule.objects.filter(organization__isnull=True, name=s["name"], edition=s["edition"]).first()
    created = schedule is None
    if created:
        schedule = ImmunizationSchedule(organization=None, name=s["name"], edition=s["edition"], created_by=user)
    else:
        schedule.version += 1
    schedule.description, schedule.population = s["description"], s["population"]
    schedule.is_risk_group, schedule.source = s["is_risk_group"], s["source"]
    schedule.status, schedule.approved_by, schedule.approved_at = "draft", None, None
    schedule.updated_by = user
    schedule.save()

    by_code = {}
    for item in clean["items"]:
        obj, _ = ImmunizationItem.objects.update_or_create(
            organization=None, code=item["code"],
            defaults={"name": item["name"], "display_name": item["display_name"], "description": item["description"],
                      "kind": item["kind"], "sort_order": item["sort_order"], "active": True, "updated_by": user},
        )
        obj.products.set([products[c] for c in item["cvx"]])
        by_code[item["code"]] = obj

    schedule.rules.all().delete()
    for rule in clean["rules"]:
        ImmunizationRule.objects.create(schedule=schedule, item=by_code[rule["item"]], updated_by=user,
                                        **{k: v for k, v in rule.items() if k != "item"})
    schedule.triggers.all().delete()
    for t in s["triggers"]:
        ImmunizationScheduleTrigger.objects.create(schedule=schedule, **t)

    if approve_as is not None:
        schedule.status, schedule.approved_by, schedule.approved_at = "approved", approve_as, timezone.now()
        schedule.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    return {"schedule": schedule, "created": created, "items": len(by_code), "rules": len(clean["rules"]),
            "triggers": len(s["triggers"])}
