"""
POWER Pharmacy Portal: a partner pharmacy's own details ("Pharmacy details" in the portal).

* Contact details (street address, barangay, city, province, landline, contact email, mobile number for SMS) are
  changed by the pharmacy's administrator and apply at once.
* Regulatory details (the registered pharmacy name, the FDA License to Operate number and its expiry) are submitted
  for review: nothing changes until a POWER System Admin approves them on Pharmacy > eRx Routing. A pharmacy whose LTO
  has expired stays blocked until the renewed LTO is approved. One regulatory change waits at a time.
* Every change (who, when, old -> new, and the review) is a PartnerPharmacyChange: the pharmacy's history.
* Only that pharmacy's administrator edits; a suspended pharmacy can view but not edit.
The clinic directories that list the pharmacy are kept in step with its name, address, phone and LTO.
"""

from datetime import date

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from . import portal as pt
from . import portal_transport as transport
from .models import PartnerPharmacy, PartnerPharmacyChange
from .services import name_of

CONTACT = ("address", "barangay", "city", "province", "phone", "email", "sms_mobile")
REGULATORY = ("name", "fda_lto_number", "lto_expiry")
LABELS = {
    "address": "Street address", "barangay": "Barangay", "city": "City / municipality", "province": "Province",
    "phone": "Phone (landline)", "email": "Contact email", "sms_mobile": "Mobile number for SMS",
    "name": "Registered pharmacy name", "fda_lto_number": "FDA LTO number", "lto_expiry": "LTO valid until",
}
LIMITS = {"address": 255, "barangay": 100, "city": 80, "province": 80, "phone": 30, "email": 254, "name": 200, "fda_lto_number": 40}


def _value(partner, field):
    v = getattr(partner, field)
    return v.isoformat() if isinstance(v, date) else (v or "")


def _clean(field, raw):
    """A field's new value from the form (raises PortalError with a message)."""
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email

    if field == "sms_mobile":
        return pt.normalize_ph_mobile(raw)
    if field == "lto_expiry":
        d = parse_date(str(raw or ""))
        if d is None:
            raise pt.PortalError("Enter the LTO expiry date.")
        if d < date.today():
            raise pt.PortalError("That LTO has already expired. Enter the renewed LTO's expiry date.")
        return d.isoformat()
    value = str(raw or "").strip()[: LIMITS.get(field, 255)]
    if field in ("name", "fda_lto_number") and not value:
        raise pt.PortalError(f"The {LABELS[field].lower()} can't be blank.")
    if field == "email" and value:
        try:
            validate_email(value)
        except ValidationError:
            raise pt.PortalError("Enter a valid contact email.")
    return value


def can_edit(user, partner):
    return pt.can_manage_staff(user) and partner.status != "suspended"


def pending_change(partner):
    return partner.changes.filter(status="pending").select_related("user").first()


def _who(user):
    """A portal user by their name on the pharmacy's staff list; anyone else by their POWER name."""
    if user is None:
        return ""
    member = getattr(user, "portal_membership", None) if hasattr(user, "portal_membership") else None
    return member.full_name if member is not None else name_of(user)


def serialize_change(c):
    return {
        "id": c.pk, "kind": c.kind, "status": c.status, "status_label": c.get_status_display(), "at": c.created_at.isoformat(),
        "user": _who(c.user), "changes": c.changes,
        "labels": {f: LABELS.get(f, f) for f in c.changes},
        "reviewed_by": name_of(c.reviewed_by) if c.reviewed_by_id else "", "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
        "review_note": c.review_note,
    }


def details(user, partner):
    pending = pending_change(partner)
    return {
        "pharmacy": {**{f: _value(partner, f) for f in CONTACT + REGULATORY}, "status": partner.status,
                     "status_label": partner.get_status_display(), "problem": pt.partner_problem(partner)},
        "contact_fields": list(CONTACT), "regulatory_fields": list(REGULATORY), "labels": LABELS,
        "can_edit": can_edit(user, partner),
        "pending": serialize_change(pending) if pending else None,
        "history": [serialize_change(c) for c in partner.changes.select_related("user", "reviewed_by")[:50]],
    }


def _sync_directories(partner):
    """Clinic pharmacy directories that list this partner show its current name, address, phone and LTO."""
    from appointments.models import Pharmacy

    street = ", ".join(x for x in (partner.address, partner.barangay) if x)[:255]
    Pharmacy.objects.filter(portal_link__partner=partner).update(
        name=partner.name, address=street, city=partner.city, phone=partner.phone, fda_lto_number=partner.fda_lto_number,
    )


@transaction.atomic
def submit(user, partner, data):
    """
    The pharmacy administrator's edit: contact fields apply now; regulatory fields wait for POWER.
    Returns (applied_change or None, pending_change or None).
    """
    partner = PartnerPharmacy.objects.select_for_update().get(pk=partner.pk)
    if not pt.can_manage_staff(user):
        raise pt.PortalError("Only your pharmacy's administrator can change the pharmacy details.", 403)
    if partner.status == "suspended":
        raise pt.PortalError("Your pharmacy is suspended: its details can't be changed. Contact POWER.", 403)
    contact, regulatory = {}, {}
    for field in CONTACT + REGULATORY:
        if field in data:
            new = _clean(field, data[field])
            old = _value(partner, field)
            if new != old:
                (contact if field in CONTACT else regulatory)[field] = [old, new]
    if regulatory and pending_change(partner):
        raise pt.PortalError("A change to the registered name or LTO is already waiting for POWER's review.", 409)
    applied = pending = None
    if contact:
        for field, (_old, new) in contact.items():
            setattr(partner, field, new)
        partner.save(update_fields=list(contact))
        _sync_directories(partner)
        applied = PartnerPharmacyChange.objects.create(partner=partner, user=user, kind="contact", status="applied", changes=contact)
    if regulatory:
        pending = PartnerPharmacyChange.objects.create(partner=partner, user=user, kind="regulatory", status="pending", changes=regulatory)
        transaction.on_commit(lambda: _tell_power_admins(partner, pending))
    if contact or regulatory:
        pt.log_access(user, "pharmacy_details_changed", None, None, {"applied": sorted(contact), "pending": sorted(regulatory)})
    return applied, pending


def _tell_power_admins(partner, change):
    from communicator.utils import send_email
    from users.models import CustomUser

    lines = "\n".join(f"{LABELS.get(f, f)}: {old or '—'} -> {new}" for f, (old, new) in change.changes.items())
    body = (f"{partner.name} asked to change its registered details on the POWER Pharmacy Portal:\n\n{lines}\n\n"
            "Review it in POWER: Patients > Pharmacy > eRx Routing.")
    for address in CustomUser.objects.filter(role="system_admin", is_active=True).exclude(email="").values_list("email", flat=True):
        try:
            send_email(address, f"Pharmacy details waiting for review: {partner.name}", body)
        except Exception:  # noqa: BLE001 - email trouble must not undo the request
            import logging

            logging.getLogger(__name__).exception("pharmacy portal: details-review email failed")


@transaction.atomic
def review(admin, change, decision, note=""):
    """A POWER System Admin approves (applies) or rejects a pending regulatory change."""
    if getattr(admin, "role", None) != "system_admin":
        raise pt.PortalError("Only a POWER System Admin can review pharmacy details.", 403)
    change = PartnerPharmacyChange.objects.select_for_update().select_related("partner").get(pk=change.pk)
    if change.status != "pending":
        raise pt.PortalError("This change was already reviewed.", 409)
    note = str(note or "").strip()[:300]
    if decision == "approve":
        partner = PartnerPharmacy.objects.select_for_update().get(pk=change.partner_id)
        for field, (_old, new) in change.changes.items():
            setattr(partner, field, parse_date(new) if field == "lto_expiry" else new)
        partner.save(update_fields=list(change.changes))
        _sync_directories(partner)
        change.status = "approved"
    elif decision == "reject":
        if not note:
            raise pt.PortalError("Give the reason for rejecting the change.")
        change.status = "rejected"
    else:
        raise pt.PortalError("Unknown decision.")
    change.reviewed_by, change.reviewed_at, change.review_note = admin, timezone.now(), note
    change.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note"])
    partner = change.partner
    what = ", ".join(LABELS.get(f, f) for f in change.changes)
    transport.notify_pharmacy(
        partner, f"Pharmacy details {change.status}",
        f"POWER {change.status} your change to: {what}." + (f"\n\nNote: {note}" if note else ""),
    )
    return change
