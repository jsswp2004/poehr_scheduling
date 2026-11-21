"""
POWER Pharmacy, Phase 3: the external pharmacy portal.

Outside (partner) pharmacies register with their FDA LTO number and expiry and their pharmacists' PRC numbers.
They stay pending until a POWER administrator approves them; an administrator can suspend them, and a pharmacy
whose LTO has expired is blocked. Their staff (ext_pharmacist, ext_pharmacy_admin) only ever reach
/api/pharmacy-portal/ (enforced centrally in TenantAwareJWTAuthentication) and only see their own prescriptions.

How a prescription gets to a partner pharmacy:
* routed: the prescriber picks a clinic-directory pharmacy that is linked to an approved partner;
  when the prescription is signed it lands in that pharmacy's New tab;
* claimed: any approved pharmacy enters the claim code printed on the prescription (also in its QR code)
  and the patient's birthdate; the prescription is then locked to that pharmacy.

At the pharmacy:  new --accept--> in_progress --ready--> ready --dispense--> dispensed | partially_dispensed
                  new --decline (reason)--> declined (back to the prescriber, unlocked)
                  prescriber cancels --> cancelled (dispensing blocked)
Each step updates the prescription (status and history) so the prescriber sees it.

Change requests (out of stock, other strength or form, clarification) and renewal requests go to the
prescriber's POWER inbox; the answer comes back to the portal.

Dispensing records the actual product, brand and manufacturer (generic substitution, RA 6675), the senior
citizen / PWD ID type and number used (no pricing in the portal), and for a dangerous drug (RA 9165) the
yellow Rx serial and that the original paper prescription is in hand; dangerous drugs are never refilled.

Data Privacy Act (RA 10173): a pharmacy sees the minimum (patient name, birthdate and age, allergies, the
prescription) and every view and action is written to PortalAccessLog.
"""

import secrets
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_date

from appointments.models import PatientAllergy, PatientAllergyStatus, Prescription

from . import portal_transport as transport
from .dangerous_drugs import is_dangerous_drug
from .fills import dangerous_partial_fills_allowed
from .models import (
    PORTAL_STATUSES,
    PartnerDirectoryLink,
    PartnerPharmacist,
    PartnerPharmacy,
    PortalAccessLog,
    PortalDispense,
    PortalPrescription,
    PortalRequest,
)
from .services import age_years, drug_names, name_of

PORTAL_ROLES = ("ext_pharmacist", "ext_pharmacy_admin")
STATUS_LABELS = dict(PORTAL_STATUSES)
TABS = ("new", "in_progress", "ready", "changes", "renewals", "history")
CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I
CLAIMABLE_RX = ("signed", "sent")
OPEN = ("new", "in_progress", "ready", "partially_dispensed")


class PortalError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# --------------------------------------------------------------------------- partner pharmacies

def partner_problem(partner, today=None):
    """Why this pharmacy can't work right now, or "" when it can."""
    today = today or date.today()
    if partner is None:
        return "Your account is not linked to a pharmacy."
    if partner.status == "pending":
        return "Your pharmacy is waiting for approval by POWER."
    if partner.status == "suspended":
        return "Your pharmacy has been suspended on the POWER Pharmacy Portal." + (f" {partner.status_reason}" if partner.status_reason else "")
    if partner.lto_expiry < today:
        return f"Your FDA License to Operate expired on {partner.lto_expiry.isoformat()}. Renew it to continue."
    return ""


def can_manage_staff(user):
    m = membership(user)
    return getattr(user, "role", None) == "ext_pharmacy_admin" or bool(m and m.is_admin)


def can_work(partner):
    return not partner_problem(partner)


def membership(user):
    return getattr(user, "portal_membership", None) if getattr(user, "role", None) in PORTAL_ROLES else None


def partner_of(user):
    m = membership(user)
    return m.partner if m is not None and m.is_active else None


def log_access(user, action, rx=None, request=None, detail=None):
    ip = ""
    if request is not None:
        ip = (request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR", ""))[:64]
    PortalAccessLog.objects.create(
        user=user, partner=partner_of(user), prescription=rx, action=action[:40], detail=detail or {}, ip=ip,
    )


def partner_for_directory_pharmacy(pharmacy):
    link = PartnerDirectoryLink.objects.filter(pharmacy=pharmacy).select_related("partner").first() if pharmacy is not None else None
    return link.partner if link else None


# --------------------------------------------------------------------------- claim codes and routing

def new_claim_code():
    while True:
        code = "".join(secrets.choice(CLAIM_ALPHABET) for _ in range(8))
        if not Prescription.objects.filter(claim_code=code).exists():
            return code


def ensure_claim_code(rx):
    if not rx.claim_code:
        rx.claim_code = new_claim_code()
        Prescription.objects.filter(pk=rx.pk).update(claim_code=rx.claim_code)
    return rx.claim_code


def _rx_event(rx, event_type, user=None, detail=None, to_status=None):
    from appointments import prescriptions as rxs

    rxs.log_event(rx, event_type, user, from_status=rx.status, to_status=to_status or rx.status, detail=detail or {})


def on_rx_signed(rx, user):
    """Called when a prescription is signed: give it a claim code; route it if its pharmacy is a portal partner."""
    ensure_claim_code(rx)
    partner = partner_for_directory_pharmacy(rx.pharmacy)
    if partner is None:
        return None
    problem = partner_problem(partner)
    if problem:
        raise PortalError(f"{partner.name} can't receive prescriptions right now: {problem}", 409)
    portal_rx, _ = PortalPrescription.objects.update_or_create(
        prescription=rx, defaults={"partner": partner, "status": "new", "how": "routed", "locked_at": timezone.now(), "decline_reason": ""},
    )
    _rx_event(rx, "portal_routed", user, {"pharmacy": partner.name})
    transport.adapter_for(partner).route(portal_rx)
    return portal_rx


def check_directory_choice(pharmacy):
    """A clinic-directory pharmacy linked to a portal partner may be chosen only while that partner can work."""
    partner = partner_for_directory_pharmacy(pharmacy)
    if partner is not None and partner_problem(partner):
        return f"{partner.name} is not available on the POWER Pharmacy Portal right now."
    return ""


@transaction.atomic
def claim(user, code, birthdate):
    partner = partner_of(user)
    problem = partner_problem(partner)
    if problem:
        raise PortalError(problem, 403)
    code = str(code or "").strip().upper().replace("POWER-RX:", "").replace("-", "").replace(" ", "")
    dob = parse_date(str(birthdate or ""))
    if not code or dob is None:
        raise PortalError("Enter the claim code and the patient's birthdate.")
    rx = Prescription.objects.select_for_update().filter(claim_code=code).select_related("patient__patient_profile").first()
    profile = getattr(rx.patient, "patient_profile", None) if rx is not None else None
    # one answer for a wrong code and a wrong birthdate: the code must not reveal whether a prescription exists
    if rx is None or getattr(profile, "date_of_birth", None) != dob:
        raise PortalError("No prescription matches that claim code and birthdate.", 404)
    if rx.status not in CLAIMABLE_RX:
        raise PortalError("This prescription is no longer active.", 409)
    existing = getattr(rx, "portal", None) if PortalPrescription.objects.filter(prescription=rx).exists() else None
    if existing is not None and existing.partner_id and existing.status not in ("declined",):
        if existing.partner_id == partner.pk:
            return existing
        raise PortalError("This prescription has already been claimed by another pharmacy.", 409)
    portal_rx, _ = PortalPrescription.objects.update_or_create(
        prescription=rx, defaults={"partner": partner, "status": "in_progress", "how": "claimed", "locked_at": timezone.now(), "decline_reason": ""},
    )
    _mark_sent(rx, user, "portal_claimed", {"pharmacy": partner.name})
    log_access(user, "claim", rx)
    return portal_rx


def _mark_sent(rx, user, event_type, detail):
    previous = rx.status
    if rx.status == "signed":
        rx.status = "sent"
        rx.delivery_method = "portal"
        rx.sent_at = timezone.now()
        rx.save(update_fields=["status", "delivery_method", "sent_at"])
    from appointments import prescriptions as rxs

    rxs.log_event(rx, event_type, user if getattr(user, "pk", None) else None, from_status=previous, to_status=rx.status, detail=detail)


def on_rx_cancelled(rx, user):
    """The prescriber cancelled: the pharmacy is told and can no longer dispense."""
    portal_rx = PortalPrescription.objects.filter(prescription=rx).select_related("partner").first()
    if portal_rx is None or portal_rx.partner_id is None or portal_rx.status in ("dispensed", "declined"):
        return None
    portal_rx.status = "cancelled"
    portal_rx.save(update_fields=["status", "updated_at"])
    transport.adapter_for(portal_rx.partner).cancel(portal_rx)
    return portal_rx


# --------------------------------------------------------------------------- what the pharmacy sees

def _mine(user):
    partner = partner_of(user)
    return PortalPrescription.objects.filter(partner=partner) if partner is not None else PortalPrescription.objects.none()


def portal_rx_for(user, pk):
    """One of this pharmacy's prescriptions (404 for anyone else's)."""
    return _mine(user).select_related("prescription", "prescription__patient", "prescription__prescriber",
                                      "prescription__organization", "partner").filter(pk=pk).first()


def tab_queryset(user, tab):
    qs = _mine(user).select_related("prescription", "prescription__patient", "prescription__prescriber", "prescription__organization")
    if tab in ("new", "in_progress", "ready"):
        return qs.filter(status=tab)
    if tab in ("changes", "renewals"):
        kinds = ("renewal",) if tab == "renewals" else ("out_of_stock", "strength_form", "clarification")
        return qs.filter(requests__kind__in=kinds).distinct()
    return qs.filter(status__in=("dispensed", "partially_dispensed", "declined", "cancelled"))


def counts(user):
    out = {}
    for tab in TABS:
        qs = tab_queryset(user, tab)
        if tab in ("changes", "renewals"):
            qs = qs.filter(requests__status="pending")
        out[tab] = qs.count()
    return out


def dispensed_quantity(portal_rx, fill_number=None):
    qs = portal_rx.dispenses.all()
    if fill_number is not None:
        qs = qs.filter(fill_number=fill_number)
    return qs.aggregate(n=Sum("quantity"))["n"] or Decimal(0)


def _num(v):
    return format(v.normalize(), "f") if v is not None else None


def serialize(portal_rx, detail=False):
    """The minimum a pharmacy needs (RA 10173): patient name, birthdate and age, allergies, the prescription."""
    rx = portal_rx.prescription
    patient = rx.patient
    profile = getattr(patient, "patient_profile", None)
    dob = getattr(profile, "date_of_birth", None)
    names = drug_names(rx.drug_name)
    dangerous = is_dangerous_drug(f"{names['generic']} {rx.drug_name}")
    owed = (rx.quantity - dispensed_quantity(portal_rx, portal_rx.fill_number)) if rx.quantity is not None else None
    pending = list(portal_rx.requests.filter(status="pending").values_list("kind", flat=True))
    data = {
        "id": portal_rx.pk,
        "rx_number": f"RX-{rx.pk:06d}",
        "status": portal_rx.status,
        "status_label": STATUS_LABELS.get(portal_rx.status, portal_rx.status),
        "how": portal_rx.how,
        "patient": {"name": f"{patient.last_name}, {patient.first_name}".strip(", "), "birthdate": dob.isoformat() if dob else None, "age": age_years(dob)},
        "drug": names,
        "strength": rx.strength,
        "form": rx.form,
        "sig": rx.sig,
        "quantity": _num(rx.quantity),
        "quantity_unit": rx.quantity_unit,
        "balance": _num(max(Decimal(0), owed)) if owed is not None else None,
        "refills": rx.refills,
        "fill_number": portal_rx.fill_number,
        "dangerous_drug": dangerous,
        "prescriber": name_of(rx.prescriber),
        "clinic": rx.organization.name,
        "signed_at": rx.signed_at.isoformat() if rx.signed_at else None,
        "pending_requests": pending,
        "updated_at": portal_rx.updated_at.isoformat(),
    }
    if detail:
        prescriber_profile = getattr(rx.prescriber, "prescriber_profile", None)
        allergies = list(PatientAllergy.objects.filter(patient=patient, status="active").values("substance", "reaction", "severity"))
        nka = PatientAllergyStatus.objects.filter(patient=patient, no_known_allergies=True).exists()
        data.update({
            "allergies": allergies,
            "no_known_allergies": nka and not allergies,
            "dispense_as_written": rx.dispense_as_written,
            "note_to_pharmacist": rx.note_to_pharmacist,
            "prescriber_license": getattr(prescriber_profile, "license_number", "") or "",
            "clinic_phone": getattr(prescriber_profile, "phone", "") or "",
            "is_yellow_rx": rx.is_yellow_rx,
            "yellow_rx_serial": rx.yellow_rx_serial if dangerous else "",
            "s2_number": rx.s2_number if dangerous else "",
            "decline_reason": portal_rx.decline_reason,
            "rx_cancelled": rx.status == "cancelled",
            "cancel_reason": rx.cancel_reason if rx.status == "cancelled" else "",
            "dispenses": [serialize_dispense(d) for d in portal_rx.dispenses.select_related("pharmacist")],
            "requests": [serialize_request(r) for r in portal_rx.requests.select_related("created_by", "responded_by")],
        })
    return data


def serialize_dispense(d):
    return {
        "id": d.pk, "fill_number": d.fill_number, "quantity": _num(d.quantity), "is_partial": d.is_partial,
        "generic_name": d.generic_name, "brand_name": d.brand_name, "manufacturer": d.manufacturer,
        "strength": d.strength, "form": d.form, "yellow_rx_serial": d.yellow_rx_serial, "original_in_hand": d.original_in_hand,
        "discount_id_type": d.discount_id_type, "discount_id_number": d.discount_id_number,
        "pharmacist": name_of(d.pharmacist), "pharmacist_prc": d.pharmacist_prc, "dispensed_at": d.dispensed_at.isoformat(),
    }


def serialize_request(r):
    return {
        "id": r.pk, "kind": r.kind, "kind_label": r.get_kind_display(), "message": r.message, "proposed": r.proposed,
        "status": r.status, "response": r.response, "created_by": name_of(r.created_by), "created_at": r.created_at.isoformat(),
        "responded_by": name_of(r.responded_by) if r.responded_by_id else "",
        "responded_at": r.responded_at.isoformat() if r.responded_at else None,
        "renewal_prescription": r.renewal_prescription_id,
        "pharmacy": r.partner.name,
        "rx_number": f"RX-{r.portal.prescription_id:06d}",
    }


# --------------------------------------------------------------------------- the pharmacy's actions

def _text(data, key, n=300):
    return str(data.get(key) or "").strip()[:n]


def _yes(data, key):
    v = data.get(key)
    return v.strip().lower() in ("true", "yes", "1") if isinstance(v, str) else v is True


ACTIONS = ("accept", "decline", "ready", "dispense", "refill")


@transaction.atomic
def act(user, portal_rx, action, data=None):
    data = data or {}
    partner = partner_of(user)
    problem = partner_problem(partner)
    if problem:
        raise PortalError(problem, 403)
    portal_rx = PortalPrescription.objects.select_for_update().select_related("prescription", "prescription__prescriber", "partner").get(pk=portal_rx.pk)
    if portal_rx.partner_id != partner.pk:
        raise PortalError("Prescription not found.", 404)
    rx = portal_rx.prescription
    if action not in ACTIONS:
        raise PortalError("Unknown action.")
    if rx.status == "cancelled" or portal_rx.status == "cancelled":
        raise PortalError("The prescriber cancelled this prescription. Do not dispense it.", 409)

    if action == "accept":
        _expect(portal_rx, ("new",))
        portal_rx.status = "in_progress"
        portal_rx.save(update_fields=["status", "updated_at"])
        _mark_sent(rx, user, "portal_accepted", {"pharmacy": partner.name})
        return portal_rx

    if action == "decline":
        _expect(portal_rx, ("new",))
        reason = _text(data, "reason")
        if not reason:
            raise PortalError("Give the reason for declining.")
        portal_rx.status = "declined"
        portal_rx.decline_reason = reason
        portal_rx.partner = None  # unlocked: the prescriber can send it elsewhere, or another pharmacy can claim it
        portal_rx.save(update_fields=["status", "decline_reason", "partner", "updated_at"])
        _rx_event(rx, "portal_declined", user, {"pharmacy": partner.name, "reason": reason})
        transport.notify_prescriber(
            rx.prescriber, f"Pharmacy declined RX-{rx.pk:06d}",
            f"{partner.name} declined the prescription for {drug_names(rx.drug_name)['display']} "
            f"({rx.patient.last_name}, {rx.patient.first_name}).\n\nReason: {reason}",
            rx, "portal_declined", rx.pk,
        )
        return portal_rx

    if action == "ready":
        _expect(portal_rx, ("in_progress", "partially_dispensed"))
        portal_rx.status = "ready"
        portal_rx.save(update_fields=["status", "updated_at"])
        _rx_event(rx, "portal_ready", user, {"pharmacy": partner.name})
        return portal_rx

    if action == "refill":
        _expect(portal_rx, ("dispensed",))
        names = drug_names(rx.drug_name)
        if is_dangerous_drug(f"{names['generic']} {rx.drug_name}"):
            raise PortalError("A dangerous drug (RA 9165) can't be refilled. The patient must present a new prescription.", 409)
        if portal_rx.fill_number > rx.refills:
            raise PortalError("No refills remain. Send a renewal request to the prescriber.", 409)
        portal_rx.fill_number += 1
        portal_rx.status = "in_progress"
        portal_rx.save(update_fields=["fill_number", "status", "updated_at"])
        _rx_event(rx, "portal_refill_started", user, {"pharmacy": partner.name, "fill_number": portal_rx.fill_number})
        return portal_rx

    return _dispense(user, partner, portal_rx, rx, data)


def _expect(portal_rx, statuses):
    if portal_rx.status not in statuses:
        raise PortalError(f"This prescription is {STATUS_LABELS.get(portal_rx.status, portal_rx.status).lower()}; that step isn't possible.", 409)


def _dispense(user, partner, portal_rx, rx, data):
    _expect(portal_rx, ("ready", "in_progress", "partially_dispensed"))
    m = membership(user)
    if user.role != "ext_pharmacist" or not (m and m.prc_number):
        raise PortalError("Only a pharmacist with a PRC license number on file can dispense (RA 10918).", 403)
    try:
        quantity = Decimal(str(data.get("quantity")).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise PortalError("Enter the quantity dispensed.")
    if quantity <= 0:
        raise PortalError("Enter the quantity dispensed.")
    owed = rx.quantity - dispensed_quantity(portal_rx, portal_rx.fill_number) if rx.quantity is not None else quantity
    if quantity > owed:
        raise PortalError(f"Only {_num(owed)} {rx.quantity_unit or ''} remain on this fill.".replace("  ", " "))
    names = drug_names(rx.drug_name)
    generic = _text(data, "generic_name", 200)
    if not generic:
        raise PortalError("Record the generic name of the product dispensed (RA 6675).")
    dangerous = is_dangerous_drug(f"{names['generic']} {rx.drug_name}")
    serial = ""
    if dangerous:
        serial = _text(data, "yellow_rx_serial", 40)
        if not serial or not _yes(data, "original_in_hand"):
            raise PortalError("A dangerous drug needs the yellow Rx serial number and confirmation that the original prescription is in hand.")
        if rx.yellow_rx_serial and serial != rx.yellow_rx_serial:
            raise PortalError("The yellow Rx serial does not match the prescription.")
        if quantity < owed and not dangerous_partial_fills_allowed():
            raise PortalError("Partial fills of a dangerous drug are switched off.")
    id_type = _text(data, "discount_id_type", 10)
    if id_type and id_type not in ("senior", "pwd"):
        raise PortalError("The ID type is senior or pwd.")
    id_number = _text(data, "discount_id_number", 40) if id_type else ""
    if id_type and not id_number:
        raise PortalError("Enter the senior citizen or PWD ID number used.")
    is_partial = quantity < owed
    d = PortalDispense.objects.create(
        portal=portal_rx, partner=partner, fill_number=portal_rx.fill_number, quantity=quantity, is_partial=is_partial,
        generic_name=generic, brand_name=_text(data, "brand_name", 200), manufacturer=_text(data, "manufacturer", 200),
        strength=_text(data, "strength", 60) or rx.strength, form=_text(data, "form", 40) or rx.form,
        yellow_rx_serial=serial, original_in_hand=dangerous and _yes(data, "original_in_hand"),
        discount_id_type=id_type, discount_id_number=id_number, pharmacist=user, pharmacist_prc=m.prc_number,
    )
    portal_rx.status = "partially_dispensed" if is_partial else "dispensed"
    portal_rx.save(update_fields=["status", "updated_at"])
    _mark_sent(rx, user, "portal_partially_dispensed" if is_partial else "portal_dispensed", {
        "pharmacy": partner.name, "quantity": _num(quantity), "balance": _num(owed - quantity),
        "product": " ".join(x for x in (d.generic_name, f"({d.brand_name})" if d.brand_name else "", d.strength) if x),
        "manufacturer": d.manufacturer, "pharmacist_prc": d.pharmacist_prc,
    })
    return portal_rx


# --------------------------------------------------------------------------- requests to the prescriber

@transaction.atomic
def request_change(user, portal_rx, kind, message, proposed=""):
    partner = partner_of(user)
    problem = partner_problem(partner)
    if problem:
        raise PortalError(problem, 403)
    if portal_rx.partner_id != partner.pk:
        raise PortalError("Prescription not found.", 404)
    if kind not in dict(PortalRequest.KIND_CHOICES):
        raise PortalError("Choose the kind of request.")
    message = str(message or "").strip()[:1000]
    if not message:
        raise PortalError("Write the message to the prescriber.")
    rx = portal_rx.prescription
    if rx.status == "cancelled":
        raise PortalError("The prescriber cancelled this prescription.", 409)
    if portal_rx.requests.filter(kind=kind, status="pending").exists():
        raise PortalError("A request of this kind is already waiting for the prescriber.", 409)
    req = PortalRequest.objects.create(portal=portal_rx, partner=partner, kind=kind, message=message,
                                       proposed=str(proposed or "").strip()[:300], created_by=user)
    _rx_event(rx, "portal_request", user, {"pharmacy": partner.name, "kind": kind, "request": req.pk})
    transport.notify_prescriber(
        rx.prescriber, f"{req.get_kind_display()} request: RX-{rx.pk:06d}",
        f"{partner.name} asks about {drug_names(rx.drug_name)['display']} for {rx.patient.last_name}, {rx.patient.first_name}.\n\n"
        f"{message}" + (f"\n\nProposed: {req.proposed}" if req.proposed else "") + "\n\nOpen the prescription in POWER to approve or deny.",
        rx, "pharmacy_request", req.pk,
    )
    return req


RESPOND_ROLES = ("doctor", "admin", "system_admin")


@transaction.atomic
def respond(user, req, decision, response=""):
    """The prescriber approves or denies a pharmacy's request. Approving a renewal starts a renewal draft."""
    from appointments import prescriptions as rxs

    req = PortalRequest.objects.select_for_update().select_related("portal__prescription", "partner").get(pk=req.pk)
    rx = req.portal.prescription
    if user.role not in RESPOND_ROLES or (user.role == "doctor" and rx.prescriber_id != user.pk):
        raise PortalError("Only the prescriber or an administrator can answer this request.", 403)
    if user.role != "system_admin" and rx.organization_id != user.organization_id:
        raise PortalError("Request not found.", 404)
    if req.status != "pending":
        raise PortalError("This request has already been answered.", 409)
    if decision not in ("approved", "denied"):
        raise PortalError("Approve or deny.")
    response = str(response or "").strip()[:1000]
    if decision == "denied" and not response:
        raise PortalError("Say why the request is denied.")
    if decision == "approved" and req.kind == "renewal":
        draft = rxs.renew(rx, user)
        req.renewal_prescription = draft
        response = response or "Renewal approved: a new prescription will follow once it is signed."
    req.status = decision
    req.response = response
    req.responded_by = user
    req.responded_at = timezone.now()
    req.save()
    _rx_event(rx, "portal_request_answered", user, {"request": req.pk, "kind": req.kind, "decision": decision})
    transport.adapter_for(req.partner).respond(req)
    return req


def requests_for_prescription(rx):
    portal_rx = PortalPrescription.objects.filter(prescription=rx).first()
    if portal_rx is None:
        return []
    return [serialize_request(r) for r in portal_rx.requests.select_related("created_by", "responded_by", "partner", "portal")]


def portal_summary(rx):
    """What the prescriber sees of the portal on their prescription."""
    portal_rx = PortalPrescription.objects.filter(prescription=rx).select_related("partner").first()
    if portal_rx is None:
        return None
    return {
        "status": portal_rx.status,
        "status_label": STATUS_LABELS.get(portal_rx.status, portal_rx.status),
        "pharmacy": portal_rx.partner.name if portal_rx.partner_id else "",
        "how": portal_rx.how,
        "decline_reason": portal_rx.decline_reason,
        "dispenses": [serialize_dispense(d) for d in portal_rx.dispenses.select_related("pharmacist")],
    }


# --------------------------------------------------------------------------- registration and approval

@transaction.atomic
def register(data):
    """A pharmacy signs up: the pharmacy (pending), its administrator login and its pharmacists' PRC numbers."""
    from users.models import CustomUser

    name = _text(data, "name", 200)
    lto = _text(data, "fda_lto_number", 40)
    expiry = parse_date(str(data.get("lto_expiry") or ""))
    username = _text(data, "username", 150)
    password = str(data.get("password") or "")
    email = _text(data, "email", 254)
    missing = [label for label, v in (("pharmacy name", name), ("FDA LTO number", lto), ("LTO expiry date", expiry),
                                      ("username", username), ("password", password), ("email", email)) if not v]
    if missing:
        raise PortalError("Enter the " + ", ".join(missing) + ".")
    if expiry < date.today():
        raise PortalError("The FDA License to Operate has expired. Renew it before registering.")
    if len(password) < 10:
        raise PortalError("Use a password of at least 10 characters.")
    if CustomUser.objects.filter(username=username).exists():
        raise PortalError("That username is taken.")
    pharmacists = data.get("pharmacists") or []
    if not isinstance(pharmacists, list) or not any(str(p.get("prc_number") or "").strip() for p in pharmacists if isinstance(p, dict)):
        raise PortalError("List at least one pharmacist with a PRC license number.")
    partner = PartnerPharmacy.objects.create(
        name=name, address=_text(data, "address", 255), city=_text(data, "city", 80), province=_text(data, "province", 80),
        phone=_text(data, "phone", 30), email=email, fda_lto_number=lto, lto_expiry=expiry,
    )
    admin_is_pharmacist = bool(_text(data, "admin_prc_number", 40))
    user = CustomUser.objects.create_user(
        username=username, email=email, password=password, role="ext_pharmacist" if admin_is_pharmacist else "ext_pharmacy_admin",
        first_name=_text(data, "first_name", 150), last_name=_text(data, "last_name", 150),
    )
    PartnerPharmacist.objects.create(partner=partner, user=user, full_name=f"{user.first_name} {user.last_name}".strip() or username,
                                     prc_number=_text(data, "admin_prc_number", 40), is_admin=True)
    for p in pharmacists:
        if isinstance(p, dict) and str(p.get("prc_number") or "").strip():
            PartnerPharmacist.objects.create(partner=partner, full_name=str(p.get("full_name") or "").strip()[:160] or "Pharmacist",
                                             prc_number=str(p.get("prc_number")).strip()[:40])
    return partner, user


ADMIN_ACTIONS = ("approve", "suspend", "reinstate")


@transaction.atomic
def set_status(admin, partner, action, reason=""):
    if getattr(admin, "role", None) != "system_admin":
        raise PortalError("Only a POWER administrator can approve or suspend portal pharmacies.", 403)
    reason = str(reason or "").strip()[:300]
    if action == "approve":
        if partner.status != "pending":
            raise PortalError("Only a pending pharmacy can be approved.", 409)
        partner.status, partner.approved_by, partner.approved_at, partner.status_reason = "approved", admin, timezone.now(), ""
    elif action == "suspend":
        if not reason:
            raise PortalError("Give the reason for the suspension.")
        partner.status, partner.status_reason = "suspended", reason
    elif action == "reinstate":
        if partner.status != "suspended":
            raise PortalError("Only a suspended pharmacy can be reinstated.", 409)
        partner.status, partner.status_reason = "approved", ""
    else:
        raise PortalError("Unknown action.")
    partner.save()
    transport.notify_pharmacy(partner, f"Portal access {partner.get_status_display().lower()}", reason or f"Your pharmacy is now {partner.get_status_display().lower()} on the POWER Pharmacy Portal.")
    return partner


def serialize_partner(p, today=None):
    problem = partner_problem(p, today)
    return {
        "id": p.pk, "name": p.name, "address": p.address, "city": p.city, "province": p.province, "phone": p.phone, "email": p.email,
        "fda_lto_number": p.fda_lto_number, "lto_expiry": p.lto_expiry.isoformat(), "status": p.status,
        "status_label": p.get_status_display(), "status_reason": p.status_reason,
        "lto_expired": p.lto_expiry < (today or date.today()), "can_receive": not problem,
        "pharmacists": [{"full_name": s.full_name, "prc_number": s.prc_number, "has_login": bool(s.user_id)} for s in p.staff.all()],
        "created_at": p.created_at.isoformat(),
    }


def portal_dispensing_for(patient):
    """Partner-pharmacy dispenses for a patient's Med Profile."""
    rows = PortalDispense.objects.filter(portal__prescription__patient=patient).select_related("portal__prescription", "partner", "pharmacist")
    out = []
    for d in rows[:100]:
        rx = d.portal.prescription
        out.append({
            "id": f"portal-{d.pk}",
            "source": d.partner.name,
            "rx_number": f"RX-{rx.pk:06d}",
            "fill_number": d.fill_number,
            "is_refill": d.fill_number > 1,
            "drug": {"generic": d.generic_name, "brand": d.brand_name, "display": f"{d.generic_name} ({d.brand_name})" if d.brand_name else d.generic_name},
            "manufacturer": d.manufacturer,
            "strength": d.strength,
            "quantity": _num(d.quantity),
            "quantity_unit": rx.quantity_unit,
            "is_partial": d.is_partial,
            "dangerous_drug": bool(d.yellow_rx_serial),
            "dispensed": {"name": f"{name_of(d.pharmacist)} · {d.partner.name}", "at": d.dispensed_at.isoformat()},
            "total_amount": None,
        })
    return out
