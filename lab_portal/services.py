"""
POWER Lab Portal: the rules.

Clinic side
    A provider (or nurse / administrator) sends SIGNED laboratory orders to a lab from the clinic's lab directory, or
    lets the patient choose ("patient chooses": any approved partner lab claims it with the claim code). By default
    each test becomes its own request (requisition); `combine` puts them all on one. Each request has a claim code.
    An order that went to a partner lab is marked interface_status "sent", so the HL7 interface never sends it too.

At the lab
    new --accept--> accepted --collect--> collected --enter results--> in_process --release--> preliminary | final
    new --decline (reason)--> declined (back with the provider; the orders can be sent again)
    unclaimed --claim (code + birthdate + mobile last 4)--> accepted   (also claims the other tests sent with it)
    the provider cancels --> cancelled          not collected in 30 days --> expired (reminder texts at day 3 and 7)

Releasing results files one appointments.LabReport per test (source "partner_lab") on the patient's chart, linked
to its order (final completes the order), with the lab's signed PDF attached, and alerts the ordering provider
through the existing Lab Results inbox. A critical value (LL / HH) can only be released after the lab has logged
its phone call with read-back; in the Philippines it must be released by a pathologist (routine results may be
released by the medical technologist). The patient is texted that results are back (never the values).

Data Privacy Act (RA 10173) / HIPAA: a lab sees the minimum it needs, and every view and action is logged.
"""

import hashlib
import secrets
from datetime import date, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from appointments import lab_results
from appointments import orders_workflow as ow
from appointments.lab_intake import _complete_order
from appointments.models import LabReport, LabReportFileData, Order

from . import transport
from .models import (
    OPEN_STATUSES,
    REQUEST_STATUSES,
    ClinicLab,
    CriticalResultCall,
    LabPortalAccessLog,
    LabRequest,
    LabRequestEvent,
    LabRequestFile,
    LabRequestItem,
    PartnerLab,
    PartnerLabStaff,
)

PORTAL_ROLES = ("ext_lab_tech", "ext_lab_pathologist", "ext_lab_admin")
WORKER_ROLES = ("ext_lab_tech", "ext_lab_pathologist")
CLINIC_ROLES = ("doctor", "nurse", "admin", "system_admin")
DIRECTORY_ROLES = ("admin", "system_admin")
STATUS_LABELS = dict(REQUEST_STATUSES)
TABS = ("new", "waiting", "collected", "in_process", "to_release", "history")
CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I
CLAIM_FAILURES_PER_HOUR = 5
EXPIRE_DAYS = 30
REMINDER_DAYS = (3, 7)
CRITICAL_FLAGS = ("LL", "HH")
MAX_FILE_BYTES = 10 * 1024 * 1024
ACCESS_LOG_RETENTION_DAYS = 5 * 365 + 1


class LabPortalError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _setting(name, default):
    return getattr(settings, name, default)


def _text(data, key, n=300):
    return str((data or {}).get(key) or "").strip()[:n]


def _yes(data, key):
    v = (data or {}).get(key)
    return v.strip().lower() in ("true", "yes", "1", "on") if isinstance(v, str) else v is True


def name_of(user):
    return (f"{user.first_name} {user.last_name}".strip() or user.username) if user else ""


def chart_name(user):
    return f"{user.last_name}, {user.first_name}".strip(", ") or user.username


def age_years(dob, today=None):
    if not dob:
        return None
    today = today or date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def normalize_mobile(raw, country="PH"):
    """A mobile number as +639XXXXXXXXX (PH) or +1XXXXXXXXXX (US); '' when blank. Raises when it isn't one."""
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if not digits:
        return ""
    if country == "US":
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        if len(digits) != 10:
            raise LabPortalError("Enter a US mobile number, for example (718) 555-0142.")
        return f"+1{digits}"
    if digits.startswith("63"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 10 or not digits.startswith("9"):
        raise LabPortalError("Enter a Philippine mobile number, for example 0917 123 4567.")
    return f"+63{digits}"


# --------------------------------------------------------------------------- partner labs and their staff

def partner_problem(partner, today=None):
    """Why this lab can't work right now, or "" when it can."""
    today = today or date.today()
    if partner is None:
        return "Your account is not linked to a laboratory."
    if partner.status == "pending":
        return "Your laboratory is waiting for approval by POWER."
    if partner.status == "suspended":
        return "Your laboratory has been suspended on the POWER Lab Portal." + (f" {partner.status_reason}" if partner.status_reason else "")
    if partner.license_expiry < today:
        what = "CLIA certificate" if partner.country == "US" else "DOH License to Operate"
        return f"Your {what} expired on {partner.license_expiry.isoformat()}. Renew it to continue."
    return ""


def membership(user):
    return getattr(user, "lab_portal_membership", None) if getattr(user, "role", None) in PORTAL_ROLES else None


def partner_of(user):
    m = membership(user)
    return m.partner if m is not None and m.is_active else None


def is_pathologist(user):
    m = membership(user)
    return getattr(user, "role", None) == "ext_lab_pathologist" or bool(m and m.is_pathologist)


def can_manage_staff(user):
    m = membership(user)
    return getattr(user, "role", None) == "ext_lab_admin" or bool(m and m.is_admin)


def log_access(user, action, req=None, request=None, detail=None):
    ip = ""
    if request is not None:
        ip = (request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR", ""))[:64]
    LabPortalAccessLog.objects.create(user=user, partner=partner_of(user), request=req, action=action[:40], detail=detail or {}, ip=ip)


def purge_access_log(now=None, dry_run=False):
    cutoff = (now or timezone.now()) - timedelta(days=int(_setting("LAB_PORTAL_LOG_RETENTION_DAYS", ACCESS_LOG_RETENTION_DAYS)))
    old = LabPortalAccessLog.objects.filter(created_at__lt=cutoff)
    count = old.count()
    if count and not dry_run:
        old.delete()
    return count


def _event(req, event_type, user=None, detail=None, from_status=None):
    LabRequestEvent.objects.create(request=req, event_type=event_type, from_status=from_status if from_status is not None else req.status,
                                   to_status=req.status, user=user if getattr(user, "pk", None) else None, detail=detail or {})


# --------------------------------------------------------------------------- registration and approval

def register(data):
    """A lab signs up: the lab (pending), its administrator login and its staff. POWER approves it."""
    from users.models import CustomUser

    country = "US" if _text(data, "country", 2).upper() == "US" else "PH"
    name = _text(data, "name", 200)
    license_number = _text(data, "license_number", 40)
    expiry = parse_date(str(data.get("license_expiry") or ""))
    username = _text(data, "username", 150)
    password = str(data.get("password") or "")
    email = _text(data, "email", 254)
    what = "CLIA number" if country == "US" else "DOH License to Operate number"
    missing = [label for label, v in (("laboratory name", name), (what, license_number), ("license expiry date", expiry),
                                      ("username", username), ("password", password), ("email", email)) if not v]
    if missing:
        raise LabPortalError("Enter the " + ", ".join(missing) + ".")
    if expiry < date.today():
        raise LabPortalError("The laboratory license has expired. Renew it before registering.")
    if len(password) < 10:
        raise LabPortalError("Use a password of at least 10 characters.")
    if CustomUser.objects.filter(username=username).exists():
        raise LabPortalError("That username is taken.")
    sms_mobile = normalize_mobile(data.get("sms_mobile"), country)
    admin_mobile = normalize_mobile(data.get("admin_mobile"), country)
    staff = data.get("staff") or []
    if not isinstance(staff, list):
        staff = []
    staff_mobiles = [normalize_mobile(s.get("mobile"), country) if isinstance(s, dict) else "" for s in staff]
    partner = PartnerLab.objects.create(
        name=name, country=country, address=_text(data, "address", 255), city=_text(data, "city", 80),
        province=_text(data, "province", 80), postal_code=_text(data, "postal_code", 12), phone=_text(data, "phone", 30),
        email=email, sms_mobile=sms_mobile, license_number=license_number, license_expiry=expiry,
        license_category=_text(data, "license_category", 80), head_name=_text(data, "head_name", 160),
        head_license=_text(data, "head_license", 40), hours=_text(data, "hours", 120),
        offers_walk_in=not data.get("offers_walk_in") is False, offers_bedside=_yes(data, "offers_bedside"),
        offers_courier=_yes(data, "offers_courier"), offers_home_service=_yes(data, "offers_home_service"),
    )
    admin_license = _text(data, "admin_license", 40)
    admin_is_pathologist = _yes(data, "admin_is_pathologist")
    role = "ext_lab_pathologist" if admin_is_pathologist else ("ext_lab_tech" if admin_license else "ext_lab_admin")
    user = CustomUser.objects.create_user(username=username, email=email, password=password, role=role,
                                          first_name=_text(data, "first_name", 150), last_name=_text(data, "last_name", 150))
    PartnerLabStaff.objects.create(partner=partner, user=user, full_name=name_of(user), license_number=admin_license, email=email,
                                   mobile=admin_mobile, is_admin=True, is_pathologist=admin_is_pathologist,
                                   can_release=bool(admin_license))
    for s, mobile in zip(staff, staff_mobiles):
        if isinstance(s, dict) and str(s.get("full_name") or "").strip():
            PartnerLabStaff.objects.create(partner=partner, full_name=str(s["full_name"]).strip()[:160],
                                           license_number=str(s.get("license_number") or "").strip()[:40],
                                           email=str(s.get("email") or "").strip()[:254], mobile=mobile,
                                           is_pathologist=_yes(s, "is_pathologist"), can_release=bool(str(s.get("license_number") or "").strip()))
    transaction.on_commit(lambda: _tell_power_admins(partner))
    return partner, user


def _tell_power_admins(partner):
    from users.models import CustomUser

    what = "CLIA" if partner.country == "US" else "DOH LTO"
    body = (f"{partner.name} ({partner.city or 'no city given'}) registered on the POWER Lab Portal and is waiting for approval.\n\n"
            f"{what} {partner.license_number}, valid until {partner.license_expiry.isoformat()}.")
    for address in CustomUser.objects.filter(role="system_admin", is_active=True).exclude(email="").values_list("email", flat=True):
        transport._email(address, f"Laboratory waiting for approval: {partner.name}", body)


ADMIN_ACTIONS = ("approve", "suspend", "reinstate")


@transaction.atomic
def set_status(admin, partner, action, reason=""):
    if getattr(admin, "role", None) != "system_admin":
        raise LabPortalError("Only a POWER administrator can approve or suspend partner labs.", 403)
    if action not in ADMIN_ACTIONS:
        raise LabPortalError("Unknown action.")
    reason = str(reason or "").strip()[:300]
    partner = PartnerLab.objects.select_for_update().get(pk=partner.pk)
    if action in ("approve", "reinstate"):
        partner.status, partner.status_reason = "approved", ""
        if action == "approve" or partner.approved_at is None:
            partner.approved_by, partner.approved_at = admin, timezone.now()
        title = "Your laboratory is approved on the POWER Lab Portal"
    else:
        if not reason:
            raise LabPortalError("Give the reason for suspending.")
        partner.status, partner.status_reason = "suspended", reason
        title = "Your laboratory was suspended on the POWER Lab Portal"
    partner.save()
    transport.notify_lab(partner, title, reason or "You can now receive lab requests from POWER clinics.")
    return partner


# --------------------------------------------------------------------------- the clinic's lab directory

def serialize_partner(p):
    return {
        "id": p.pk, "name": p.name, "country": p.country, "address": p.address, "city": p.city, "province": p.province,
        "phone": p.phone, "email": p.email, "sms_mobile": p.sms_mobile, "license_number": p.license_number,
        "license_expiry": p.license_expiry.isoformat(), "license_category": p.license_category, "head_name": p.head_name,
        "head_license": p.head_license, "hours": p.hours, "offers_walk_in": p.offers_walk_in, "offers_bedside": p.offers_bedside,
        "offers_courier": p.offers_courier, "offers_home_service": p.offers_home_service, "status": p.status,
        "status_reason": p.status_reason, "problem": partner_problem(p),
    }


def serialize_clinic_lab(c):
    p = c.partner
    return {
        "id": c.pk, "name": c.name, "mode": c.mode, "mode_label": c.get_mode_display(), "address": c.address, "phone": c.phone,
        "note": c.note, "is_default": c.is_default, "accepts_inpatient": c.accepts_inpatient, "is_active": c.is_active,
        "partner": {"id": p.pk, "name": p.name, "hours": p.hours, "offers_bedside": p.offers_bedside,
                    "offers_courier": p.offers_courier, "problem": partner_problem(p)} if p else None,
    }


def _org_of(user):
    org = getattr(user, "organization", None)
    if org is None:
        raise LabPortalError("Choose an organization first.", 403)
    return org


def save_clinic_lab(user, data, clinic_lab=None):
    if getattr(user, "role", None) not in DIRECTORY_ROLES:
        raise LabPortalError("Only an administrator can change the lab directory.", 403)
    org = _org_of(user)
    if clinic_lab is not None and clinic_lab.organization_id != org.pk:
        raise LabPortalError("Lab not found.", 404)
    c = clinic_lab or ClinicLab(organization=org)
    if "name" in data or clinic_lab is None:
        c.name = _text(data, "name", 200)
        if not c.name:
            raise LabPortalError("Enter the lab's name.")
    if "mode" in data:
        mode = _text(data, "mode", 20)
        if mode not in dict(ClinicLab.MODE_CHOICES):
            raise LabPortalError("Unknown mode.")
        c.mode = mode
    if "partner" in data:
        pid = data.get("partner")
        c.partner = PartnerLab.objects.filter(pk=pid, status="approved").first() if pid else None
        if pid and c.partner is None:
            raise LabPortalError("Choose an approved partner lab.")
    if c.mode == "partner_portal" and c.partner is None:
        raise LabPortalError("Link this entry to an approved partner lab on the POWER Lab Portal.")
    for field, n in (("address", 255), ("phone", 30), ("note", 200)):
        if field in data:
            setattr(c, field, _text(data, field, n))
    for field in ("is_default", "accepts_inpatient", "is_active"):
        if field in data:
            setattr(c, field, _yes(data, field))
    with transaction.atomic():
        c.save()
        if c.is_default:
            ClinicLab.objects.filter(organization=org, is_default=True).exclude(pk=c.pk).update(is_default=False)
    return c


# --------------------------------------------------------------------------- sending orders to a lab

def new_claim_code():
    while True:
        code = "".join(secrets.choice(CLAIM_ALPHABET) for _ in range(8))
        if not LabRequest.objects.filter(claim_code=code).exists():
            return code


def normalize_claim_code(raw):
    from urllib.parse import parse_qs, urlparse

    text = str(raw or "").strip()
    if "code=" in text:
        found = parse_qs(urlparse(text).query or text.split("?", 1)[-1]).get("code")
        text = found[0] if found else ""
    elif "://" in text:
        return ""
    return text.upper().replace("-", "").replace(" ", "")


def claim_link(code):
    return f"{transport.portal_link()}/claim?code={code}"


@transaction.atomic
def create_requests(user, data):
    """
    Send signed lab orders to a lab. data: orders [ids], clinic_lab (id, or empty for "patient chooses"), combine,
    care_setting, collection, location, priority, fasting_required, note_to_lab, collect_by.
    """
    if getattr(user, "role", None) not in CLINIC_ROLES:
        raise LabPortalError("Only a provider, nurse or administrator can send lab orders to a lab.", 403)
    org = _org_of(user)
    ids = [int(i) for i in (data.get("orders") or []) if str(i).isdigit()]
    if not ids:
        raise LabPortalError("Choose the lab orders to send.")
    orders = list(Order.objects.select_for_update(of=("self",)).filter(pk__in=ids, organization=org)
                  .select_related("patient", "ordering_provider").order_by("id"))
    if len(orders) != len(set(ids)):
        raise LabPortalError("Some of those orders were not found.", 404)
    if len({o.patient_id for o in orders}) != 1:
        raise LabPortalError("Send one patient's orders at a time.")
    for o in orders:
        if o.orderable_category != "laboratory":
            raise LabPortalError(f"{o.orderable_name} is not a laboratory order.")
        if o.status not in ("active", "in_progress"):
            raise LabPortalError(f"{o.orderable_name} must be signed (active) before it can go to a lab.", 409)
        if o.interface_status != "not_sent":
            raise LabPortalError(f"{o.orderable_name} was already sent to a lab.", 409)
    if LabRequestItem.objects.filter(order__in=orders, request__status__in=OPEN_STATUSES).exists():
        raise LabPortalError("One of these orders is already on an open lab request.", 409)

    care = "inpatient" if _text(data, "care_setting") == "inpatient" else "outpatient"
    collection = _text(data, "collection", 20) or "at_lab"
    if collection not in dict(LabRequest.COLLECTION_CHOICES):
        raise LabPortalError("Unknown collection choice.")
    if care == "outpatient":
        collection = "at_lab"
    clinic_lab, partner = None, None
    if data.get("clinic_lab"):
        clinic_lab = ClinicLab.objects.filter(pk=data.get("clinic_lab"), organization=org, is_active=True).select_related("partner").first()
        if clinic_lab is None:
            raise LabPortalError("Choose a lab from your clinic's lab directory.")
        if clinic_lab.mode != "partner_portal" or clinic_lab.partner is None:
            raise LabPortalError(f"{clinic_lab.name} is not on the POWER Lab Portal.")
        partner = clinic_lab.partner
        problem = partner_problem(partner)
        if problem:
            raise LabPortalError(f"{partner.name} can't receive lab requests right now.", 409)
        if care == "inpatient" and not clinic_lab.accepts_inpatient:
            raise LabPortalError(f"{clinic_lab.name} is not set up for inpatient requests.")
        if collection == "lab_at_bedside" and not partner.offers_bedside:
            raise LabPortalError(f"{partner.name} does not collect at the bedside.")
        if collection == "hospital_collects" and not partner.offers_courier:
            raise LabPortalError(f"{partner.name} does not pick up specimens.")
    elif care == "inpatient":
        raise LabPortalError("Choose the lab for an inpatient request.")

    priority = _text(data, "priority", 8)
    if priority not in dict(LabRequest.PRIORITY_CHOICES):
        priority = "stat" if any(o.priority == "stat" for o in orders) else ("urgent" if any(o.priority == "urgent" for o in orders) else "routine")
    collect_by = parse_date(str(data.get("collect_by") or "")) if data.get("collect_by") else None
    now = timezone.now()
    groups = [orders] if _yes(data, "combine") or len(orders) == 1 else [[o] for o in orders]
    group_key = secrets.token_hex(6) if len(groups) > 1 else ""
    created = []
    for group in groups:
        req = LabRequest.objects.create(
            organization=org, patient=group[0].patient, ordering_provider=group[0].ordering_provider, created_by=user,
            clinic_lab=clinic_lab, partner=partner, group_key=group_key, claim_code=new_claim_code(),
            how="routed" if partner else "", status="new" if partner else "unclaimed", care_setting=care,
            collection=collection, location=_text(data, "location", 120), priority=priority,
            fasting_required=_yes(data, "fasting_required"), note_to_lab=_text(data, "note_to_lab", 500), collect_by=collect_by,
            locked_at=now if partner else None, expires_at=now + timedelta(days=EXPIRE_DAYS),
        )
        for o in group:
            LabRequestItem.objects.create(request=req, order=o)
            Order.objects.filter(pk=o.pk).update(interface_status="sent", interface_updated_at=now)
            ow.log_event(o, "sent_to_partner_lab", user, detail={"request": req.number, "lab": partner.name if partner else "patient chooses"})
        _event(req, "routed" if partner else "created", user, {"lab": partner.name if partner else ""}, from_status="")
        created.append(req)
    if partner is not None:
        transport.tell_lab_new(created)
    if care == "outpatient":
        transport.text_patient(created[0], transport.patient_request_text(created, partner))
    return created


@transaction.atomic
def cancel_request(user, req, reason):
    if getattr(user, "role", None) not in CLINIC_ROLES:
        raise LabPortalError("Only a provider, nurse or administrator can cancel a lab request.", 403)
    req = LabRequest.objects.select_for_update(of=("self",)).get(pk=req.pk)
    if req.organization_id != getattr(user, "organization_id", None):
        raise LabPortalError("Lab request not found.", 404)
    reason = str(reason or "").strip()[:300]
    if not reason:
        raise LabPortalError("Give the reason for cancelling.")
    if req.status not in ("unclaimed", "new", "accepted", "collected", "in_process"):
        raise LabPortalError("Only a request that has no results yet can be cancelled.", 409)
    before = req.status
    req.status, req.cancel_reason = "cancelled", reason
    req.save(update_fields=["status", "cancel_reason", "updated_at"])
    _close_items(req, user, "cancelled")
    _event(req, "cancelled", user, {"reason": reason}, from_status=before)
    if req.partner_id:
        transport.tell_lab_cancelled(req)
    if req.care_setting == "outpatient" and before in ("unclaimed", "new", "accepted"):
        transport.text_patient(req, transport.patient_cancelled_text(req))
    return req


def _close_items(req, user, why):
    """The request ended without results: its orders can be sent to a lab again."""
    for item in req.items.select_related("order").filter(status="pending"):
        item.status = "cancelled"
        item.save(update_fields=["status"])
        Order.objects.filter(pk=item.order_id, interface_status="sent").update(interface_status="not_sent", interface_updated_at=timezone.now())
        ow.log_event(item.order, f"partner_lab_{why}"[:30], user, detail={"request": req.number})


# --------------------------------------------------------------------------- what the lab sees

def _mine(user):
    partner = partner_of(user)
    return LabRequest.objects.filter(partner=partner) if partner is not None else LabRequest.objects.none()


def request_for(user, pk):
    return (_mine(user).select_related("patient", "patient__patient_profile", "ordering_provider", "organization", "partner")
            .filter(pk=pk).first())


def _has_drafts(qs):
    return qs.filter(items__draft_saved_at__isnull=False, items__status="pending").distinct()


def tab_queryset(user, tab):
    qs = _mine(user).select_related("patient", "patient__patient_profile", "ordering_provider", "organization")
    if tab == "new":
        return qs.filter(status="new")
    if tab == "waiting":
        return qs.filter(status="accepted")
    if tab == "collected":
        return qs.filter(status="collected")
    if tab == "in_process":
        return qs.filter(status__in=("in_process", "preliminary")).exclude(pk__in=_has_drafts(qs).values("pk"))
    if tab == "to_release":
        return _has_drafts(qs.filter(status__in=("collected", "in_process", "preliminary")))
    return qs.filter(status__in=("final", "declined", "cancelled", "expired"))


def counts(user):
    return {tab: tab_queryset(user, tab).count() for tab in TABS if tab != "history"}


def _provider_license(user, country):
    profile = getattr(user, "prescriber_profile", None)
    if country == "US":
        return {"npi": getattr(user, "npi", "") or "", "license": getattr(profile, "license_number", "") or ""}
    return {"prc": getattr(profile, "license_number", "") or ""}


def _flags(raw_items):
    return [str(i.get("abnormal_flag") or "").upper() for i in raw_items or []]


def draft_has_critical(req):
    for item in req.items.filter(status="pending").exclude(draft={}):
        try:
            prepared = lab_results.prepare_items(item.draft.get("items") or [])
        except lab_results.LabResultError:
            continue
        if any(p["abnormal_flag"] in CRITICAL_FLAGS for p in prepared):
            return True
    return False


def serialize(req, detail=False):
    """The minimum a lab needs: patient name, birthdate, age, sex and mobile last 4, the tests and who ordered them."""
    patient = req.patient
    profile = getattr(patient, "patient_profile", None)
    dob = getattr(profile, "date_of_birth", None)
    items = list(req.items.select_related("order", "lab_report"))
    data = {
        "id": req.pk, "number": req.number, "status": req.status, "status_label": STATUS_LABELS.get(req.status, req.status),
        "how": req.how, "priority": req.priority, "care_setting": req.care_setting, "collection": req.collection,
        "collection_label": req.get_collection_display(), "location": req.location,
        "patient": {"name": chart_name(patient), "birthdate": dob.isoformat() if dob else None, "age": age_years(dob),
                    "sex": getattr(profile, "legal_sex", "") or getattr(profile, "gender", "") or ""},
        "tests": [{"item": i.pk, "name": i.order.orderable_name, "status": i.status, "has_draft": bool(i.draft_saved_at)} for i in items],
        "clinic": req.organization.name, "provider": name_of(req.ordering_provider),
        "updated_at": req.updated_at.isoformat(), "created_at": req.created_at.isoformat(),
    }
    if detail:
        country = getattr(req.organization, "country", "PH") or "PH"
        data.update({
            "country": country,
            "fasting_required": req.fasting_required, "note_to_lab": req.note_to_lab,
            "collect_by": req.collect_by.isoformat() if req.collect_by else None,
            "provider_license": _provider_license(req.ordering_provider, country),
            "clinic_phone": getattr(getattr(req.ordering_provider, "prescriber_profile", None), "phone", "") or "",
            "decline_reason": req.decline_reason, "cancel_reason": req.cancel_reason,
            "collected_at": req.collected_at.isoformat() if req.collected_at else None, "collected_by_name": req.collected_by_name,
            "accession_number": req.accession_number, "specimen_note": req.specimen_note,
            "released_at": req.released_at.isoformat() if req.released_at else None, "released_by_name": req.released_by_name,
            "items": [{
                "id": i.pk, "order_number": f"ORD-{i.order_id:08d}", "name": i.order.orderable_name,
                "code": i.order.external_code, "code_system": i.order.code_system, "priority": i.order.priority,
                "indication": i.order.indication, "diagnoses": i.order.diagnosis_codes or [], "status": i.status,
                "draft": i.draft or {}, "draft_saved_at": i.draft_saved_at.isoformat() if i.draft_saved_at else None,
                "report_status": i.lab_report.status if i.lab_report_id else None,
            } for i in items],
            "has_critical": draft_has_critical(req),
            "critical_calls": [{"called_name": c.called_name, "called_number": c.called_number, "called_at": c.called_at.isoformat(),
                                "read_back_confirmed": c.read_back_confirmed, "called_by": name_of(c.called_by)}
                               for c in req.critical_calls.select_related("called_by")],
            "report_file": ({"file_name": req.report_file.file_name, "size": req.report_file.size}
                            if LabRequestFile.objects.filter(request=req).exists() else None),
            "events": [{"type": e.event_type, "to": e.to_status, "at": e.created_at.isoformat(), "by": name_of(e.user) if e.user_id else ""}
                       for e in req.events.select_related("user")],
        })
    return data


# --------------------------------------------------------------------------- claiming a walk-in

def _mobile_last4(patient):
    digits = "".join(ch for ch in transport.patient_mobile(patient) if ch.isdigit())
    return digits[-4:] if len(digits) >= 4 else ""


def recent_claim_failures(partner, now=None):
    now = now or timezone.now()
    return LabPortalAccessLog.objects.filter(partner=partner, action="claim_failed", created_at__gte=now - timedelta(hours=1)).count()


def claim(user, code, birthdate, mobile_last4=""):
    if getattr(user, "role", None) not in WORKER_ROLES:
        raise LabPortalError("Only a medical technologist or pathologist can claim a lab request.", 403)
    partner = partner_of(user)
    problem = partner_problem(partner)
    if problem:
        raise LabPortalError(problem, 403)
    if recent_claim_failures(partner) >= int(_setting("LAB_PORTAL_CLAIM_FAILURES_PER_HOUR", CLAIM_FAILURES_PER_HOUR)):
        log_access(user, "claim_locked")
        raise LabPortalError("Too many failed claims from your lab in the last hour. Try again later.", 429)
    try:
        return _claim(user, partner, code, birthdate, mobile_last4)
    except LabPortalError as exc:
        if exc.status_code == 404:
            log_access(user, "claim_failed")
        raise


@transaction.atomic
def _claim(user, partner, code, birthdate, mobile_last4):
    code = normalize_claim_code(code)
    dob = parse_date(str(birthdate or ""))
    last4 = "".join(ch for ch in str(mobile_last4 or "") if ch.isdigit())
    if not code or dob is None or len(last4) != 4:
        raise LabPortalError("Enter the claim code, the patient's birthdate and the last 4 digits of their mobile number.")
    req = (LabRequest.objects.select_for_update(of=("self",)).filter(claim_code=code)
           .select_related("patient", "patient__patient_profile").first())
    profile = getattr(req.patient, "patient_profile", None) if req is not None else None
    # one answer for every mismatch: the code must not reveal whether a request exists
    if req is None or getattr(profile, "date_of_birth", None) != dob or _mobile_last4(req.patient) != last4:
        raise LabPortalError("No lab request matches that claim code, birthdate and mobile number.", 404)
    if req.partner_id == partner.pk and req.status in ("new", "accepted"):
        return _check_in(user, req, partner)
    if req.partner_id and req.partner_id != partner.pk and req.status in OPEN_STATUSES:
        raise LabPortalError("This lab request was sent to another laboratory.", 409)
    if req.status != "unclaimed":
        raise LabPortalError("This lab request is no longer open.", 409)
    siblings = [req]
    if req.group_key:
        siblings += list(LabRequest.objects.select_for_update(of=("self",))
                         .filter(group_key=req.group_key, status="unclaimed").exclude(pk=req.pk))
    for r in siblings:
        r.partner, r.how, r.status, r.locked_at = partner, "claimed", "accepted", timezone.now()
        r.save(update_fields=["partner", "how", "status", "locked_at", "updated_at"])
        _event(r, "claimed", user, {"lab": partner.name}, from_status="unclaimed")
        log_access(user, "claim", r)
    transport.notify_provider(req, "claimed", f"Lab request {req.number} claimed by {partner.name}",
                              f"{partner.name} claimed lab request {req.number} for {chart_name(req.patient)}.")
    return req


def _check_in(user, req, partner):
    before = req.status
    if req.status == "new":
        req.status = "accepted"
        req.save(update_fields=["status", "updated_at"])
        _event(req, "accepted", user, {"lab": partner.name, "walk_in": True}, from_status=before)
    log_access(user, "check_in", req)
    return req


# --------------------------------------------------------------------------- the lab's actions

ACTIONS = ("accept", "decline", "collect", "start", "recollect")


def _expect(req, statuses):
    if req.status not in statuses:
        raise LabPortalError(f"This lab request is {STATUS_LABELS.get(req.status, req.status).lower()}.", 409)


def _working_partner(user):
    partner = partner_of(user)
    problem = partner_problem(partner)
    if problem:
        raise LabPortalError(problem, 403)
    return partner


@transaction.atomic
def act(user, req, action, data=None):
    data = data or {}
    partner = _working_partner(user)
    req = LabRequest.objects.select_for_update(of=("self",)).select_related("organization", "ordering_provider", "patient").get(pk=req.pk)
    if req.partner_id != partner.pk:
        raise LabPortalError("Lab request not found.", 404)
    if action not in ACTIONS:
        raise LabPortalError("Unknown action.")
    if req.status == "cancelled":
        raise LabPortalError("The clinic cancelled this lab request. Do not collect.", 409)
    if getattr(user, "role", None) not in WORKER_ROLES:
        raise LabPortalError("Only a medical technologist or pathologist can do that.", 403)
    before = req.status

    if action == "accept":
        _expect(req, ("new",))
        req.status = "accepted"
        req.save(update_fields=["status", "updated_at"])
        _event(req, "accepted", user, {"lab": partner.name}, from_status=before)
        return req

    if action == "decline":
        _expect(req, ("new", "accepted"))
        reason = _text(data, "reason")
        if not reason:
            raise LabPortalError("Give the reason for declining.")
        req.status, req.decline_reason = "declined", reason
        req.save(update_fields=["status", "decline_reason", "updated_at"])
        _close_items(req, user, "declined")
        _event(req, "declined", user, {"lab": partner.name, "reason": reason}, from_status=before)
        transport.notify_provider(
            req, "declined", f"Lab declined {req.number}",
            f"{partner.name} declined lab request {req.number} for {chart_name(req.patient)}.\n\nReason: {reason}\n\n"
            "The orders can be sent to another lab.",
            sms_text=f"POWER Labs: {partner.name} declined {req.number}. Send it to another lab in POWER.")
        return req

    if action == "collect":
        _expect(req, ("new", "accepted"))
        when = parse_datetime(str(data.get("collected_at") or "")) or timezone.now()
        if timezone.is_naive(when):
            when = timezone.make_aware(when)
        m = membership(user)
        req.status, req.collected_at = "collected", when
        req.collected_by_name = _text(data, "collected_by_name", 160) or (m.full_name if m else name_of(user))
        req.accession_number = _text(data, "accession_number", 64)
        req.specimen_note = _text(data, "specimen_note", 300)
        req.save(update_fields=["status", "collected_at", "collected_by_name", "accession_number", "specimen_note", "updated_at"])
        _event(req, "collected", user, {"accession": req.accession_number}, from_status=before)
        return req

    if action == "start":
        _expect(req, ("collected",))
        req.status = "in_process"
        req.save(update_fields=["status", "updated_at"])
        _event(req, "in_process", user, from_status=before)
        return req

    # recollect: the specimen was rejected (hemolyzed, clotted, not enough): the patient has to come back
    _expect(req, ("collected", "in_process"))
    reason = _text(data, "reason")
    if not reason:
        raise LabPortalError("Give the reason the specimen was rejected.")
    req.status, req.specimen_note, req.collected_at = "accepted", f"Recollect: {reason}"[:300], None
    req.accession_number = ""
    req.save(update_fields=["status", "specimen_note", "collected_at", "accession_number", "updated_at"])
    # nothing measured on the rejected specimen may be released as the new specimen's result: the saved values and
    # the signed PDF go, and a critical value needs a new call (calls before this are kept for the record only)
    req.items.exclude(status="cancelled").update(draft={}, draft_saved_at=None)
    LabRequestFile.objects.filter(request=req).delete()
    _event(req, "recollect", user, {"reason": reason}, from_status=before)
    transport.notify_provider(req, "recollect", f"Specimen rejected for {req.number}",
                              f"{partner.name} rejected the specimen for {chart_name(req.patient)} ({reason}). The patient needs to return.")
    if req.care_setting == "outpatient":
        transport.text_patient(req, f"{req.organization.name}: Please return to {partner.name} for a new lab sample "
                                    f"(code {req.claim_code}). Reply STOP to opt out.")
    return req


@transaction.atomic
def save_results(user, req, data):
    """
    Save the values the lab entered, without releasing them. data: {"items": [{"item": id, "title", "comment",
    "results": [{test_name, value, units, reference_range, abnormal_flag, loinc_code, comment}]}]}
    """
    partner = _working_partner(user)
    if getattr(user, "role", None) not in WORKER_ROLES:
        raise LabPortalError("Only a medical technologist or pathologist can enter results.", 403)
    req = LabRequest.objects.select_for_update(of=("self",)).get(pk=req.pk)
    if req.partner_id != partner.pk:
        raise LabPortalError("Lab request not found.", 404)
    _expect(req, ("collected", "in_process", "preliminary", "final"))
    rows = data.get("items")
    if not isinstance(rows, list) or not rows:
        raise LabPortalError("Enter the results for at least one test.")
    items = {i.pk: i for i in req.items.select_related("order").exclude(status="cancelled")}
    now = timezone.now()
    for row in rows:
        item = items.get(int(row.get("item") or 0)) if isinstance(row, dict) and str(row.get("item") or "").isdigit() else None
        if item is None:
            raise LabPortalError("One of those tests is not on this request.")
        results = row.get("results") or []
        try:
            lab_results.prepare_items(results)
        except lab_results.LabResultError as exc:
            raise LabPortalError(f"{item.order.orderable_name}: {exc}")
        item.draft = {"title": str(row.get("title") or item.order.orderable_name).strip()[:255],
                      "comment": str(row.get("comment") or "").strip()[:2000], "items": results}
        item.draft_saved_at = now
        if item.status == "resulted":
            item.status = "pending"  # a correction: released again with the next release
        item.save(update_fields=["draft", "draft_saved_at", "status"])
    if req.status == "collected":
        before = req.status
        req.status = "in_process"
        req.save(update_fields=["status", "updated_at"])
        _event(req, "in_process", user, from_status=before)
    _event(req, "results_saved", user, {"tests": len(rows)})
    return req


def sniff_pdf(content):
    return content[:5] == b"%PDF-"


@transaction.atomic
def save_report_file(user, req, upload):
    partner = _working_partner(user)
    if req.partner_id != partner.pk:
        raise LabPortalError("Lab request not found.", 404)
    if upload is None:
        raise LabPortalError("Choose the signed report (PDF).")
    content = upload.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise LabPortalError("That file is too large. The limit is 10 MB.")
    if not sniff_pdf(content):
        raise LabPortalError("The signed report must be a PDF.")
    name = lab_results.safe_filename(getattr(upload, "name", "") or "report.pdf")
    LabRequestFile.objects.update_or_create(request=req, defaults={
        "file_name": name, "content_type": "application/pdf", "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(), "data": content, "uploaded_by": user})
    _event(req, "report_file", user, {"file_name": name, "size": len(content)})
    return req


@transaction.atomic
def log_critical_call(user, req, data):
    partner = _working_partner(user)
    if req.partner_id != partner.pk:
        raise LabPortalError("Lab request not found.", 404)
    called_name = _text(data, "called_name", 160)
    if not called_name:
        raise LabPortalError("Enter who took the call.")
    if not _yes(data, "read_back_confirmed"):
        raise LabPortalError("The person you called must read the value back before you log the call.")
    when = parse_datetime(str(data.get("called_at") or "")) or timezone.now()
    if timezone.is_naive(when):
        when = timezone.make_aware(when)
    call = CriticalResultCall.objects.create(request=req, called_name=called_name, called_number=_text(data, "called_number", 30),
                                             called_at=when, read_back_confirmed=True, note=_text(data, "note"), called_by=user)
    _event(req, "critical_call", user, {"called": called_name})
    return call


def _attach_file(report, f):
    report.file_name, report.file_content_type, report.file_size, report.file_sha256 = f.file_name, f.content_type, f.size, f.sha256
    report.save(update_fields=["file_name", "file_content_type", "file_size", "file_sha256", "updated_at"])
    LabReportFileData.objects.update_or_create(report=report, defaults={"data": bytes(f.data)})


@transaction.atomic
def release(user, req, status):
    """Release the saved results to the clinic: preliminary (what is ready) or final (every test)."""
    from appointments import inbox

    partner = _working_partner(user)
    m = membership(user)
    req = LabRequest.objects.select_for_update(of=("self",)).select_related("organization", "patient", "ordering_provider").get(pk=req.pk)
    if req.partner_id != partner.pk:
        raise LabPortalError("Lab request not found.", 404)
    if status not in ("preliminary", "final"):
        raise LabPortalError("Release as preliminary or final.")
    if getattr(user, "role", None) not in WORKER_ROLES or m is None or not m.can_release:
        raise LabPortalError("You are not set up to release results. Ask your lab administrator.", 403)
    _expect(req, ("collected", "in_process", "preliminary", "final"))
    open_items = list(req.items.select_related("order", "lab_report").exclude(status="cancelled"))
    ready = [i for i in open_items if i.draft_saved_at and i.status == "pending"]
    if not ready:
        raise LabPortalError("Enter and save the results first.")
    if status == "final" and any(not i.draft_saved_at for i in open_items):
        raise LabPortalError("Every test needs results before a final release. Release what is ready as preliminary.")
    prepared = {}
    for i in ready:
        try:
            prepared[i.pk] = lab_results.prepare_items(i.draft.get("items") or [])
        except lab_results.LabResultError as exc:
            raise LabPortalError(f"{i.order.orderable_name}: {exc}")
    critical = any(p["abnormal_flag"] in CRITICAL_FLAGS for rows in prepared.values() for p in rows)
    if critical:
        calls = req.critical_calls.filter(read_back_confirmed=True)
        last_recollect = req.events.filter(event_type="recollect").order_by("-created_at").values_list("created_at", flat=True).first()
        if last_recollect is not None:
            calls = calls.filter(created_at__gt=last_recollect)
        if not calls.exists():
            raise LabPortalError("A critical value needs a logged phone call with read-back before release.", 409)
        if partner.country == "PH" and not is_pathologist(user):
            raise LabPortalError("A result with a critical value must be released by the pathologist.", 403)
    require_pdf = bool(_setting("LAB_PORTAL_REQUIRE_PDF", True))
    f = LabRequestFile.objects.filter(request=req).first()
    if status == "final" and require_pdf and f is None:
        raise LabPortalError("Attach the signed report (PDF) before the final release.")

    now = timezone.now()
    released_by = m.full_name or name_of(user)
    signer = f"Released by {released_by}" + (f" ({m.license_number})" if m.license_number else "") + f", {partner.name}."
    corrected = False
    for i in ready:
        d = i.draft
        comment = (d.get("comment") or "").strip()
        comment = f"{comment}\n{signer}".strip()
        report = i.lab_report
        if report is not None and report.status != "entered_in_error":
            was_final = report.status in ("final", "corrected")
            new_status = "corrected" if was_final else status
            corrected = corrected or was_final
            lab_results.update_report(report, user, {"title": d.get("title") or i.order.orderable_name, "comment": comment,
                                                     "items": d.get("items"), "status": new_status, "resulted_at": now,
                                                     "accession_number": req.accession_number})
            report.refresh_from_db()
        else:
            report = LabReport.objects.create(
                organization=req.organization, patient=req.patient, order=i.order, title=(d.get("title") or i.order.orderable_name)[:255],
                source="partner_lab", status=status, performing_lab=partner.name[:120], accession_number=req.accession_number[:64],
                collected_at=req.collected_at, resulted_at=now, comment=comment, entered_by=None,
            )
            lab_results._write_items(report, prepared[i.pk])
            lab_results.log_event(report, "received", None, source="interface",
                                  detail={"partner_lab": partner.name, "request": req.number, "released_by": released_by})
        if f is not None:
            _attach_file(report, f)
        i.lab_report = report
        i.status = "resulted" if report.status in ("final", "corrected") else "pending"
        if report.status == "preliminary":
            i.draft_saved_at = None  # back to "In process" until the final values are saved
        i.save(update_fields=["lab_report", "status", "draft_saved_at"])
        _complete_order(i.order, "final" if report.status in ("final", "corrected") else "preliminary", req.accession_number)
        try:
            with transaction.atomic():
                inbox.notify_lab_report(report)
        except Exception:  # pragma: no cover - alerts are best effort
            pass

    before = req.status
    all_final = all(i.status == "resulted" for i in req.items.exclude(status="cancelled"))
    req.status = "final" if all_final else "preliminary"
    req.released_at, req.released_by = now, user
    req.released_by_name, req.released_by_license = released_by[:160], (m.license_number or "")[:40]
    req.save(update_fields=["status", "released_at", "released_by", "released_by_name", "released_by_license", "updated_at"])
    _event(req, "corrected" if corrected else f"released_{req.status}", user, {"tests": len(ready), "critical": critical}, from_status=before)

    if critical:
        transport.notify_provider(req, f"critical_{now:%H%M%S}", f"CRITICAL lab value: {req.number}",
                                  f"{partner.name} released a critical value for {chart_name(req.patient)} ({req.number}). "
                                  "Open the Lab Results inbox.", kind="critical", sms_text=transport.critical_sms_text(req))
    elif req.status == "final" or corrected:
        number = getattr(req.ordering_provider, "phone_number", "") or ""
        text, org = transport.result_sms_text(req), req.organization
        transaction.on_commit(lambda: transport._sms(number, text, org))
    if corrected:
        transport.notify_provider(req, f"corrected_{now:%H%M%S}", f"Corrected lab result: {req.number}",
                                  f"{partner.name} corrected the results for {chart_name(req.patient)} ({req.number}).")
    if req.status == "final" and req.patient_told_at is None and req.care_setting == "outpatient":
        if transport.text_patient(req, transport.patient_results_text(req)):
            req.patient_told_at = now
            req.save(update_fields=["patient_told_at"])
    return req


# --------------------------------------------------------------------------- not collected: reminders and expiry

def remind_and_expire(now=None):
    """Daily: remind patients who have not gone to the lab (day 3 and 7) and expire requests after 30 days."""
    now = now or timezone.now()
    reminded = expired = 0
    waiting = LabRequest.objects.filter(status__in=("unclaimed", "new", "accepted"), collected_at__isnull=True)
    for req in waiting.filter(expires_at__lte=now).select_related("organization", "patient", "ordering_provider", "partner"):
        with transaction.atomic():
            before = req.status
            req.status = "expired"
            req.save(update_fields=["status", "updated_at"])
            _close_items(req, None, "expired")
            _event(req, "expired", None, from_status=before)
            transport.notify_provider(req, "expired", f"Lab request {req.number} expired",
                                      f"{chart_name(req.patient)} did not go to the lab within {EXPIRE_DAYS} days. "
                                      "The orders can be sent again.")
            if req.partner_id:
                transport.notify_lab(req.partner, f"Lab request {req.number} expired",
                                     f"{req.number} was not collected within {EXPIRE_DAYS} days and is closed.", req)
        expired += 1
    for req in waiting.filter(expires_at__gt=now, care_setting="outpatient").select_related("organization", "patient"):
        age = (now - req.created_at).days
        due = sum(1 for d in REMINDER_DAYS if age >= d)
        if due > req.reminders_sent:
            if not req.group_key or not LabRequest.objects.filter(group_key=req.group_key, pk__lt=req.pk,
                                                                   status__in=("unclaimed", "new", "accepted")).exists():
                transport.text_patient(req, transport.patient_reminder_text(req))  # one text per group
            req.reminders_sent = due
            req.save(update_fields=["reminders_sent"])
            reminded += 1
    return {"reminded": reminded, "expired": expired}


# --------------------------------------------------------------------------- the clinic's view of its requests

def clinic_queryset(user):
    org = getattr(user, "organization", None)
    if org is None:
        return LabRequest.objects.none()
    return LabRequest.objects.filter(organization=org).select_related("partner", "patient", "ordering_provider", "clinic_lab", "organization")


def serialize_for_clinic(req):
    items = list(req.items.select_related("order", "lab_report"))
    return {
        "id": req.pk, "number": req.number, "status": req.status, "status_label": STATUS_LABELS.get(req.status, req.status),
        "lab": req.partner.name if req.partner_id else "", "how": req.how, "claim_code": req.claim_code, "group_key": req.group_key,
        "patient": {"id": req.patient_id, "name": chart_name(req.patient)}, "provider": name_of(req.ordering_provider),
        "priority": req.priority, "care_setting": req.care_setting, "collection": req.collection, "location": req.location,
        "fasting_required": req.fasting_required, "note_to_lab": req.note_to_lab,
        "collect_by": req.collect_by.isoformat() if req.collect_by else None,
        "decline_reason": req.decline_reason, "cancel_reason": req.cancel_reason,
        "collected_at": req.collected_at.isoformat() if req.collected_at else None,
        "released_at": req.released_at.isoformat() if req.released_at else None,
        "expires_at": req.expires_at.isoformat() if req.expires_at else None,
        "created_at": req.created_at.isoformat(), "updated_at": req.updated_at.isoformat(),
        "claim_link": claim_link(req.claim_code),
        "tests": [{"order": i.order_id, "name": i.order.orderable_name, "status": i.status,
                   "report": i.lab_report_id, "report_status": i.lab_report.status if i.lab_report_id else None} for i in items],
    }
