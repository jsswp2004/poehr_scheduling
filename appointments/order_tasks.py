"""
Nurse tasks made from signed orders.

A medication order carries a *schedule* (frequency, dose, route, ...). When the order becomes active
the engine lays out the due times as OrderTask rows -- one per dose -- a day ahead at a time, and
keeps topping them up whenever the worklist is opened (no background job is needed). A nursing order
makes tasks only if it was given a frequency; without one it is a standing instruction.

    pending --complete / hold / refuse--> done / held / refused
    pending --(not touched for `missed_after_hours`)--> missed        (can still be documented, late)
    pending --(order discontinued or completed)--> cancelled           (only doses not yet due)

Every change is written to OrderTaskEvent, and a signed order's schedule is frozen when it is signed.
"""

from datetime import datetime, time, timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from users.models import Organization

from .models import Order, OrderTask, OrderTaskEvent, TaskSettings

PERFORM_ROLES = ("nurse", "doctor", "system_admin")
VIEW_ROLES = ("nurse", "doctor", "admin", "system_admin")
ADMIN_ROLES = ("admin", "system_admin")

# key -> (label, kind, clock times or interval hours)
FREQUENCIES = {
    "once": ("Once", "once", None),
    "stat": ("STAT (now)", "once", None),
    "daily": ("Daily", "clock", ["09:00"]),
    "qam": ("Every morning", "clock", ["06:00"]),
    "qhs": ("At bedtime", "clock", ["21:00"]),
    "bid": ("Twice a day (BID)", "clock", ["09:00", "21:00"]),
    "tid": ("Three times a day (TID)", "clock", ["09:00", "14:00", "21:00"]),
    "qid": ("Four times a day (QID)", "clock", ["09:00", "13:00", "17:00", "21:00"]),
    "q1h": ("Every hour", "interval", 1),
    "q2h": ("Every 2 hours", "interval", 2),
    "q4h": ("Every 4 hours", "interval", 4),
    "q6h": ("Every 6 hours", "interval", 6),
    "q8h": ("Every 8 hours", "interval", 8),
    "q12h": ("Every 12 hours", "interval", 12),
    "weekly": ("Weekly", "interval", 168),
    "prn": ("As needed (PRN)", "prn", None),
}
FREQUENCY_LABELS = {k: v[0] for k, v in FREQUENCIES.items()}
ROUTES = ["PO", "IV", "IVPB", "IM", "SC", "SL", "PR", "Topical", "Inhaled", "Ophthalmic", "Otic", "Nasal", "Transdermal", "Via tube", "Other"]

DEFAULT_GRACE = 60
DEFAULT_MISSED_AFTER = 12
DEFAULT_LOOK_AHEAD = 24
DUE_SOON_MINUTES = 60
MAX_DAYS = 400


class TaskError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ---------------------------------------------------------------- settings

def _valid_time(value):
    try:
        hh, mm = str(value).split(":")
        return 0 <= int(hh) <= 23 and 0 <= int(mm) <= 59 and len(mm) == 2
    except (ValueError, TypeError):
        return False


def clean_pass_times(raw):
    """Validate {frequency: ['HH:MM', ...]}; raises TaskError."""
    if not isinstance(raw, dict):
        raise TaskError("Pass times must list times for each frequency.")
    out = {}
    for key, times in raw.items():
        if key not in FREQUENCIES or FREQUENCIES[key][1] != "clock":
            raise TaskError(f"'{key}' does not use fixed clock times.")
        if not isinstance(times, list) or not times or len(times) > 8 or not all(_valid_time(t) for t in times):
            raise TaskError(f"Give {FREQUENCY_LABELS[key]} one or more times like 09:00.")
        out[key] = sorted({f"{int(t.split(':')[0]):02d}:{t.split(':')[1]}" for t in times})
    return out


def settings_for(org):
    """The clinic's task rules with defaults filled in."""
    row = TaskSettings.objects.filter(organization=org).first() if org else None
    times = {k: list(v[2]) for k, v in FREQUENCIES.items() if v[1] == "clock"}
    if row and isinstance(row.pass_times, dict):
        for key, value in row.pass_times.items():
            if key in times and isinstance(value, list) and value and all(_valid_time(t) for t in value):
                times[key] = sorted(value)
    return {
        "grace_minutes": row.grace_minutes if row else DEFAULT_GRACE,
        "missed_after_hours": row.missed_after_hours if row else DEFAULT_MISSED_AFTER,
        "look_ahead_hours": row.look_ahead_hours if row else DEFAULT_LOOK_AHEAD,
        "pass_times": times,
    }


# ---------------------------------------------------------------- the schedule on an order

def _parse_when(value, label):
    if value in (None, ""):
        return None
    when = value if hasattr(value, "year") else parse_datetime(str(value))
    if when is None:
        raise TaskError(f"{label} is not a valid date and time.")
    if timezone.is_naive(when):
        when = timezone.make_aware(when)
    return when


def clean_schedule(raw, orderable):
    """Validate what was typed. Returns the schedule to store ({} when nothing was given)."""
    if orderable.task_mode == "none" or not isinstance(raw, dict) or not raw:
        return {}
    out = {}
    freq = str(raw.get("frequency") or "").strip().lower()
    if freq:
        if freq not in FREQUENCIES:
            raise TaskError("Choose a frequency from the list.")
        out["frequency"] = freq
    for key, limit, label in (("dose", 120, "Dose"), ("route", 40, "Route"), ("prn_reason", 120, "The PRN reason"), ("instructions", 500, "Instructions")):
        value = str(raw.get(key) or "").strip()
        if len(value) > limit:
            raise TaskError(f"{label} is longer than {limit} characters.")
        if value:
            out[key] = value
    first = _parse_when(raw.get("first_due"), "The first dose time")
    stop = _parse_when(raw.get("stop_at"), "The stop time")
    days = raw.get("duration_days")
    if first:
        out["first_due"] = first.isoformat()
    if stop and days not in (None, ""):
        raise TaskError("Give either a stop date or a number of days, not both.")
    if stop:
        out["stop_at"] = stop.isoformat()
    if days not in (None, ""):
        if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 365:
            raise TaskError("Days must be a whole number from 1 to 365.")
        out["duration_days"] = days
    if first and stop and stop <= first:
        raise TaskError("The stop time must be after the first dose.")
    if raw.get("first_dose_now"):
        out["first_dose_now"] = True
    gap = raw.get("min_interval_hours")
    if gap not in (None, ""):
        try:
            gap = float(gap)
        except (TypeError, ValueError):
            raise TaskError("The minimum hours between PRN doses must be a number.")
        if not 0.5 <= gap <= 72:
            raise TaskError("The minimum hours between PRN doses must be from 0.5 to 72.")
        out["min_interval_hours"] = gap
    return out


def schedule_missing(order):
    """What must still be filled in before this order can be signed (empty list = fine)."""
    mode = order.orderable.task_mode
    sched = order.schedule or {}
    if mode == "none":
        return []
    if mode == "optional" and not sched.get("frequency"):
        return []
    missing = []
    if not sched.get("frequency"):
        missing.append("the frequency")
    if order.orderable_category == "medication":
        if not sched.get("dose"):
            missing.append("the dose")
        if not sched.get("route"):
            missing.append("the route")
    if sched.get("frequency") == "prn" and not sched.get("prn_reason"):
        missing.append("the reason it may be given (PRN)")
    return missing


def makes_tasks(order):
    sched = order.schedule or {}
    return bool(sched.get("frequency")) and sched["frequency"] != "prn"


# ---------------------------------------------------------------- laying out the due times

def _base_time(order):
    sched = order.schedule or {}
    explicit = _parse_when(sched.get("first_due"), "first dose") if sched.get("first_due") else None
    return explicit or order.cosigned_at or order.signed_at or order.created_at


def _stop_time(order, base):
    sched = order.schedule or {}
    if sched.get("stop_at"):
        return _parse_when(sched["stop_at"], "stop")
    if sched.get("duration_days"):
        return base + timedelta(days=int(sched["duration_days"]))
    return None


def occurrences(order, upto, cfg=None):
    """Every due time of this order up to `upto` (inclusive), oldest first."""
    sched = order.schedule or {}
    freq = sched.get("frequency")
    if not freq or freq not in FREQUENCIES or freq == "prn":
        return []
    cfg = cfg or settings_for(order.organization)
    _label, kind, data = FREQUENCIES[freq]
    base = _base_time(order)
    stop = _stop_time(order, base)
    limit = min(upto, stop - timedelta(seconds=1)) if stop else upto
    out = []
    if kind == "once":
        if base <= limit:
            out.append(base)
        return out
    if kind == "interval":
        step = timedelta(hours=data)
        when = base
        while when <= limit and len(out) < MAX_DAYS * 24:
            out.append(when)
            when += step
        return out
    # clock times, in the clinic's local day
    if sched.get("first_dose_now"):
        out.append(base)
    times = [time(int(t[:2]), int(t[3:])) for t in cfg["pass_times"].get(freq, data)]
    tz = timezone.get_current_timezone()
    day = timezone.localtime(base, tz).date()
    last_day = timezone.localtime(limit, tz).date() if limit >= base else day
    guard = 0
    while day <= last_day and guard < MAX_DAYS:
        for t in times:
            when = timezone.make_aware(datetime.combine(day, t), tz)
            if when >= base and when <= limit and when not in out:
                if sched.get("first_dose_now") and when == base:
                    continue
                out.append(when)
        day += timedelta(days=1)
        guard += 1
    return sorted(out)


def _log(task, event_type, user=None, detail=None):
    return OrderTaskEvent.objects.create(task=task, event_type=event_type, user=user if getattr(user, "pk", None) else None, detail=detail or {})


def generate_tasks(order, now=None, cfg=None):
    """Create the tasks this order is due to have by now + the look-ahead. Safe to call again."""
    now = now or timezone.now()
    if order.status not in ("active", "in_progress") or not makes_tasks(order):
        return 0
    cfg = cfg or settings_for(order.organization)
    horizon = now + timedelta(hours=cfg["look_ahead_hours"])
    sched = order.schedule
    rows = [
        OrderTask(
            organization_id=order.organization_id,
            order=order,
            patient_id=order.patient_id,
            task_type=order.orderable_category,
            title=order.orderable_name,
            dose=sched.get("dose", ""),
            route=sched.get("route", ""),
            instructions=sched.get("instructions", ""),
            frequency=sched["frequency"],
            due_at=when,
        )
        for when in occurrences(order, horizon, cfg)
    ]
    before = OrderTask.objects.filter(order=order).count()
    if rows:
        OrderTask.objects.bulk_create(rows, ignore_conflicts=True)
    made = OrderTask.objects.filter(order=order).count() - before
    Order.objects.filter(pk=order.pk).update(tasks_generated_until=horizon)
    order.tasks_generated_until = horizon
    if made:
        new = OrderTask.objects.filter(order=order).order_by("-id")[:made]
        OrderTaskEvent.objects.bulk_create([OrderTaskEvent(task=t, event_type="created") for t in new])
    return made


def ensure_tasks(org=None, patient_id=None, now=None):
    """Top up the tasks of every active scheduled order in scope (called when a worklist is opened)."""
    now = now or timezone.now()
    qs = Order.objects.filter(status__in=("active", "in_progress")).exclude(schedule={}).select_related("organization")
    if org is not None:
        qs = qs.filter(organization=org)
    if patient_id:
        qs = qs.filter(patient_id=patient_id)
    cfgs, made = {}, 0
    for order in qs:
        if not makes_tasks(order):
            continue
        cfg = cfgs.setdefault(order.organization_id, settings_for(order.organization))
        horizon = now + timedelta(hours=cfg["look_ahead_hours"])
        done_until = order.tasks_generated_until
        if done_until is not None:
            stop = _stop_time(order, _base_time(order))
            if stop and done_until >= stop:
                continue
            if done_until - now >= timedelta(hours=cfg["look_ahead_hours"]) / 2:
                continue
        made += generate_tasks(order, now, cfg)
    return made


def cancel_future_tasks(order, user, reason, now=None):
    """The order stopped: tasks not yet due are cancelled; doses already due stay to be documented."""
    now = now or timezone.now()
    tasks = list(OrderTask.objects.filter(order=order, status="pending", due_at__gt=now))
    if not tasks:
        return 0
    OrderTask.objects.filter(pk__in=[t.pk for t in tasks]).update(status="cancelled", reason=str(reason)[:300], updated_at=now)
    OrderTaskEvent.objects.bulk_create(
        [OrderTaskEvent(task=t, event_type="cancelled", user=user if getattr(user, "pk", None) else None, detail={"reason": str(reason)[:300]}) for t in tasks]
    )
    return len(tasks)


def mark_missed(org=None, now=None):
    """Tasks nobody documented for a long time become 'missed' (still open to late documentation)."""
    now = now or timezone.now()
    if org is not None:
        org_ids = [org.pk]
    else:
        org_ids = list(OrderTask.objects.filter(status="pending").values_list("organization_id", flat=True).distinct())
    total = 0
    for org_id in org_ids:
        cfg = settings_for(Organization.objects.filter(pk=org_id).first() if org_id else None)
        cutoff = now - timedelta(hours=cfg["missed_after_hours"])
        stale = list(OrderTask.objects.filter(organization_id=org_id, status="pending", due_at__lt=cutoff))
        if not stale:
            continue
        OrderTask.objects.filter(pk__in=[t.pk for t in stale]).update(status="missed", updated_at=now)
        OrderTaskEvent.objects.bulk_create([OrderTaskEvent(task=t, event_type="missed") for t in stale])
        total += len(stale)
    return total


# ---------------------------------------------------------------- what a nurse does

def is_overdue(task, now, grace_minutes):
    return task.status == "pending" and task.due_at < now - timedelta(minutes=grace_minutes)


def allowed_actions(user, task):
    if getattr(user, "role", None) not in PERFORM_ROLES:
        return []
    if task.status in ("pending", "missed"):
        return ["complete", "hold", "refuse", "note"]
    return ["note"]


@transaction.atomic
def apply_action(task, user, action, data=None, now=None):
    data = data or {}
    now = now or timezone.now()
    if getattr(user, "role", None) not in PERFORM_ROLES:
        raise TaskError("Only a nurse or physician can document a task.", 403)
    if user.role != "system_admin" and task.organization_id != user.organization_id:
        raise TaskError("Task not found.", 404)
    task = OrderTask.objects.select_for_update().get(pk=task.pk)
    note = str(data.get("note") or "").strip()[:1000]
    reason = str(data.get("reason") or "").strip()[:300]

    if action == "note":
        if not note:
            raise TaskError("Type the note first.")
        _log(task, "note", user, {"note": note})
        return task
    if action not in ("complete", "hold", "refuse"):
        raise TaskError("Unknown action.")
    if task.status not in ("pending", "missed"):
        raise TaskError(f"A {task.get_status_display().lower()} task can't take that step.", 409)

    cfg = settings_for(task.organization)
    when = _parse_when(data.get("performed_at"), "The time it was done") if data.get("performed_at") else now
    if when > now + timedelta(minutes=5):
        raise TaskError("That time is in the future.")
    late = abs(when - task.due_at) > timedelta(minutes=cfg["grace_minutes"])

    if action == "complete":
        if late and not note:
            raise TaskError("This was done outside its time window. Say why in the note.")
        detail = {}
        for key in ("dose_given", "route_given", "site"):
            value = str(data.get(key) or "").strip()[:120]
            if value:
                detail[key] = value
        task.status = "done"
        task.detail = {**(task.detail or {}), **detail}
        event = "done"
    elif action == "hold":
        if not reason:
            raise TaskError("Say why it was held.")
        task.status = "held"
        event = "held"
    else:
        task.status = "refused"
        reason = reason or "Patient refused"
        event = "refused"
    task.performed_by = user
    task.performed_at = when
    task.reason = reason
    task.note = note
    task.save()
    _log(task, event, user, {"reason": reason, "note": note, "late": late, **(task.detail if action == "complete" else {})})
    return task


@transaction.atomic
def give_prn(order, user, data=None, now=None):
    """Record an as-needed dose (creates an already-done task)."""
    data = data or {}
    now = now or timezone.now()
    if getattr(user, "role", None) not in PERFORM_ROLES:
        raise TaskError("Only a nurse or physician can document a task.", 403)
    order = Order.objects.select_for_update().get(pk=order.pk)
    if user.role != "system_admin" and order.organization_id != user.organization_id:
        raise TaskError("Order not found.", 404)
    sched = order.schedule or {}
    if order.status not in ("active", "in_progress") or sched.get("frequency") != "prn":
        raise TaskError("This is not an active as-needed order.", 409)
    reason = str(data.get("reason") or "").strip()[:300]
    if not reason:
        raise TaskError("Say why it was given.")
    when = _parse_when(data.get("performed_at"), "The time it was given") if data.get("performed_at") else now
    if when > now + timedelta(minutes=5):
        raise TaskError("That time is in the future.")
    stop = _stop_time(order, _base_time(order))
    if stop and when > stop:
        raise TaskError("This order has ended.", 409)
    gap = sched.get("min_interval_hours")
    override = str(data.get("override_reason") or "").strip()[:300]
    if gap:
        last = OrderTask.objects.filter(order=order, is_prn=True, status="done").order_by("-performed_at").first()
        if last and last.performed_at and when - last.performed_at < timedelta(hours=float(gap)) and not override:
            raise TaskError(
                f"The last dose was given {timezone.localtime(last.performed_at):%H:%M}. At least {gap:g} hours are needed between doses. Give a reason to give it anyway.",
                409,
            )
    detail = {}
    for key in ("dose_given", "route_given", "site"):
        value = str(data.get(key) or "").strip()[:120]
        if value:
            detail[key] = value
    task = OrderTask.objects.create(
        organization_id=order.organization_id, order=order, patient_id=order.patient_id, task_type=order.orderable_category,
        title=order.orderable_name, dose=sched.get("dose", ""), route=sched.get("route", ""), instructions=sched.get("instructions", ""),
        frequency="prn", due_at=when, is_prn=True, status="done", performed_by=user, performed_at=when,
        reason=reason, note=str(data.get("note") or "").strip()[:1000], detail=detail,
    )
    _log(task, "done", user, {"prn": True, "reason": reason, **({"min_interval_override": override} if override else {})})
    return task
