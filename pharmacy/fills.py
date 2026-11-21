"""
POWER Pharmacy, Phase 2: in-house outpatient fill.

A signed outpatient prescription whose pharmacy is the clinic's own (Pharmacy.is_in_house) arrives in the fill
queue as a fill at "received". From there:

    received --start_entry--> data_entry --enter--> filling --fill--> final_check --check--> ready --dispense--> dispensed
                                                       ^                    |
                                                       +----check_fail------+
    any open stage --hold (reason)--> on_hold --release--> the stage it came from

* Pharmacy staff (pharmacist, pharmacy assistant, admin) move a fill through the stages. Only a pharmacist
  (RA 10918) does the final check: product, strength and quantity each confirmed, and a different pharmacist
  than the one who filled (a single pharmacist on duty may check their own fill, giving the reason).
* Only a pharmacist dispenses (RA 10918); their PRC license number is kept on the fill and printed on the label.
* A fill with no price in the price table can't be dispensed.
* Every step records who did it and when (on the fill and in FillEvent).
* Dangerous drugs (RA 9165): dispensing needs the DDB yellow prescription serial number and the prescriber's
  S2 license number, both logged, and only a pharmacist dispenses them. A dangerous drug is never refilled:
  a new prescription must be presented.
* Price in PHP from the clinic's price table (PharmacyPrice). A senior citizen (RA 9994) or person with
  disability (RA 10754) with an ID on file gets the VAT exemption and then 20% off; the ID number is kept on
  the dispense. Only one of the two discounts applies to a purchase.
* Partial fills: a fill may dispense less than prescribed; the balance stays owed and can be completed later.
* Counseling offered / accepted is recorded at dispense.
* Labels print the generic name first and the brand in parentheses (RA 6675 / RA 9502).

Like the nurse's task list, fills are created when the queue is opened (ensure_fills); no background job.
"""

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date

from appointments import allergies
from appointments.models import Prescription

from .dangerous_drugs import is_dangerous_drug
from .models import FILL_STAGES, FillEvent, PatientDiscountId, PharmacyPrice, PrescriptionFill
from .services import drug_names, name_of

STAGE_LABELS = dict(FILL_STAGES)
FILL_ROLES = ("pharmacist", "pharmacy_tech", "admin", "system_admin")
CHECK_ROLES = ("pharmacist",)
DISPENSE_ROLES = ("pharmacist",)  # RA 10918: dispensing is done by the pharmacist, for every drug
DANGEROUS_DISPENSE_ROLES = ("pharmacist",)
PRICE_ROLES = ("pharmacist", "admin", "system_admin")
OPEN_STAGES = ("received", "data_entry", "filling", "final_check", "ready")
RX_FILLABLE = ("signed", "sent")
NEXT_STAGE = {"received": "data_entry", "data_entry": "filling", "filling": "final_check", "final_check": "ready", "ready": "dispensed"}

VAT_RATE = Decimal(str(getattr(settings, "PHARMACY_VAT_RATE", "0.12")))
DISCOUNT_RATE = Decimal("0.20")  # RA 9994 (senior citizens) and RA 10754 (persons with disability)
CENT = Decimal("0.01")


class FillError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def money(value):
    return value.quantize(CENT, rounding=ROUND_HALF_UP) if value is not None else None


def _dec(value, label):
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise FillError(f"{label} must be a number.")
    if number <= 0:
        raise FillError(f"{label} must be more than zero.")
    return number


def _log(fill, event_type, user, from_stage="", to_stage="", detail=None):
    FillEvent.objects.create(
        fill=fill, event_type=event_type, from_stage=from_stage, to_stage=to_stage,
        user=user if getattr(user, "pk", None) else None, detail=detail or {},
    )


def dangerous_partial_fills_allowed():
    """
    Partial fills of a dangerous drug on the same DDB yellow prescription serial: allowed by default.
    AWAITING DDB CONFIRMATION -- set PHARMACY_ALLOW_DANGEROUS_PARTIAL_FILLS = False to block them until the
    Dangerous Drugs Board confirms they are acceptable.
    """
    return bool(getattr(settings, "PHARMACY_ALLOW_DANGEROUS_PARTIAL_FILLS", True))


def pharmacist_license(user):
    profile = getattr(user, "pharmacist_profile", None) if getattr(user, "pk", None) else None
    return (profile.prc_license_number if profile else "") or ""


def is_dangerous(rx):
    return is_dangerous_drug(f"{drug_names(rx.drug_name)['generic']} {rx.drug_name}", organization=rx.organization)


# --------------------------------------------------------------------------- the queue

def ensure_fills(org=None, now=None):
    """Bring newly sent in-house prescriptions into the queue, and hold open fills whose prescription was cancelled."""
    now = now or timezone.now()
    rxs = Prescription.objects.filter(status__in=RX_FILLABLE, pharmacy__is_in_house=True, fills__isnull=True)
    if org is not None:
        rxs = rxs.filter(organization=org)
    made = 0
    for rx in rxs.select_related("pharmacy"):
        fill = PrescriptionFill.objects.create(
            organization_id=rx.organization_id, prescription=rx, patient_id=rx.patient_id, fill_number=1,
            stage="received", received_at=now, quantity_unit=rx.quantity_unit,
            yellow_rx_serial=rx.yellow_rx_serial, s2_number=rx.s2_number,
        )
        _log(fill, "received", None, to_stage="received", detail={"pharmacy": rx.pharmacy.name})
        made += 1
    stale = PrescriptionFill.objects.filter(stage__in=OPEN_STAGES, prescription__status="cancelled")
    if org is not None:
        stale = stale.filter(organization=org)
    for fill in stale:
        _hold(fill, None, "Prescription cancelled by the prescriber.")
    return made


def dispensed_quantity(rx, fill_number, exclude=None):
    qs = PrescriptionFill.objects.filter(prescription=rx, fill_number=fill_number, stage="dispensed")
    if exclude is not None:
        qs = qs.exclude(pk=exclude.pk)
    return qs.aggregate(n=Sum("quantity"))["n"] or Decimal(0)


def owed(fill):
    """How much of this fill's prescribed quantity is still to be dispensed (before this fill)."""
    rx = fill.prescription
    if rx.quantity is None:
        return None
    return max(Decimal(0), rx.quantity - dispensed_quantity(rx, fill.fill_number, exclude=fill))


def balance_after(fill):
    """Quantity still owed once this fill is dispensed (the partial-fill balance)."""
    rx = fill.prescription
    if rx.quantity is None:
        return None
    done = dispensed_quantity(rx, fill.fill_number)
    if fill.stage != "dispensed" and fill.quantity is not None:
        done += fill.quantity
    return max(Decimal(0), rx.quantity - done)


def refills_used(rx):
    return PrescriptionFill.objects.filter(prescription=rx).exclude(fill_number=1).values("fill_number").distinct().count()


# --------------------------------------------------------------------------- price

def _norm(text):
    return allergies._norm(text)


def price_for(org_id, rx):
    """
    The price for this prescription: the formulary item's price (the clinic's, else the shared one) when the drug
    is a formulary item; otherwise the clinic's price-table row with the longest drug name the Rx contains.
    """
    from .formulary import match_item, price_row

    item = match_item(rx.drug_name, rx.organization)
    if item is not None:
        row = price_row(item, rx.organization)
        if row is not None:
            return row
    generic = drug_names(rx.drug_name)["generic"]
    texts = [_norm(f"{generic} {rx.strength}"), _norm(f"{rx.drug_name} {rx.strength}"), _norm(rx.drug_name)]
    best = None
    for row in PharmacyPrice.objects.filter(organization_id=org_id, is_active=True):
        name = _norm(row.drug_name)
        hit = name and any(allergies._phrase_in(name, t) for t in texts)
        if hit and (best is None or len(name) > len(_norm(best.drug_name))):
            best = row
    return best


def compute_price(unit_price, quantity, vat_exempt_item=False, discounted=False):
    """
    PHP amounts for a sale. The table price includes 12% VAT unless the item is VAT-exempt.
    Senior / PWD: the VAT is removed first, then 20% off the VAT-exclusive price.
    """
    if unit_price is None or quantity is None:
        return {"unit_price": None, "gross": None, "vat_exempt": None, "discount": None, "total": None}
    gross = money(Decimal(unit_price) * Decimal(quantity))
    if not discounted:
        return {"unit_price": money(Decimal(unit_price)), "gross": gross, "vat_exempt": Decimal("0.00"), "discount": Decimal("0.00"), "total": gross}
    base = gross if vat_exempt_item else money(gross / (Decimal(1) + VAT_RATE))
    discount = money(base * DISCOUNT_RATE)
    return {
        "unit_price": money(Decimal(unit_price)),
        "gross": gross,
        "vat_exempt": money(gross - base),
        "discount": discount,
        "total": money(base - discount),
    }


def discount_id_for(patient_id, kind=None):
    qs = PatientDiscountId.objects.filter(patient_id=patient_id, is_active=True)
    if kind:
        qs = qs.filter(kind=kind)
    return qs.first()


def quote(fill, discount_kind=None):
    """The price of this fill now, with the discount the patient would get (if an ID is on file)."""
    row = price_for(fill.organization_id, fill.prescription)
    card = discount_id_for(fill.patient_id, discount_kind) if discount_kind != "none" else None
    unit = fill.unit_price if fill.unit_price is not None else (row.unit_price if row else None)
    amounts = compute_price(unit, fill.quantity, bool(row and row.vat_exempt), discounted=card is not None)
    return {
        **{k: (str(v) if v is not None else None) for k, v in amounts.items()},
        "currency": "PHP",
        "price_found": row is not None or fill.unit_price is not None,
        "price_unit": row.unit if row else "",
        "vat_exempt_item": bool(row and row.vat_exempt),
        "discount_kind": card.kind if card else "",
        "discount_id_number": card.id_number if card else "",
    }


# --------------------------------------------------------------------------- the steps

def _lock(fill):
    return PrescriptionFill.objects.select_for_update().select_related("prescription", "prescription__pharmacy", "prescription__prescriber", "patient").get(pk=fill.pk)


def _same_org(user, fill):
    if user.role != "system_admin" and fill.organization_id != user.organization_id:
        raise FillError("Fill not found.", 404)


def _move(fill, user, to_stage, event_type, stamp=None, detail=None):
    from_stage = fill.stage
    fill.stage = to_stage
    if stamp:
        setattr(fill, f"{stamp}_by", user)
        setattr(fill, f"{stamp}_at", timezone.now())
    fill.save()
    _log(fill, event_type, user, from_stage, to_stage, detail)
    return fill


def _hold(fill, user, reason):
    fill.held_from = fill.stage
    fill.hold_reason = reason
    return _move(fill, user, "on_hold", "held", detail={"reason": reason})


def _expect(fill, stage):
    if fill.stage != stage:
        raise FillError(f"This fill is at {STAGE_LABELS.get(fill.stage, fill.stage)}, not {STAGE_LABELS[stage]}.", 409)


def _yes(data, key):
    value = data.get(key)
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1")
    return value is True


ACTIONS = ("start_entry", "enter", "fill", "check", "check_fail", "dispense", "hold", "release")


@transaction.atomic
def act(fill, user, action, data=None):
    data = data or {}
    role = getattr(user, "role", None)
    if role not in FILL_ROLES:
        raise FillError("Only pharmacy staff can work on fills.", 403)
    if action not in ACTIONS:
        raise FillError("Unknown action.")
    fill = _lock(fill)
    _same_org(user, fill)
    rx = fill.prescription
    note = str(data.get("note") or "").strip()[:500]

    if action == "hold":
        if fill.stage not in OPEN_STAGES:
            raise FillError("Only a fill that is still in progress can be put on hold.", 409)
        reason = str(data.get("reason") or "").strip()[:300]
        if not reason:
            raise FillError("Give the reason for the hold.")
        return _hold(fill, user, reason)

    if action == "release":
        _expect(fill, "on_hold")
        if rx.status == "cancelled":
            raise FillError("The prescription was cancelled; this fill can't continue.", 409)
        back = fill.held_from or "received"
        fill.hold_reason = ""
        fill.held_from = ""
        return _move(fill, user, back, "released", detail={"note": note} if note else None)

    if rx.status not in RX_FILLABLE:
        raise FillError("The prescription is no longer active.", 409)

    if action == "start_entry":
        _expect(fill, "received")
        return _move(fill, user, "data_entry", "data_entry_started")

    if action == "enter":
        _expect(fill, "data_entry")
        due = owed(fill)
        quantity = _dec(data.get("quantity"), "Quantity") if data.get("quantity") not in (None, "") else due
        if quantity is None:
            raise FillError("Give the quantity to dispense.")
        if due is not None and quantity > due:
            raise FillError(f"Only {_num(due)} {rx.quantity_unit or 'units'} remain to be dispensed on this fill.")
        if due is not None and quantity < due and is_dangerous(rx) and not dangerous_partial_fills_allowed():
            raise FillError("Partial fills of a dangerous drug are switched off. Dispense the full quantity.")
        fill.quantity = quantity
        fill.quantity_unit = rx.quantity_unit
        row = price_for(fill.organization_id, rx)
        if data.get("unit_price") not in (None, ""):
            if role not in PRICE_ROLES:
                raise FillError("Only a pharmacist or an administrator can change the price.", 403)
            fill.unit_price = _dec(data["unit_price"], "Unit price")
        else:
            fill.unit_price = row.unit_price if row else None
        fill.note = note or fill.note
        return _move(fill, user, "filling", "data_entered", "entered",
                     {"quantity": str(quantity), "partial": bool(due is not None and quantity < due), "unit_price": str(fill.unit_price) if fill.unit_price is not None else None})

    if action == "fill":
        _expect(fill, "filling")
        product = str(data.get("product_name") or "").strip()[:200]
        strength = str(data.get("product_strength") or "").strip()[:60]
        lot = str(data.get("lot_number") or "").strip()[:40]
        expiry = parse_date(str(data.get("expiry_date") or "")) if data.get("expiry_date") else None
        missing = [label for label, v in (("product", product), ("strength", strength), ("lot number", lot), ("expiry date", expiry)) if not v]
        if missing:
            raise FillError("Enter the " + ", ".join(missing) + " of the product filled.")
        if expiry <= date.today():
            raise FillError("That product is expired. Choose another lot.")
        fill.product_name, fill.product_strength, fill.lot_number, fill.expiry_date = product, strength, lot, expiry
        return _move(fill, user, "final_check", "filled", "filled", {"product": product, "strength": strength, "lot": lot, "expiry": expiry.isoformat()})

    if action in ("check", "check_fail"):
        _expect(fill, "final_check")
        if role not in CHECK_ROLES:
            raise FillError("Only a pharmacist can do the final check.", 403)
        if action == "check_fail":
            reason = str(data.get("reason") or "").strip()[:300]
            if not reason:
                raise FillError("Say what has to be corrected.")
            fill.product_verified = fill.strength_verified = fill.quantity_verified = False
            fill.check_note = reason
            return _move(fill, user, "filling", "check_failed", detail={"reason": reason})
        checks = {k: _yes(data, k) for k in ("product_verified", "strength_verified", "quantity_verified")}
        if not all(checks.values()):
            raise FillError("Confirm the product, the strength and the quantity before passing the check.")
        detail = dict(checks)
        if fill.filled_by_id == user.pk:
            reason = str(data.get("single_pharmacist_reason") or "").strip()[:300]
            if not reason:
                raise FillError(
                    "A different pharmacist must do the final check. If you are the only pharmacist on duty, "
                    "give the reason to check your own fill.", 409,
                )
            fill.single_pharmacist_reason = reason
            detail["single_pharmacist_override"] = reason
        fill.product_verified = fill.strength_verified = fill.quantity_verified = True
        fill.check_note = note
        return _move(fill, user, "ready", "checked", "checked", detail)

    # dispense
    _expect(fill, "ready")
    dangerous = is_dangerous(rx)
    if role not in DISPENSE_ROLES:
        raise FillError("Only a pharmacist can dispense (RA 10918).", 403)
    detail = {}
    row = price_for(fill.organization_id, rx)
    if fill.unit_price is None and row is not None:
        fill.unit_price = row.unit_price  # priced after data entry
    if fill.unit_price is None:
        raise FillError(f"There is no price for {drug_names(rx.drug_name)['generic']} in the price table. "
                        "Add it to the price table before dispensing.", 409)
    license_number = str(data.get("prc_license_number") or "").strip()[:40] or pharmacist_license(user)
    if not license_number:
        raise FillError("Enter your PRC license number: it is printed on the label.")
    if license_number != pharmacist_license(user):
        from .models import PharmacistProfile

        PharmacistProfile.objects.update_or_create(user=user, defaults={"prc_license_number": license_number})
    fill.pharmacist_license = license_number
    if dangerous:
        if role not in DANGEROUS_DISPENSE_ROLES:
            raise FillError("A dangerous drug (RA 9165) is dispensed by a pharmacist.", 403)
        serial = str(data.get("yellow_rx_serial") or "").strip()[:40]
        s2 = str(data.get("s2_number") or "").strip()[:40]
        if not serial or not s2:
            raise FillError("A dangerous drug needs the DDB yellow prescription serial number and the prescriber's S2 license number.")
        fill.yellow_rx_serial, fill.s2_number = serial, s2
        detail.update({"dangerous_drug": True, "yellow_rx_serial": serial, "s2_number": s2})
    if data.get("counseling_offered") in (None, ""):
        raise FillError("Record whether counseling was offered.")
    fill.counseling_offered = _yes(data, "counseling_offered")
    fill.counseling_accepted = _yes(data, "counseling_accepted") if fill.counseling_offered else False
    kind = str(data.get("discount_kind") or "").strip()
    card = None
    if kind and kind != "none":
        card = discount_id_for(fill.patient_id, kind)
        if card is None:
            raise FillError("There is no senior citizen or PWD ID of that kind on file for this patient.")
    amounts = compute_price(fill.unit_price, fill.quantity, bool(row and row.vat_exempt), discounted=card is not None)
    fill.gross_amount, fill.vat_exempt_amount = amounts["gross"], amounts["vat_exempt"]
    fill.discount_amount, fill.total_amount = amounts["discount"], amounts["total"]
    fill.discount_kind = card.kind if card else ""
    fill.discount_id_number = card.id_number if card else ""
    fill.note = note or fill.note
    detail.update({
        "quantity": str(fill.quantity), "counseling_offered": fill.counseling_offered, "counseling_accepted": fill.counseling_accepted,
        "total": str(fill.total_amount) if fill.total_amount is not None else None,
        "discount_kind": fill.discount_kind, "discount_id_number": fill.discount_id_number,
        "pharmacist_license": license_number,
    })
    fill = _move(fill, user, "dispensed", "dispensed", "dispensed", detail)
    if rx.status == "signed":
        Prescription.objects.filter(pk=rx.pk).update(status="sent", sent_at=timezone.now())
    return fill


@transaction.atomic
def complete_partial(fill, user):
    """Start a fill for the balance of a partial fill."""
    if getattr(user, "role", None) not in FILL_ROLES:
        raise FillError("Only pharmacy staff can work on fills.", 403)
    fill = _lock(fill)
    _same_org(user, fill)
    rx = fill.prescription
    if fill.stage != "dispensed":
        raise FillError("Only a dispensed fill can be completed.", 409)
    if rx.status not in RX_FILLABLE:
        raise FillError("The prescription is no longer active.", 409)
    left = balance_after(fill)
    if not left:
        raise FillError("Nothing is left to dispense on this fill.", 409)
    if is_dangerous(rx) and not dangerous_partial_fills_allowed():
        raise FillError("Partial fills of a dangerous drug are switched off.", 409)
    if PrescriptionFill.objects.filter(prescription=rx, fill_number=fill.fill_number, stage__in=OPEN_STAGES + ("on_hold",)).exists():
        raise FillError("The rest of this fill is already in the queue.", 409)
    new = PrescriptionFill.objects.create(
        organization_id=fill.organization_id, prescription=rx, patient_id=fill.patient_id, fill_number=fill.fill_number,
        stage="received", received_by=user, received_at=timezone.now(), quantity_unit=rx.quantity_unit,
        yellow_rx_serial=fill.yellow_rx_serial, s2_number=fill.s2_number,
    )
    _log(new, "received", user, to_stage="received", detail={"completes_partial": fill.pk, "balance": str(left)})
    return new


@transaction.atomic
def refill(rx, user):
    """Start the next refill of a prescription. Never for a dangerous drug: a new prescription is needed."""
    if getattr(user, "role", None) not in FILL_ROLES:
        raise FillError("Only pharmacy staff can work on fills.", 403)
    rx = Prescription.objects.select_for_update().select_related("pharmacy").get(pk=rx.pk)
    if user.role != "system_admin" and rx.organization_id != user.organization_id:
        raise FillError("Prescription not found.", 404)
    if rx.status not in RX_FILLABLE:
        raise FillError("The prescription is no longer active.", 409)
    if is_dangerous(rx):
        raise FillError("A dangerous drug (RA 9165) can't be refilled. The patient must present a new prescription.", 409)
    fills = PrescriptionFill.objects.filter(prescription=rx)
    if fills.filter(stage__in=OPEN_STAGES + ("on_hold",)).exists():
        raise FillError("A fill of this prescription is still in progress.", 409)
    last = fills.order_by("-fill_number").first()
    if last is None:
        raise FillError("The original fill has not been made yet.", 409)
    if refills_used(rx) >= rx.refills:
        raise FillError("No refills remain on this prescription.", 409)
    new = PrescriptionFill.objects.create(
        organization_id=rx.organization_id, prescription=rx, patient_id=rx.patient_id, fill_number=last.fill_number + 1,
        stage="received", received_by=user, received_at=timezone.now(), quantity_unit=rx.quantity_unit,
    )
    _log(new, "received", user, to_stage="received", detail={"refill": True})
    return new


# --------------------------------------------------------------------------- serializing

def _iso(v):
    return v.isoformat() if v else None


def _num(v):
    return format(v.normalize(), "f") if v is not None else None


def _who(user, at):
    return {"name": name_of(user), "at": _iso(at)} if user is not None or at else None


def serialize_fill(fill, detail=False):
    rx = fill.prescription
    names = drug_names(rx.drug_name)
    left = balance_after(fill)
    data = {
        "id": fill.pk,
        "prescription": rx.pk,
        "rx_number": f"RX-{rx.pk:06d}",
        "fill_number": fill.fill_number,
        "is_refill": fill.fill_number > 1,
        "patient": {"id": fill.patient_id, "name": name_of(fill.patient)},
        "drug": names,
        "strength": rx.strength,
        "form": rx.form,
        "sig": rx.sig,
        "prescribed_quantity": _num(rx.quantity),
        "quantity": _num(fill.quantity),
        "quantity_unit": fill.quantity_unit or rx.quantity_unit,
        "balance": _num(left),
        "is_partial": bool(fill.quantity is not None and left),
        "refills": rx.refills,
        "refills_used": refills_used(rx),
        "dangerous_drug": is_dangerous(rx),
        "prescriber": name_of(rx.prescriber),
        "stage": fill.stage,
        "stage_label": STAGE_LABELS.get(fill.stage, fill.stage),
        "held_from": fill.held_from,
        "hold_reason": fill.hold_reason,
        "received": _who(fill.received_by, fill.received_at),
        "entered": _who(fill.entered_by, fill.entered_at),
        "filled": _who(fill.filled_by, fill.filled_at),
        "checked": _who(fill.checked_by, fill.checked_at),
        "dispensed": _who(fill.dispensed_by, fill.dispensed_at),
        "total_amount": _num(fill.total_amount),
        "currency": "PHP",
        "created_at": _iso(fill.created_at),
    }
    if detail:
        from .formulary import item_needs_review, match_item

        data.update({
            # the formulary item this Rx matches is not yet reviewed by a pharmacist: a warning, never a block
            "needs_review": item_needs_review(match_item(rx.drug_name, rx.organization)),
            "product_name": fill.product_name,
            "product_strength": fill.product_strength,
            "lot_number": fill.lot_number,
            "expiry_date": fill.expiry_date.isoformat() if fill.expiry_date else None,
            "product_verified": fill.product_verified,
            "strength_verified": fill.strength_verified,
            "quantity_verified": fill.quantity_verified,
            "check_note": fill.check_note,
            "single_pharmacist_reason": fill.single_pharmacist_reason,
            "pharmacist_license": fill.pharmacist_license,
            "yellow_rx_serial": fill.yellow_rx_serial,
            "s2_number": fill.s2_number,
            "unit_price": _num(fill.unit_price),
            "gross_amount": _num(fill.gross_amount),
            "vat_exempt_amount": _num(fill.vat_exempt_amount),
            "discount_kind": fill.discount_kind,
            "discount_id_number": fill.discount_id_number,
            "discount_amount": _num(fill.discount_amount),
            "counseling_offered": fill.counseling_offered,
            "counseling_accepted": fill.counseling_accepted,
            "note": fill.note,
            "rx_note_to_pharmacist": rx.note_to_pharmacist,
            "rx_status": rx.status,
            "quote": quote(fill) if fill.stage not in ("dispensed",) else None,
            "discount_ids": [
                {"id": c.pk, "kind": c.kind, "kind_label": c.get_kind_display(), "id_number": c.id_number}
                for c in PatientDiscountId.objects.filter(patient_id=fill.patient_id, is_active=True)
            ],
            "events": [
                {"type": e.event_type, "from": e.from_stage, "to": e.to_stage, "user": name_of(e.user) if e.user_id else "System",
                 "detail": e.detail, "at": _iso(e.created_at)}
                for e in fill.events.select_related("user")
            ],
        })
    return data


def label_data(fill):
    """What the label prints: generic first, brand in parentheses (RA 6675 / RA 9502)."""
    rx = fill.prescription
    names = drug_names(rx.drug_name)
    snap = rx.pharmacy_snapshot or {}
    pharmacy = rx.pharmacy
    profile = getattr(rx.prescriber, "prescriber_profile", None)
    when = fill.dispensed_at or fill.checked_at or fill.filled_at or timezone.now()
    return {
        "rx_number": f"RX-{rx.pk:06d}",
        "fill_number": fill.fill_number,
        "patient": name_of(fill.patient),
        "generic_name": names["generic"],
        "brand_name": names["brand"],
        "drug_line": " ".join(x for x in (names["generic"], f"({names['brand']})" if names["brand"] else "", rx.strength, rx.form) if x),
        "sig": rx.sig,
        "quantity": _num(fill.quantity),
        "quantity_unit": fill.quantity_unit or rx.quantity_unit,
        "prescriber": name_of(rx.prescriber),
        "prescriber_license": getattr(profile, "license_number", "") or "",
        "pharmacy_name": (pharmacy.name if pharmacy else "") or snap.get("name", ""),
        "pharmacy_address": ", ".join(x for x in ((pharmacy.address if pharmacy else snap.get("address", "")), (pharmacy.city if pharmacy else snap.get("city", ""))) if x),
        "pharmacy_phone": (pharmacy.phone if pharmacy else snap.get("phone", "")) or "",
        "fda_lto_number": (pharmacy.fda_lto_number if pharmacy else snap.get("fda_lto_number", "")) or "",
        "fill_date": timezone.localtime(when).date().isoformat(),
        "lot_number": fill.lot_number,
        "expiry_date": fill.expiry_date.isoformat() if fill.expiry_date else None,
        "refills_left": max(0, rx.refills - refills_used(rx)) if not is_dangerous(rx) else 0,
        "dangerous_drug": is_dangerous(rx),
        "dispensed_by": name_of(fill.dispensed_by) if fill.dispensed_by_id else "",
        "pharmacist_license": fill.pharmacist_license,
    }


def queue(org, stage=None, q="", now=None):
    """(counts per stage, fills) for the queue. Dispensed shows the last 30 days."""
    now = now or timezone.now()
    qs = PrescriptionFill.objects.select_related("prescription", "prescription__prescriber", "patient")
    if org is not None:
        qs = qs.filter(organization=org)
    qs = qs.filter(~Q(stage="dispensed") | Q(dispensed_at__gte=now - timedelta(days=30)))
    if q:
        qs = qs.filter(Q(prescription__drug_name__icontains=q) | Q(patient__first_name__icontains=q) | Q(patient__last_name__icontains=q))
    counts = {key: 0 for key, _ in FILL_STAGES}
    for row in qs.values("stage").annotate(n=Count("id")):
        counts[row["stage"]] = row["n"]
    rows = qs.filter(stage=stage) if stage else qs
    order = ("-dispensed_at",) if stage == "dispensed" else ("created_at", "id")
    return counts, list(rows.order_by(*order)[:300])
