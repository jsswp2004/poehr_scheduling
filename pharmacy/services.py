"""
POWER Pharmacy, Phase 1: pharmacist verification of medication orders.

    pending_verification --verify / verify with change--> verified
    pending_verification --clarify--> on_hold_clarify --verify--> verified
    pending_verification / on_hold_clarify --reject--> rejected

* A new medication order starts as pending_verification (Order.save). For an organization that has the
  POWER Pharmacy module switched on, the nurse's administration tasks are only laid out once it is verified
  (order_tasks.awaiting_pharmacy); every other organization works exactly as before.
* Clinical decision support (Phase 1, built in): allergy matches (appointments.allergies, which knows drug
  classes such as penicillins for piperacillin or amoxicillin) and a renal flag when the Cockcroft-Gault
  creatinine clearance is below 30 mL/min. A high-severity alert has to be acknowledged, with a reason,
  before the order can be verified.
* A renally cleared drug (renal_drugs.py) ordered for a patient whose CrCl is below that drug's threshold
  raises a HIGH-severity renal alert; any other medication gets a moderate warning below 30 mL/min.
* Verify with change, clarify and reject send a message to the ordering prescriber's POWER inbox.
  Reject also cancels the order (status "cancelled"): it is never given.

Pharmacists (RA 10918) and administrators verify; pharmacy assistants (pharmacy_tech) only read.
Medication names follow the Generics Act (RA 6675 / RA 9502): generic first, brand in parentheses.
"""

import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from appointments import allergies
from appointments import order_tasks
from appointments.models import Order, OrderEvent

from .dangerous_drugs import is_dangerous_drug
from .models import PharmacyIntervention
from .renal_drugs import renal_threshold

log = logging.getLogger(__name__)

READ_ROLES = ("pharmacist", "pharmacy_tech", "admin", "system_admin")  # the pharmacy roles (outpatient fills, prices)


def can_view_pharmacy(user):
    """
    The 'pharmacy.view' right (Security Settings): on by default for the pharmacy roles and administrators; granted per
    person to anyone else (a doctor, say), who then reads the Verification Queue, Med Profile and Formulary only.
    """
    from users.rights import user_has_right

    return bool(user and user.is_authenticated and user_has_right(user, "pharmacy.view"))
VERIFY_ROLES = ("pharmacist", "admin", "system_admin")
ACTIVE_ORDER_STATUSES = ("pending_cosign", "active", "in_progress")
QUEUE_STATUSES = ("pending_verification", "on_hold_clarify")
ACTIONS = ("verify", "modify", "clarify", "reject")
STATUS_LABELS = dict(Order.PHARMACY_STATUS_CHOICES)
PRIORITY_RANK = {"stat": 0, "urgent": 1, "routine": 2}
# Minutes from signing within which a pharmacist should have verified the order. A clinic can change them with
# the Django setting PHARMACY_VERIFY_GOAL_MINUTES, e.g. {"stat": 10}; priorities it leaves out keep these.
VERIFY_GOAL_MINUTES = {"stat": 15, "urgent": 30, "routine": 60}
RENAL_CRCL_THRESHOLD = 30
SCR_UMOL_PER_MG_DL = Decimal("88.4")
MODIFIABLE = ("dose", "frequency", "route", "instructions")


class PharmacyError(Exception):
    def __init__(self, message, status_code=400, extra=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.extra = extra or {}


def name_of(user):
    return (f"{user.last_name}, {user.first_name}".strip(", ") or user.username) if user else ""


# --------------------------------------------------------------------------- drug names

def drug_names(name, orderable=None):
    """{"generic", "brand", "display"}: generic name first, the brand (when known) in parentheses."""
    name = (name or "").strip()
    generic = (getattr(orderable, "generic_name", "") or "").strip()
    brand = (getattr(orderable, "brand_name", "") or "").strip()
    if not generic:
        # A brand-name entry from the allergy module's list ("Augmentin 625 mg") reads as its generic.
        norm = allergies._norm(name)
        for b, ingredients in allergies._BRANDS.items():
            if allergies._phrase_in(b, norm):
                generic = " + ".join(i.title() for i in ingredients)
                brand = brand or b.title()
                break
    generic = generic or name
    display = f"{generic} ({brand})" if brand and brand.lower() not in generic.lower() else generic
    return {"generic": generic, "brand": brand, "display": display}


# --------------------------------------------------------------------------- patient data

def age_years(dob, today=None):
    if not dob:
        return None
    today = today or date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _decimal(value):
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None


def scr_mg_dl(value, units=""):
    """Serum creatinine in mg/dL. Philippine labs often report µmol/L; those are converted (÷ 88.4)."""
    number = _decimal(value)
    if number is None or number <= 0:
        return None
    u = (units or "").lower().replace("μ", "u").replace("µ", "u")
    if "umol" in u or "mmol" in u or (not u and number > 20):
        number = number / SCR_UMOL_PER_MG_DL
    return number


def cockcroft_gault(age, weight_kg, scr, female):
    """CrCl (mL/min) = (140 − age) × weight / (72 × SCr), × 0.85 for women. Actual body weight. Adults only."""
    if age is None or age < 18 or not weight_kg or not scr:
        return None
    crcl = (Decimal(140 - age) * Decimal(str(weight_kg))) / (Decimal(72) * Decimal(scr))
    if female:
        crcl *= Decimal("0.85")
    return round(float(crcl), 1)


def renal_info(patient):
    """Weight, latest serum creatinine and the Cockcroft-Gault CrCl. Anything not on the chart is None."""
    from appointments import fishbone
    from appointments.intake_output_views import weight_kg

    profile = getattr(patient, "patient_profile", None)
    age = age_years(getattr(profile, "date_of_birth", None))
    sex = getattr(profile, "legal_sex", "") or ""
    try:
        weight = weight_kg(patient)
    except Exception:  # noqa: BLE001 - a chart without vitals must not break the list
        log.exception("weight lookup failed for patient %s", patient.pk)
        weight = None
    slot = fishbone.latest_values(patient).get("cr") or {}
    item = slot.get("latest")
    scr = scr_mg_dl(item.value, item.units) if item is not None else None
    crcl = cockcroft_gault(age, weight, scr, sex == "F") if sex in ("M", "F") else None
    note = ""
    if crcl is None:
        # say exactly why, never leave it blank: "CrCl not calculated — missing weight, serum creatinine"
        missing = [label for label, ok in (("age", age is not None), ("weight", weight), ("serum creatinine", scr),
                                           ("sex", sex in ("M", "F"))) if not ok]
        reasons = ["missing " + ", ".join(missing)] if missing else []
        if age is not None and age < 18:
            reasons.append("patient under 18 (Cockcroft-Gault is for adults)")
        note = "CrCl not calculated — " + "; ".join(reasons or ["not enough data"])
    return {
        "age": age,
        "sex": sex,
        "weight_kg": weight,
        "scr": item.value if item is not None else None,
        "scr_units": item.units if item is not None else "",
        "scr_mg_dl": round(float(scr), 2) if scr is not None else None,
        "scr_at": fishbone._when(item.report).isoformat() if item is not None else None,
        "crcl": crcl,
        "crcl_method": "Cockcroft-Gault (actual body weight)",
        "crcl_note": note,
        "renal_flag": crcl is not None and crcl < RENAL_CRCL_THRESHOLD,
    }


# --------------------------------------------------------------------------- clinical decision support

def cds_alerts(order, renal=None):
    """The Phase 1 checks for one medication order. `key` is what the pharmacist acknowledges."""
    names = drug_names(order.orderable_name, order.orderable)
    text = order.orderable_name if names["generic"] in order.orderable_name else f"{names['generic']} {order.orderable_name}"
    out = []
    for a in allergies.check_order(order.patient, text, order.code_system, order.external_code):
        high = a["level"] in ("ingredient", "class") or a.get("severity") == "severe"
        out.append({
            "key": f"allergy:{a['allergy_id']}",
            "type": "allergy",
            "severity": "high" if high else "moderate",
            "title": f"Allergy: {a['substance']}",
            "message": a["message"],
            "detail": a,
        })
    renal = renal if renal is not None else renal_info(order.patient)
    drug, threshold = renal_threshold(f"{names['generic']} {order.orderable_name}", order.orderable, order.organization)
    crcl = renal.get("crcl")
    if drug and crcl is not None and crcl < threshold:
        out.append({
            "key": "renal",
            "type": "renal",
            "severity": "high",
            "title": f"Renal dosing: {drug.title()}",
            "message": f"CrCl {crcl} mL/min (Cockcroft-Gault) is below {threshold:g} mL/min for {drug}. "
                       "Adjust the dose or interval, or give the reason it stands.",
            "detail": {"crcl": crcl, "threshold": threshold, "drug": drug,
                       "scr_mg_dl": renal.get("scr_mg_dl"), "weight_kg": renal.get("weight_kg")},
        })
    elif drug and crcl is None:
        # a renally cleared drug and no CrCl: say so (never "no renal alerts") so the pharmacist checks the dose
        out.append({
            "key": "renal",
            "type": "renal",
            "severity": "moderate",
            "title": f"Renal dosing: {drug.title()}",
            "message": f"{renal.get('crcl_note') or 'CrCl not calculated'}. {drug.title()} needs a dose check when CrCl is below "
                       f"{threshold:g} mL/min: record the missing values or check the dose another way.",
            "detail": {"crcl": None, "threshold": threshold, "drug": drug,
                       "scr_mg_dl": renal.get("scr_mg_dl"), "weight_kg": renal.get("weight_kg")},
        })
    elif renal.get("renal_flag"):
        out.append({
            "key": "renal",
            "type": "renal",
            "severity": "moderate",
            "title": "Renal function",
            "message": f"CrCl {renal['crcl']} mL/min (Cockcroft-Gault) is below {RENAL_CRCL_THRESHOLD}. Review the dose and interval.",
            "detail": {"crcl": renal["crcl"], "scr_mg_dl": renal["scr_mg_dl"], "weight_kg": renal["weight_kg"]},
        })
    return out


# --------------------------------------------------------------------------- serializing

def goal_table():
    """The verification goal per priority: the defaults, overridden by PHARMACY_VERIFY_GOAL_MINUTES."""
    table = dict(VERIFY_GOAL_MINUTES)
    configured = getattr(settings, "PHARMACY_VERIFY_GOAL_MINUTES", None)
    if isinstance(configured, dict):
        for key, value in configured.items():
            try:
                if key in table and int(value) > 0:
                    table[key] = int(value)
            except (TypeError, ValueError):
                log.warning("PHARMACY_VERIFY_GOAL_MINUTES[%r] is not a number of minutes", key)
    return table


def goal_minutes(order):
    table = goal_table()
    return table.get(order.priority, table["routine"])


def waiting_since(order):
    return order.signed_at or order.created_at


def past_goal(order, now=None):
    if order.pharmacy_status not in QUEUE_STATUSES:
        return False
    now = now or timezone.now()
    return (now - waiting_since(order)).total_seconds() / 60 > goal_minutes(order)


def _needs_review(orderable):
    from .formulary import item_needs_review

    return item_needs_review(orderable)


def serialize_order(order, now=None, alerts=None):
    now = now or timezone.now()
    sched = order.schedule or {}
    names = drug_names(order.orderable_name, order.orderable)
    since = waiting_since(order)
    data = {
        "id": order.pk,
        "placer_order_number": order.placer_order_number,
        "patient": {"id": order.patient_id, "name": name_of(order.patient)},
        "drug": names,
        "dangerous_drug": is_dangerous_drug(f"{names['generic']} {order.orderable_name}", order.orderable, order.organization),
        "needs_review": _needs_review(order.orderable),
        "dose": sched.get("dose", ""),
        "route": sched.get("route", ""),
        "frequency": sched.get("frequency", ""),
        "frequency_label": order_tasks.FREQUENCY_LABELS.get(sched.get("frequency", ""), sched.get("frequency", "")),
        "instructions": sched.get("instructions", ""),
        "prn_reason": sched.get("prn_reason", ""),
        "priority": order.priority,
        "indication": order.indication,
        "status": order.status,
        "pharmacy_status": order.pharmacy_status,
        "pharmacy_status_label": STATUS_LABELS.get(order.pharmacy_status, ""),
        "pharmacy_note": order.pharmacy_note,
        "ordering_provider": {"id": order.ordering_provider_id, "name": name_of(order.ordering_provider)},
        "signed_at": order.signed_at.isoformat() if order.signed_at else None,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "waiting_minutes": int((now - since).total_seconds() // 60) if since else None,
        "goal_minutes": goal_minutes(order),
        "past_goal": past_goal(order, now),
        "verified_by": {"id": order.verified_by_id, "name": name_of(order.verified_by)} if order.verified_by_id else None,
        "verified_at": order.verified_at.isoformat() if order.verified_at else None,
    }
    if alerts is not None:
        data["alerts"] = alerts
        data["alert_counts"] = {
            "high": sum(1 for a in alerts if a["severity"] == "high"),
            "moderate": sum(1 for a in alerts if a["severity"] != "high"),
        }
    return data


def serialize_intervention(iv):
    return {
        "id": iv.pk,
        "order": iv.order_id,
        "type": iv.type,
        "type_label": iv.get_type_display(),
        "reason": iv.reason,
        "original_value": iv.original_value,
        "new_value": iv.new_value,
        "note": iv.note,
        "pharmacist": {"id": iv.pharmacist_id, "name": name_of(iv.pharmacist)},
        "created_at": iv.created_at.isoformat(),
    }


# --------------------------------------------------------------------------- the actions

def _text(value, n):
    return str(value or "").strip()[:n]


def _notify_prescriber(order, user, subject, body):
    """A message to the ordering prescriber's POWER inbox (the existing staff messages)."""
    from appointments import inbox

    if order.ordering_provider_id == user.pk:
        return None
    try:
        thread = inbox.send_message(user, [order.ordering_provider_id], subject, body, patient_id=order.patient_id)
    except inbox.InboxError as exc:
        raise PharmacyError(f"The message to the prescriber could not be sent: {exc}", 409)
    return thread.pk


def _clean_change(order, raw):
    """{field: value} the pharmacist changes on the schedule. A plain string is a new dose."""
    if isinstance(raw, str):
        raw = {"dose": raw}
    if not isinstance(raw, dict):
        raise PharmacyError("Say what changes (dose, frequency, route or instructions).")
    sched = order.schedule or {}
    change = {}
    for key in MODIFIABLE:
        if key not in raw:
            continue
        value = _text(raw[key], 300)
        if key == "frequency" and value and value not in order_tasks.FREQUENCIES:
            raise PharmacyError("Choose a frequency from the list.")
        if key in ("dose", "frequency", "route") and not value:
            raise PharmacyError(f"The {key} can't be blank.")
        if value != (sched.get(key) or ""):
            change[key] = value
    if not change:
        raise PharmacyError("Nothing changed. Use Verify if the order is right as written.")
    return change


@transaction.atomic
def act(order, user, action, data=None):
    """Verify, verify with change, ask for clarification or reject. Returns (order, intervention or None)."""
    data = data or {}
    if getattr(user, "role", None) not in VERIFY_ROLES:
        raise PharmacyError("Only a pharmacist can verify medication orders.", 403)
    if action not in ACTIONS:
        raise PharmacyError("Unknown action.")
    order = Order.objects.select_for_update().select_related("patient", "orderable", "ordering_provider").get(pk=order.pk)
    if user.role != "system_admin" and order.organization_id != user.organization_id:
        raise PharmacyError("Order not found.", 404)
    if order.orderable_category != "medication":
        raise PharmacyError("Only medication orders are verified by pharmacy.")
    if order.status not in ACTIVE_ORDER_STATUSES:
        raise PharmacyError("This order is no longer active.", 409)
    if order.pharmacy_status not in QUEUE_STATUSES:
        raise PharmacyError(f"This order is already {STATUS_LABELS.get(order.pharmacy_status, 'handled').lower()}.", 409)

    reason = _text(data.get("reason"), 300)
    note = _text(data.get("note"), 2000)
    now = timezone.now()
    from_status = order.pharmacy_status
    names = drug_names(order.orderable_name, order.orderable)
    intervention = None

    if action in ("verify", "modify"):
        alerts = cds_alerts(order)
        acknowledged = {str(k) for k in (data.get("acknowledged_alerts") or [])}
        high = [a for a in alerts if a["severity"] == "high"]
        open_high = [a for a in high if a["key"] not in acknowledged]
        if open_high or (high and not reason):
            raise PharmacyError(
                "Acknowledge each high-severity alert and give a reason before verifying.",
                409,
                {"alerts": alerts, "unacknowledged": [a["key"] for a in open_high]},
            )
        change = _clean_change(order, data.get("new_value")) if action == "modify" else {}
        if action == "modify" and not reason:
            raise PharmacyError("Give the reason for the change.")
        if change:
            sched = dict(order.schedule or {})
            original = {k: sched.get(k, "") for k in change}
            sched.update(change)
            order.schedule = sched
            intervention = PharmacyIntervention.objects.create(
                organization_id=order.organization_id, order=order, type="modify", reason=reason,
                original_value=original, new_value=change, note=note, pharmacist=user,
            )
        if high:
            PharmacyIntervention.objects.create(
                organization_id=order.organization_id, order=order, type="alert_override", reason=reason,
                original_value={"alerts": [a["key"] for a in high]}, note=note, pharmacist=user,
            )
        order.pharmacy_status = "verified"
        order.verified_by = user  # for a dangerous drug (RA 9165) this is the verifying pharmacist on record
        order.verified_at = now
        order.pharmacy_note = note
        order.save()
        detail = {"action": action, "dangerous_drug": is_dangerous_drug(f"{names['generic']} {order.orderable_name}", order.orderable, order.organization)}
        if change:
            detail["change"] = change
        if high:
            detail["acknowledged_alerts"] = [a["key"] for a in high]
            detail["override_reason"] = reason
        if change:
            # The prescriber sees what the pharmacist changed: an inbox message, plus the intervention and order event.
            labels = {"dose": "Dose", "frequency": "Frequency", "route": "Route", "instructions": "Instructions"}
            lines = "\n".join(f"{labels[k]}: {original.get(k) or '(none)'} -> {v}" for k, v in change.items())
            thread_id = _notify_prescriber(
                order, user, f"Pharmacy changed: {names['display']}",
                f"The order for {names['display']} ({order.placer_order_number}) was verified with a change under "
                f"protocol.\n\n{lines}\n\nReason: {reason}" + (f"\n\n{note}" if note else ""),
            )
            if thread_id:
                intervention.new_value = {**change, "message_thread": thread_id}
                intervention.save(update_fields=["new_value"])
                detail["message_thread"] = thread_id
        OrderEvent.objects.create(order=order, event_type="pharmacy_verified", from_status=order.status, to_status=order.status, user=user, detail=detail)
        order_tasks.generate_tasks(order)  # the nurse's administration tasks start now (no-op unless active)
        return order, intervention

    if not reason:
        raise PharmacyError("Give a reason." if action == "reject" else "Say what needs clarifying.")
    if action == "clarify":
        order.pharmacy_status = "on_hold_clarify"
        subject = f"Pharmacy clarification: {names['display']}"
        body = f"Please clarify the order for {names['display']} ({order.placer_order_number}).\n\n{reason}"
    else:
        order.pharmacy_status = "rejected"
        subject = f"Pharmacy rejected: {names['display']}"
        body = (f"The order for {names['display']} ({order.placer_order_number}) was rejected by pharmacy and has "
                f"been cancelled. It will not be given.\n\nReason: {reason}")
    if note:
        body += f"\n\n{note}"
    order.pharmacy_note = note or reason
    order_status = order.status
    if action == "reject":
        # A rejected order is cancelled: it was never verified, so it is never given.
        order.status = "cancelled"
    order.save()
    if action == "reject":
        order_tasks.cancel_future_tasks(order, user, f"Order cancelled by pharmacy: {reason}")
    thread_id = _notify_prescriber(order, user, subject, body)
    intervention = PharmacyIntervention.objects.create(
        organization_id=order.organization_id, order=order, type=action, reason=reason, note=note, pharmacist=user,
        new_value={"message_thread": thread_id} if thread_id else {},
    )
    OrderEvent.objects.create(
        order=order, event_type=f"pharmacy_{'clarification' if action == 'clarify' else 'rejected'}",
        from_status=order_status, to_status=order.status, user=user,
        detail={"reason": reason, "from_pharmacy_status": from_status, "message_thread": thread_id},
    )
    return order, intervention
