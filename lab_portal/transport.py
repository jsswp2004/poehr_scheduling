"""
How people hear about lab requests: the partner lab (portal notice, email, SMS), the ordering provider (POWER inbox,
email, SMS for critical results), and the patient (SMS).

No text message ever carries a patient's name, a test name or a value (Data Privacy Act RA 10173 / HIPAA minimum
necessary): only the request number, who it is from and where to look. Every SMS goes through POWER's existing
Twilio sender (communicator.utils.send_sms), which logs it in MessageLog and honours STOP opt-outs. A failed email or
SMS is logged and never stops the clinical work.
"""

import logging

from django.conf import settings
from django.db import transaction

log = logging.getLogger(__name__)


def portal_link():
    base = getattr(settings, "FRONTEND_BASE_URL", "https://www.powerhealthit.com").rstrip("/")
    return f"{base}/lab-portal"


def _sms(number, text, organization=None):
    if not number:
        return False
    from communicator.utils import send_sms

    try:
        send_sms(number, text, organization=organization)
        return True
    except Exception:  # noqa: BLE001 - an SMS problem (or an opt-out) must never stop the lab work
        log.exception("lab portal: SMS failed")
        return False


def _email(address, subject, body, organization=None):
    if not address:
        return
    from communicator.utils import send_email

    try:
        send_email(address, subject, body, organization=organization)
    except Exception:  # noqa: BLE001
        log.exception("lab portal: email to %s failed", address)


# --------------------------------------------------------------------------- the lab

def staff_mobiles(partner):
    out = []
    for member in partner.staff.filter(is_active=True).exclude(mobile=""):
        if member.mobile not in out:
            out.append(member.mobile)
    return out


def staff_addresses(partner):
    out = []
    for member in partner.staff.filter(is_active=True).select_related("user"):
        address = (member.email or (member.user.email if member.user_id and member.user.is_active else "") or "").strip()
        if address and address.lower() not in {a.lower() for a in out}:
            out.append(address)
    return out


def notify_lab(partner, title, body, request=None):
    """Portal notice plus an email to each active staff member (the lab's own email when none has one)."""
    from .models import LabPortalNotice

    LabPortalNotice.objects.create(partner=partner, request=request, title=title[:200], body=body)
    for address in staff_addresses(partner) or ([partner.email] if partner.email else []):
        _email(address, f"POWER Lab Portal: {title}", body)


def sms_lab(partner, text, organization=None):
    """A text to each active staff member's mobile, or the lab's SMS number when none has one."""
    numbers = staff_mobiles(partner) or ([partner.sms_mobile] if partner.sms_mobile else [])
    return [n for n in numbers if _sms(n, text, organization)]


def tell_lab_new(requests):
    """One portal notice per request; ONE text for everything sent together (not one per test)."""
    if not requests:
        return
    first = requests[0]
    for req in requests:
        stat = "STAT " if req.priority == "stat" else ""
        names = ", ".join(i.order.orderable_name for i in req.items.select_related("order"))
        notify_lab(req.partner, f"New {stat}lab request {req.number}",
                   f"A new lab request from {req.organization.name} is waiting in your portal: {names}.", req)
    numbers = ", ".join(r.number for r in requests)
    stat = "STAT " if any(r.priority == "stat" for r in requests) else ""
    where = f" Collect at {first.location}." if first.collection == "lab_at_bedside" and first.location else ""
    text = f"POWER Labs: New {stat}lab request {numbers} from {first.organization.name}.{where} Open the portal: {portal_link()}"
    partner, org = first.partner, first.organization
    transaction.on_commit(lambda: sms_lab(partner, text, org))


def tell_lab_cancelled(lab_request):
    req = lab_request
    notify_lab(req.partner, f"Lab request {req.number} cancelled",
               f"{req.organization.name} cancelled {req.number}. Do not collect.\n\nReason: {req.cancel_reason}", req)
    text = f"POWER Labs: {req.number} was cancelled by {req.organization.name}. Do not collect."
    partner, org = req.partner, req.organization
    transaction.on_commit(lambda: sms_lab(partner, text, org))


# --------------------------------------------------------------------------- the clinic

def notify_provider(lab_request, event, title, body, kind="notice", sms_text=""):
    """POWER inbox alert (and email) to the ordering provider; an SMS too when sms_text is given."""
    from appointments import inbox

    req = lab_request
    doc = req.ordering_provider
    # one alert per request and event (the inbox keeps only one per source and kind)
    inbox.notify(doc, title[:200], body, kind=kind, patient=req.patient, source_type=f"lab_request_{event}"[:30],
                 source_id=req.pk, organization=req.organization)
    _email(doc.email, f"POWER: {title}", body, organization=req.organization)
    if sms_text:
        number = getattr(doc, "phone_number", "") or ""
        org = req.organization
        transaction.on_commit(lambda: _sms(number, sms_text, org))


def critical_sms_text(lab_request):
    return (f"POWER CRITICAL: Critical lab value for a patient of yours from {lab_request.partner.name}, "
            f"{lab_request.number}. Open POWER now.")


def result_sms_text(lab_request):
    return f"POWER: New lab results from {lab_request.partner.name} ({lab_request.number}). Review in POWER."


# --------------------------------------------------------------------------- the patient

def patient_mobile(patient):
    profile = getattr(patient, "patient_profile", None)
    return (getattr(profile, "phone_number", "") or getattr(patient, "phone_number", "") or "").strip()


def text_patient(lab_request, text):
    number = patient_mobile(lab_request.patient)
    org = lab_request.organization
    if number:
        transaction.on_commit(lambda: _sms(number, text, org))
    return bool(number)


def patient_request_text(requests, partner=None):
    """One text for everything ordered together: where to go, fasting, and the code(s) to show."""
    first = requests[0]
    clinic = first.organization.name
    prep = " Fast 10-12 hours before (water is OK)." if any(r.fasting_required for r in requests) else ""
    codes = ", ".join(r.claim_code for r in requests)
    show = f"Show code {codes}." if len(requests) == 1 else f"Show codes {codes}."
    if partner is not None:
        where = partner.name + (f", {partner.address}" if partner.address else "") + (f" ({partner.hours})" if partner.hours else "")
        return f"{clinic}: Your lab tests are ready at {where}.{prep} {show} Reply STOP to opt out."
    return f"{clinic}: Your lab tests can be done at any POWER partner lab.{prep} {show} Reply STOP to opt out."


def patient_reminder_text(lab_request):
    return f"{lab_request.organization.name}: Reminder: your lab tests (code {lab_request.claim_code}) are still waiting."


def patient_results_text(lab_request):
    return (f"{lab_request.organization.name}: Your lab results from {lab_request.partner.name} are back and are with "
            "your doctor. We will contact you about them. Reply STOP to opt out.")


def patient_cancelled_text(lab_request):
    return f"{lab_request.organization.name}: Your lab request (code {lab_request.claim_code}) was cancelled. No need to go to the lab."
