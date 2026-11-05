"""Case rules: status moves, time stamps, change history, overlap checks and the row/planner payloads."""
import json
from datetime import datetime, time, timedelta

from django.db import transaction
from django.utils import timezone

from appointments.locations import occupied_beds
from appointments.models import Bed, Room, Unit

from .models import (
    CLOSED_STATUSES,
    STATUS_CHOICES,
    STATUS_FLOW,
    STATUS_LABELS,
    STATUS_STAMPS,
    TIME_FIELDS,
    CHARGE_POLICY_TYPE_LABELS,
    DOCUMENT_CATEGORY_LABELS,
    PARTICIPANT_ROLE_LABELS,
    USAGE_CATEGORY_LABELS,
    CaseCharge,
    CaseHistory,
    ChargePolicy,
    ChargePrice,
    SurgeryCase,
)

TRACKED_FIELDS = [
    "facility_id", "patient_id", "visit_id", "room_id", "bed_id", "scheduled_start", "duration_minutes", "surgeon_id",
    "service", "case_type", "anesthesia_type", "comments", "cancel_reason",
    "planned_start", "scheduled_delay_reason", "planned_delay_reason", "requires_review", "review_reason",
    "physical_status", "block_id", "booking_comments_2", "procedure_notes", "provider_notes", "time_reasons",
] + TIME_FIELDS


def age_text(dob, today=None):
    """Age the way the Case List shows it: "59y", "2y 5m" for little ones, "9m 3w" for babies, "3w 2d" for newborns."""
    today = today or timezone.localdate()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    months = (today.year - dob.year) * 12 + today.month - dob.month - (1 if today.day < dob.day else 0)
    if years >= 5:
        return f"{years}y"
    if years >= 1:
        return f"{years}y {months - years * 12}m" if months - years * 12 else f"{years}y"
    if months >= 1:
        anchor_year, anchor_month = divmod(dob.year * 12 + dob.month - 1 + months, 12)
        try:
            anchor = dob.replace(year=anchor_year, month=anchor_month + 1)
        except ValueError:  # e.g. Jan 31 + 1 month
            anchor = dob.replace(year=anchor_year, month=anchor_month + 1, day=28)
        return f"{months}m {max((today - anchor).days, 0) // 7}w"
    days = max((today - dob).days, 0)
    return f"{days // 7}w {days % 7}d"


class TransitionError(Exception):
    pass


def day_bounds(day):
    """[start, end) of a calendar day in the server's time zone."""
    start = timezone.make_aware(datetime.combine(day, time.min))
    end = timezone.make_aware(datetime.combine(day + timedelta(days=1), time.min))
    return start, end


def _text(value):
    if value is None:
        return ""
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True) if value else ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, datetime):
        return timezone.localtime(value).isoformat(timespec="minutes")
    return str(value)


def snapshot(case):
    return {f: _text(getattr(case, f)) for f in TRACKED_FIELDS}


def record(case, user, action, before, after):
    """Write a history entry holding every field that changed."""
    changes = {k: [before.get(k, ""), v] for k, v in after.items() if before.get(k, "") != v}
    if changes or action == "created":
        CaseHistory.objects.create(case=case, user=user, action=action, changes=changes)


def person_name(user):
    if user is None:
        return ""
    return f"{user.last_name}, {user.first_name}".strip(", ") or user.username


def local_iso(value):
    return timezone.localtime(value).isoformat(timespec="minutes") if value else None


def case_row(case, detail=False):
    """One case as the Case List, the planner and the edit form need it."""
    patient = case.patient
    visit = case.visit
    procedures = list(case.procedures.all())
    start = timezone.localtime(case.scheduled_start)
    return {
        "id": case.pk,
        "case_number": case.case_number,
        "facility": case.facility_id,
        "date": start.date().isoformat(),
        "time": start.strftime("%H:%M"),
        "scheduled_start": local_iso(case.scheduled_start),
        "scheduled_end": local_iso(case.scheduled_end),
        "duration_minutes": case.duration_minutes,
        "room": {"id": case.room_id, "name": case.room.name, "unit": case.room.unit_name, "path": case.room.path}
        if case.room_id else None,
        "bed": {"id": case.bed_id, "name": case.bed.name, "room": case.bed.room.name,
                "path": f"{case.bed.room.name} \u203a {case.bed.name}"} if case.bed_id else None,
        "patient": {
            "id": patient.pk,
            "mrn": patient.mrn,
            "name": person_name(patient.user),
            "age": age_text(patient.date_of_birth) if patient.date_of_birth else "",
            "sex": patient.legal_sex,
        },
        "visit": {"id": visit.pk, "visit_number": visit.visit_number} if visit else None,
        "procedures": [
            {"id": p.pk, "name": p.name, "laterality": p.laterality, "cpt_code": p.cpt_code,
             "is_primary": p.is_primary, "display": p.display}
            for p in procedures
        ],
        "procedures_text": "; ".join(p.display for p in procedures),
        "surgeon": {"id": case.surgeon_id, "name": person_name(case.surgeon)} if case.surgeon_id else None,
        "service": case.service,
        "case_type": case.case_type,
        "case_type_label": case.get_case_type_display(),
        "status": case.status,
        "status_label": STATUS_LABELS[case.status],
        "next_statuses": list(STATUS_FLOW[case.status]),
        "anesthesia_type": case.anesthesia_type,
        "comments": case.comments,
        "cancel_reason": case.cancel_reason,
        "times": {f: local_iso(getattr(case, f)) for f in TIME_FIELDS},
        "time_reasons": case.time_reasons or {},
        "header": {
            "planned_start": local_iso(case.planned_start),
            "scheduled_delay_reason": case.scheduled_delay_reason,
            "planned_delay_reason": case.planned_delay_reason,
            "scheduled_delay_minutes": _delay(case.scheduled_start, case.patient_in),
            "planned_delay_minutes": _delay(case.planned_start, case.patient_in),
            "actual_start": local_iso(case.patient_in),
            "actual_end": local_iso(case.patient_out),
            "actual_minutes": _minutes_between(case.patient_in, case.patient_out)
            if case.patient_in and case.patient_out else None,
            "requires_review": case.requires_review,
            "review_reason": case.review_reason,
            "physical_status": case.physical_status,
            "block_id": case.block_id,
            "booking_comments_2": case.booking_comments_2,
            "procedure_notes": case.procedure_notes,
            "provider_notes": case.provider_notes,
            "last_status_change": last_status_change(case) if detail else None,
        },
    }


SURGICAL_UNIT_NAME = "Operating Rooms"


def surgical_unit(facility):
    """Where new operating rooms are built: the facility's first active operating-room unit, else a new
    "Operating Rooms" unit (an existing unit of that name is switched to operating-room use)."""
    unit = Unit.objects.filter(facility=facility, is_surgical=True, is_active=True).order_by("name", "id").first()
    if unit is not None:
        return unit
    unit = Unit.objects.filter(facility=facility, name__iexact=SURGICAL_UNIT_NAME).first()
    if unit is None:
        return Unit.objects.create(facility=facility, name=SURGICAL_UNIT_NAME, care_type="outpatient", is_surgical=True)
    unit.is_surgical = True
    unit.save(update_fields=["is_surgical"])
    return unit


def room_row(r):
    return {
        "id": r.pk, "facility": r.facility_id, "name": r.name, "sort_order": r.sort_order, "is_active": r.is_active,
        "location_room": r.location_room_id, "unit": r.unit_name, "path": r.path,
    }


def with_related(queryset):
    return queryset.select_related(
        "patient__user", "visit", "room__facility", "room__location_room__unit", "bed__room", "surgeon", "facility"
    ).prefetch_related("procedures")


def _minutes_between(a, b):
    return int((b - a).total_seconds() // 60)


def _delay(planned, actual):
    """Minutes the case started after the planned time (0 when on time or not started yet)."""
    if not planned or not actual:
        return 0
    return max(_minutes_between(planned, actual), 0)


def last_status_change(case):
    entry = case.history.filter(action="status").select_related("user").first()
    if entry is None:
        return None
    return {"user": person_name(entry.user), "at": local_iso(entry.created_at)}


def staff_title(user):
    return {"doctor": "MD", "nurse": "RN"}.get(getattr(user, "role", ""), "")


def participant_row(p):
    if p.user_id:
        title = staff_title(p.user)
        display = f"{person_name(p.user)} ({title})" if title else person_name(p.user)
    else:
        display = p.name
    return {
        "id": p.pk,
        "role": p.role,
        "role_label": PARTICIPANT_ROLE_LABELS[p.role],
        "user": {"id": p.user_id, "name": person_name(p.user)} if p.user_id else None,
        "name": p.name,
        "display": display,
        "time_in": local_iso(p.time_in),
        "time_out": local_iso(p.time_out),
        "comments": p.comments,
    }


def log(case, user, action, changes):
    """Write a history entry from {label: [previous, new]} (used for rows that are not case fields)."""
    CaseHistory.objects.create(case=case, user=user, action=action, changes=changes)


def overlapping(case):
    """Other live cases in the same room whose time overlaps this one (a warning, never a block:
    urgent add-ons are booked on top of a full day all the time)."""
    if not case.room_id:
        return []
    near = SurgeryCase.objects.filter(
        room_id=case.room_id,
        scheduled_start__lt=case.scheduled_end,
        scheduled_start__gt=case.scheduled_start - timedelta(days=1),
    ).exclude(pk=case.pk).exclude(status="cancelled")
    return [c for c in near if c.scheduled_end > case.scheduled_start]


def surgeon_conflicts(case):
    """The surgeon's other live cases and clinic appointments that overlap this case (a warning, never a block)."""
    if not case.surgeon_id:
        return [], []
    window = timedelta(days=1)
    cases = SurgeryCase.objects.filter(
        surgeon_id=case.surgeon_id,
        scheduled_start__lt=case.scheduled_end,
        scheduled_start__gt=case.scheduled_start - window,
    ).exclude(pk=case.pk).exclude(status="cancelled")
    cases = [c for c in cases if c.scheduled_end > case.scheduled_start]
    from appointments.models import Appointment

    appts = Appointment.all_objects.filter(  # tenant-scoped manager is empty outside a web request
        organization_id=case.organization_id,
        provider_id=case.surgeon_id,
        status__in=["scheduled", "pending", "in_progress"],
        appointment_datetime__lt=case.scheduled_end,
        appointment_datetime__gt=case.scheduled_start - window,
    )
    appts = [
        a for a in appts
        if a.appointment_datetime + timedelta(minutes=a.duration_minutes or 0) > case.scheduled_start
    ]
    return cases, appts


def overlap_warnings(case):
    same_room = overlapping(case)
    warnings = [f"Overlaps case {c.case_number} in {case.room.name}" for c in same_room]
    cases, appts = surgeon_conflicts(case)
    cases = [c for c in cases if c not in same_room]  # already warned about
    who = person_name(case.surgeon)
    warnings += [f"{who} is also booked on case {c.case_number} at {local_iso(c.scheduled_start)[11:16]}" for c in cases]
    warnings += [
        f"{who} has a clinic appointment at {local_iso(a.appointment_datetime)[11:16]} ({a.title})" for a in appts
    ]
    return warnings


def create_booking_visit(case, user):
    """Open the patient's visit in Registration for this case and link it (scheduled, ambulatory)."""
    from users.models import Registration

    names = ", ".join(p.name for p in case.procedures.all()[:3])
    visit = Registration.objects.create(
        patient=case.patient,
        organization=case.organization,
        facility=case.facility,
        admission_type="scheduled",
        care_setting="ambulatory",
        reason_for_visit=names or "Surgery",
        scheduled_procedure=names[:255],
        service=case.service or "",
        attending_provider=case.surgeon,
        registered_by=user,
        arrival_time=None,
    )
    case.visit = visit
    case.save(update_fields=["visit"])
    return visit


def bay_beds(facility_ids):
    """Beds a patient can wait or recover in: active beds in operating-room units, outside the ORs themselves."""
    return Bed.objects.filter(
        room__unit__facility_id__in=facility_ids, room__unit__is_surgical=True, room__unit__is_active=True,
        room__is_active=True, is_active=True, room__surgery_room__isnull=True,
    ).select_related("room__unit__facility")


def bay_problem(case, bed):
    """Why this bed cannot be used for the case right now, or "" when it can."""
    if not bay_beds([case.facility_id]).filter(pk=bed.pk).exists():
        return "That bed is not a PreOp/PACU bed at this facility."
    if bed.hold:
        return f"Bed {bed.name} is {bed.get_hold_display().lower()}."
    taken = occupied_beds(case.organization, exclude_registration=case.visit_id)
    if bed.pk in taken:
        who = taken[bed.pk].patient.user
        return f"Bed {bed.name} is already occupied by {who.last_name}, {who.first_name}."
    other = SurgeryCase.objects.filter(bed=bed).exclude(pk=case.pk).exclude(status__in=CLOSED_STATUSES).first()
    if other is not None:
        return f"Bed {bed.name} is already assigned to case {other.case_number}."
    return ""


def _set_place(visit, unit=None, room=None, bed=None):
    """Put the visit in a place, keeping its care setting (surgery moves a patient, it does not change the kind of visit)."""
    from users.models import Registration

    care = visit.care_setting
    visit.unit, visit.room, visit.bed = unit, room, bed
    visit.facility = None if (unit or room or bed) else visit.facility  # filled from the place in save()
    visit.save()
    if visit.care_setting != care:
        Registration.objects.filter(pk=visit.pk).update(care_setting=care)
        visit.care_setting = care


def _restore_place(case, visit):
    """Back to where the patient was before surgery when that place is still usable, else out of the surgical unit."""
    prev = case.previous_place or {}
    bed = Bed.objects.filter(pk=prev.get("bed")).select_related("room__unit").first() if prev.get("bed") else None
    if bed is not None and bed.is_active and not bed.hold and bed.pk not in occupied_beds(case.organization, exclude_registration=visit.pk):
        return _set_place(visit, bed.room.unit, bed.room, bed)
    room = Room.objects.filter(pk=prev.get("room")).select_related("unit").first() if prev.get("room") else None
    if room is not None and room.is_active:
        return _set_place(visit, room.unit, room, None)
    unit = Unit.objects.filter(pk=prev.get("unit")).first() if prev.get("unit") else None
    if unit is not None and unit.is_active:
        return _set_place(visit, unit, None, None)
    _set_place(visit)


def _admit_as_inpatient(visit):
    """A surgery patient moved to an inpatient bed is admitted: Acute Care, and out of any outpatient unit
    until a bed is chosen (day-surgery patients stay Ambulatory; only an admission changes that)."""
    from users.models import Registration

    if visit.unit_id and visit.unit.care_setting != "acute":
        _set_place(visit)
    fields = {"care_setting": "acute"}
    if visit.admission_type in ("", "scheduled"):
        fields["admission_type"] = "direct"
    Registration.objects.filter(pk=visit.pk).update(**fields)
    for name, value in fields.items():
        setattr(visit, name, value)


def place_visit(case):
    """
    Move the linked visit to where the case says the patient is, so the census follows:
    PreOp and PACU put the patient in the chosen bed (or the operating-room unit when none is chosen yet),
    In OR puts them in the operating room, and a closed case puts them back where they were.
    """
    visit = case.visit
    if visit is None or visit.discharge_datetime is not None:
        return
    inside = bool(visit.unit_id and visit.unit.is_surgical)
    if case.status in CLOSED_STATUSES:
        if case.previous_place or inside:
            _restore_place(case, visit)
        case.previous_place = {}
        if case.status == "transferred":
            _admit_as_inpatient(visit)
        return
    if not inside and not case.previous_place:
        case.previous_place = {"unit": visit.unit_id, "room": visit.room_id, "bed": visit.bed_id}
    if case.status == "or":
        loc = case.room.location_room if case.room_id and case.room.location_room_id else None
        if loc is not None:
            return _set_place(visit, loc.unit, loc, None)
        return _set_place(visit, surgical_unit(case.facility))
    if case.bed_id:
        return _set_place(visit, case.bed.room.unit, case.bed.room, case.bed)
    _set_place(visit, surgical_unit(case.facility))



def transition(case, new_status, user, reason="", bed=None):
    """Move a case along the status flow, stamping the matching times. Raises TransitionError."""
    if new_status not in STATUS_LABELS:
        raise TransitionError(f"Unknown status '{new_status}'.")
    with transaction.atomic():
        case = SurgeryCase.objects.select_for_update().get(pk=case.pk)
        allowed = STATUS_FLOW[case.status]
        if new_status not in allowed:
            here = STATUS_LABELS[case.status]
            if allowed:
                opts = ", ".join(STATUS_LABELS[s] for s in allowed)
                raise TransitionError(f"A case that is {here} can only move to: {opts}.")
            raise TransitionError(f"A case that is {here} is closed and cannot change status.")
        if new_status == "cancelled" and not reason.strip():
            raise TransitionError("A reason is required to cancel a case.")
        if bed is not None and new_status not in ("preop", "pacu"):
            raise TransitionError("A bay can only be chosen when the patient goes to PreOp or PACU.")
        if bed is not None:
            problem = bay_problem(case, bed)
            if problem:
                raise TransitionError(problem)
        before = snapshot(case)
        now = timezone.now()
        for field in STATUS_STAMPS.get(new_status, []):
            if getattr(case, field) is None:
                setattr(case, field, now)
        if new_status == "cancelled":
            case.cancel_reason = reason.strip()[:200]
        old_status = case.status
        case.status = new_status
        # the bay follows the stage: chosen for PreOp/PACU, released for the OR and when the case closes
        case.bed = bed if new_status in ("preop", "pacu") else None
        place_visit(case)
        case.save()
        after = snapshot(case)
        after["status"] = new_status
        before["status"] = old_status
        record(case, user, "status", before, after)
    return case


def status_counts(queryset):
    """[{status, label, count}] for the legend, every status listed even at zero."""
    counts = {s: 0 for s, _ in STATUS_CHOICES}
    for row in queryset.values_list("status", flat=True):
        counts[row] += 1
    return [{"status": s, "label": label, "count": counts[s]} for s, label in STATUS_CHOICES]


def planner_bar(case, overlap_ids):
    label = f"{case.case_number} / {case.patient.mrn} / {case.get_case_type_display()} / {STATUS_LABELS[case.status]}"
    return {
        "id": case.pk,
        "case_number": case.case_number,
        "mrn": case.patient.mrn,
        "scheduled_start": local_iso(case.scheduled_start),
        "scheduled_end": local_iso(case.scheduled_end),
        "status": case.status,
        "status_label": STATUS_LABELS[case.status],
        "case_type": case.case_type,
        "label": label,
        "overlap": case.pk in overlap_ids,
    }


def build_planner(cases, rooms, day):
    """The Day Planner: one row per room with that day's cases as bars, plus the legend counts."""
    cases = list(cases)
    live = [c for c in cases if c.status != "cancelled" and c.room_id]
    overlap_ids = set()
    for i, a in enumerate(live):
        for b in live[i + 1:]:
            if a.room_id == b.room_id and a.scheduled_start < b.scheduled_end and b.scheduled_start < a.scheduled_end:
                overlap_ids.update((a.pk, b.pk))
    by_room = {}
    unassigned = []
    for c in cases:
        bar = planner_bar(c, overlap_ids)
        if c.room_id:
            by_room.setdefault(c.room_id, []).append(bar)
        else:
            unassigned.append(bar)
    # the visible hours: 7 am to 7 pm, stretched to fit early or late cases
    day_start, day_end = 7, 19
    for c in cases:
        s = timezone.localtime(c.scheduled_start)
        e = timezone.localtime(c.scheduled_end)
        day_start = min(day_start, s.hour)
        if e.date() > s.date():
            day_end = 24
        else:
            day_end = max(day_end, e.hour + (1 if e.minute else 0))
    return {
        "date": day.isoformat(),
        "day_start": day_start,
        "day_end": min(day_end, 24),
        "rooms": [{"id": r.pk, "name": r.name, "cases": by_room.get(r.pk, [])} for r in rooms],
        "unassigned": unassigned,
        "legend": status_counts_from_list(cases),
    }


def status_counts_from_list(cases):
    counts = {s: 0 for s, _ in STATUS_CHOICES}
    for c in cases:
        counts[c.status] += 1
    return [{"status": s, "label": label, "count": counts[s]} for s, label in STATUS_CHOICES]


def usage_row(u):
    return {
        "id": u.pk, "category": u.category, "category_label": USAGE_CATEGORY_LABELS.get(u.category, u.category),
        "name": u.name, "catalog_number": u.catalog_number, "total": u.total, "hold": u.hold, "wasted": u.wasted,
        "used": u.used, "notes": u.notes, "charge_code": u.charge_code, "department": u.department,
    }


def card_row(card, detail=False):
    row = {
        "id": card.pk, "name": card.name, "procedure_name": card.procedure_name, "is_active": card.is_active,
        "surgeon": {"id": card.surgeon_id, "name": person_name(card.surgeon)} if card.surgeon_id else None,
        "item_count": card.items.count() if detail is False else None,
    }
    if detail:
        row.update({
            "pre_op_notes": card.pre_op_notes, "post_op_notes": card.post_op_notes,
            "items": [{"id": i.pk, "category": i.category, "name": i.name, "catalog_number": i.catalog_number,
                       "quantity": i.quantity, "charge_code": i.charge_code, "department": i.department}
                      for i in card.items.all()],
        })
        row.pop("item_count")
    return row


def case_card_row(link):
    return {"id": link.pk, "card": link.card_id, "name": link.card.name, "procedure_name": link.card.procedure_name,
            "is_primary": link.is_primary, "merge_status": "Primary" if link.is_primary else "Merged"}


def charge_row(c):
    total = c.item_charge * c.quantity if c.item_charge is not None else None
    return {
        "id": c.pk, "charge_code": c.charge_code, "description": c.description, "policy": c.policy_name,
        "policy_type": c.policy_type, "policy_type_label": CHARGE_POLICY_TYPE_LABELS.get(c.policy_type, "Manual"),
        "quantity": c.quantity, "item_charge": str(c.item_charge) if c.item_charge is not None else None,
        "total_charge": str(total) if total is not None else None, "status": c.status,
        "status_label": c.get_status_display(), "date": c.charge_date.isoformat(), "is_auto": c.is_auto,
    }


def charge_status(charges):
    """The case's overall charge status: Pending Post while anything is waiting, Posted once all are out."""
    charges = list(charges)
    if not charges:
        return "No charges"
    return "Pending Post" if any(c.status == "pending" for c in charges) else "Posted"


def policy_minutes(case, policy):
    """Minutes a time-based policy bills: OR time (patient in to out) or anesthesia time (anesthesiologists in to out)."""
    start, end = case.patient_in, case.patient_out
    if policy.time_basis == "anesthesia":
        rows = [p for p in case.participants.all() if p.role == "anesthesiologist" and p.time_in and p.time_out]
        if rows:
            start, end = min(p.time_in for p in rows), max(p.time_out for p in rows)
    if not start or not end or end <= start:
        return 0
    return _minutes_between(start, end)


def generate_charges(case):
    """Rebuild the case's pending automatic charges from its supplies and times. Posted charges are never touched.
    Returns (number created, warnings)."""
    import math

    warnings = []
    case.charges.filter(status="pending", is_auto=True).delete()
    day = timezone.localdate(case.patient_out or case.patient_in or case.scheduled_start)
    made = 0
    cache = {}
    price = lambda code: price_for(case.organization_id, code, cache)
    for u in case.usage.all():
        qty = u.used
        if not qty:
            continue
        if not u.charge_code:
            continue
        CaseCharge.objects.create(case=case, charge_code=u.charge_code, description=u.name, policy_name="Usage Charges",
                                  policy_type="usage", quantity=qty, charge_date=day,
                                  item_charge=price(u.charge_code))
        made += 1
    for policy in ChargePolicy.objects.filter(organization_id=case.organization_id, is_active=True):
        minutes = policy_minutes(case, policy)
        if not minutes:
            warnings.append(f"{policy.name}: no times recorded, so no time charge was made.")
            continue
        CaseCharge.objects.create(case=case, charge_code=policy.first_code, description=policy.description,
                                  policy_name=policy.name, policy_type=policy.policy_type, quantity=1, charge_date=day,
                                  item_charge=price(policy.first_code))
        made += 1
        extra = math.ceil(max(minutes - policy.first_minutes, 0) / policy.extra_minutes)
        if extra and policy.extra_code:
            CaseCharge.objects.create(case=case, charge_code=policy.extra_code, description=policy.description,
                                      policy_name=policy.name, policy_type=policy.policy_type, quantity=extra, charge_date=day,
                                      item_charge=price(policy.extra_code))
            made += 1
    return made, warnings


def policy_row(p):
    return {"id": p.pk, "name": p.name, "policy_type": p.policy_type, "time_basis": p.time_basis,
            "first_code": p.first_code, "first_minutes": p.first_minutes, "extra_code": p.extra_code,
            "extra_minutes": p.extra_minutes, "description": p.description, "is_active": p.is_active}


def code_key(code):
    """"OOR11665 - PROTECTOR, DONUT" and "oor11665" are the same price-list code."""
    return (code or "").split(" - ")[0].strip().upper()


def price_for(org_id, code, cache=None):
    key = code_key(code)
    if cache is not None and key in cache:
        return cache[key]
    row = ChargePrice.objects.filter(organization_id=org_id, charge_code=key).first()
    value = row.unit_price if row else None
    if cache is not None:
        cache[key] = value
    return value


def price_row(p):
    return {"id": p.pk, "charge_code": p.charge_code, "description": p.description, "unit_price": str(p.unit_price)}


def document_row(d, user=None):
    return {
        "id": d.pk, "title": d.title, "category": d.category,
        "category_label": DOCUMENT_CATEGORY_LABELS.get(d.category, d.category),
        "filename": d.original_name, "content_type": d.content_type, "size": d.size,
        "uploaded_by": person_name(d.uploaded_by), "uploaded_at": local_iso(d.created_at),
        "can_delete": bool(user and (user.role in ("admin", "system_admin") or d.uploaded_by_id == user.pk)),
    }
