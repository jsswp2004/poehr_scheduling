"""
Secure referral links: send a referral to the receiving specialist as a private link, and let them
answer it there (set the appointment, ask for more information, decline, or send the consult).

How it stays private
    * The link is <site>/referral#<key>. The key is random, only its SHA-256 hash is stored, and it sits
      after the "#", which browsers never send to a server, so it stays out of web logs.
    * The text or email carries no patient details: only who sent it and where to open it.
    * A 6-digit code, sent to the specialist's *other* contact, is asked for when the link is opened
      (switch off with REFERRAL_LINK_REQUIRE_CODE). Wrong guesses are limited and the code expires.
    * The link stops working when it expires, is turned off, is replaced by a newer one, or the referral
      closes. The specialist sees the referral and the allergy snapshot, never the rest of the chart.
    * Everything the specialist does goes through the same steps staff use (`referrals.apply_external`),
      so timers, queues and history behave the same way, and each step is recorded in the referral history.
    * Files the specialist attaches are checked by their real content (PDF, JPEG or PNG, 10 MB each) and
      filed as unreviewed outside documents on the patient's chart, where a person reviews them.
"""

import hashlib
import logging
import re
import secrets
from datetime import datetime, time, timedelta

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from . import lab_results
from . import referrals as rf
from .models import LabReport, LabReportFileData, Referral, ReferralAttachment, ReferralLink

log = logging.getLogger(__name__)

SESSION_SALT = "appointments.referral_link.session"
TWILIO_OPTED_OUT_CODE = 21610

# A link can be sent while the referral is out with the specialist, and opened until it closes.
LINK_STATUSES = ("sent", "scheduled", "seen", "needs_info")
VIEW_STATUSES = rf.OPEN_STATUSES  # also report_received, so they can see what they sent

CODE_TTL_MINUTES = 15
CODE_MAX_ATTEMPTS = 5
CODE_MAX_SENDS_PER_HOUR = 3
MAX_FILES = 3
MAX_TEXT = 4000

REPLY_LABELS = {
    "schedule": "Appointment scheduled",
    "seen": "Patient was seen",
    "needs_info": "Need more information",
    "decline": "Decline",
    "report": "Send consult",
}


class LinkUnavailable(Exception):
    """Deliberately says nothing about why: a wrong, used, turned-off or expired link all look alike."""


# ---------------------------------------------------------------- small helpers

def hash_token(raw):
    return hashlib.sha256(str(raw).encode()).hexdigest()


def _iso(value):
    return value.isoformat() if value else None


def digits(value):
    return re.sub(r"\D", "", str(value or ""))


def mask_phone(value):
    d = digits(value)
    return f"•••-•••-{d[-4:]}" if len(d) >= 4 else "•••"


def mask_email(value):
    local, _, domain = str(value or "").partition("@")
    return f"{local[:1]}•••@{domain}" if domain else "•••"


def clean_mobile(value):
    value = str(value or "").strip()
    if not value:
        return ""
    d = digits(value)
    if len(d) == 11 and d.startswith("1"):
        d = d[1:]
    if len(d) != 10:
        raise rf.ReferralError("The mobile number must be 10 digits.")
    return f"({d[:3]}) {d[3:6]}-{d[6:]}"


def clean_email(value):
    value = str(value or "").strip()
    if not value:
        return ""
    try:
        validate_email(value)
    except DjangoValidationError:
        raise rf.ReferralError("That email address does not look right.")
    return value[:254]


def public_url(raw):
    return f"{settings.REFERRAL_PUBLIC_URL.rstrip('/')}#{raw}"


def link_is_usable(link, now=None):
    now = now or timezone.now()
    return (
        link.revoked_at is None
        and link.expires_at > now
        and link.referral.status in VIEW_STATUSES
    )


# ---------------------------------------------------------------- issuing and sending (staff side)

@transaction.atomic
def issue_link(ref, user, *, mobile="", email="", now=None):
    """Make a fresh link for this referral and switch off any earlier one. Returns (link, raw key)."""
    now = now or timezone.now()
    ref = Referral.objects.select_for_update().get(pk=ref.pk)
    if ref.status not in LINK_STATUSES:
        raise rf.ReferralError("A secure link can be sent once the referral is signed and while it is open.", 409)
    actor = user if getattr(user, "pk", None) else None
    ReferralLink.objects.filter(referral=ref, revoked_at__isnull=True).update(revoked_at=now, revoked_by=actor)
    raw = secrets.token_urlsafe(32)
    link = ReferralLink.objects.create(
        referral=ref,
        token_hash=hash_token(raw),
        created_by=actor,
        expires_at=now + timedelta(days=settings.REFERRAL_LINK_TTL_DAYS),
        recipient_mobile=mobile,
        recipient_email=email,
        # a code needs somewhere to go
        require_code=bool(settings.REFERRAL_LINK_REQUIRE_CODE and (mobile or email)),
    )
    return link, raw


def _hide_in_message_log(recipient, hidden):
    """The Communicator message log keeps what was sent. The link's key and the code are credentials,
    so they are blanked out of the log once the message has gone."""
    from communicator.models import MessageLog

    try:
        for row in MessageLog.objects.filter(recipient=recipient).order_by("-id")[:5]:
            body = row.body or ""
            new = body
            for secret in hidden:
                new = new.replace(secret, "[hidden]")
            if new != body:
                row.body = new
                row.save(update_fields=["body"])
    except Exception:  # never let log tidying undo a send
        log.exception("referral link: could not tidy the message log")


def _send_text(number, text, ref, user, hidden):
    from communicator.utils import format_phone_to_international, send_sms

    try:
        send_sms(number, text, user=user if getattr(user, "pk", None) else None, organization=ref.organization)
        ok, reason = True, ""
    except Exception as exc:  # blocked (opted out / no consent) or a Twilio problem
        message = str(exc).lower()
        if getattr(exc, "code", None) == TWILIO_OPTED_OUT_CODE or "opted out" in message:
            reason = "opted_out"
        elif "consent" in message:
            reason = "no_consent"
        else:
            log.exception("referral link: sending the text failed")
            reason = "failed"
        ok = False
    _hide_in_message_log(format_phone_to_international(number), hidden)
    return ok, reason


def _send_mail(address, subject, body, ref, user, hidden):
    from communicator.utils import send_email

    try:
        send_email(address, subject, body, user=user if getattr(user, "pk", None) else None, organization=ref.organization)
        ok, reason = True, ""
    except Exception:
        log.exception("referral link: sending the email failed")
        ok, reason = False, "failed"
    _hide_in_message_log(address, hidden)
    return ok, reason


def deliver_link(link, raw, ref, user, channels, now=None):
    """Text and/or email the link. The message names the clinic and the link, nothing about the patient."""
    now = now or timezone.now()
    org_name = ref.organization.name
    url = public_url(raw)
    results = []
    for channel in channels:
        if channel == "sms":
            if not link.recipient_mobile:
                results.append({"channel": "sms", "to": "", "sent": False, "reason": "no_contact", "at": _iso(now)})
                continue
            text = f"{org_name} sent you a secure referral. Open it here: {url}\nReply STOP to opt out."
            ok, reason = _send_text(link.recipient_mobile, text, ref, user, [raw])
            results.append({"channel": "sms", "to": mask_phone(link.recipient_mobile), "sent": ok, "reason": reason, "at": _iso(now)})
        elif channel == "email":
            if not link.recipient_email:
                results.append({"channel": "email", "to": "", "sent": False, "reason": "no_contact", "at": _iso(now)})
                continue
            body = (
                f"A referral from {org_name} is waiting for you.\n\n"
                f"Open it securely: {url}\n\n"
                f"This link is private, so please do not forward it. It stops working on "
                f"{timezone.localtime(link.expires_at):%B %d, %Y}.\n"
            )
            ok, reason = _send_mail(link.recipient_email, f"A secure referral from {org_name}", body, ref, user, [raw])
            results.append({"channel": "email", "to": mask_email(link.recipient_email), "sent": ok, "reason": reason, "at": _iso(now)})
    link.deliveries = list(link.deliveries or []) + results
    link.save(update_fields=["deliveries"])
    return results


def clean_delivery(spec):
    """Check a "how to send it" request: {"channels": ["sms","email"], "mobile", "email", "copy"}.
    Returns (channels, mobile, email, copy), or None when it asks for nothing to be sent now."""
    if not isinstance(spec, dict):
        return None
    channels = [c for c in dict.fromkeys(spec.get("channels") or []) if c in ("sms", "email")]
    copy = bool(spec.get("copy"))
    if not channels and not copy:
        return None
    mobile, email = clean_mobile(spec.get("mobile")), clean_email(spec.get("email"))
    if "sms" in channels and not mobile:
        raise rf.ReferralError("Add a mobile number to send a text.")
    if "email" in channels and not email:
        raise rf.ReferralError("Add an email address to send an email.")
    return channels, mobile, email, copy


def send_link(ref, user, *, channels, mobile="", email="", copy=False, now=None):
    """Issue a new link and send it. Returns {"link": ..., "deliveries": [...], "url": only when copy}."""
    now = now or timezone.now()
    cleaned = clean_delivery({"channels": channels, "mobile": mobile, "email": email, "copy": copy})
    if cleaned is None:
        raise rf.ReferralError("Choose text, email or both.")
    channels, mobile, email, copy = cleaned

    link, raw = issue_link(ref, user, mobile=mobile, email=email, now=now)
    results = deliver_link(link, raw, ref, user, channels, now) if channels else []
    rf.log_event(
        ref,
        "link_sent",
        user,
        from_status=ref.status,
        to_status=ref.status,
        detail={"channels": channels, "results": [{k: r[k] for k in ("channel", "to", "sent", "reason")} for r in results], "copied": bool(copy)},
    )
    out = {"link": link_json(link, now), "deliveries": results}
    if copy:
        out["url"] = public_url(raw)
    return out


@transaction.atomic
def revoke_links(ref, user, now=None):
    """Turn the link off. Returns how many were switched off."""
    now = now or timezone.now()
    actor = user if getattr(user, "pk", None) else None
    count = ReferralLink.objects.filter(referral=ref, revoked_at__isnull=True).update(revoked_at=now, revoked_by=actor)
    if count:
        rf.log_event(ref, "link_revoked", user, from_status=ref.status, to_status=ref.status)
    return count


def link_json(link, now=None):
    now = now or timezone.now()
    if link.revoked_at:
        state = "turned_off"
    elif link.expires_at <= now:
        state = "expired"
    elif link.referral.status not in VIEW_STATUSES:
        state = "closed"
    else:
        state = "active"
    return {
        "id": link.pk,
        "state": state,
        "created_at": _iso(link.created_at),
        "expires_at": _iso(link.expires_at),
        "deliveries": link.deliveries or [],
        "require_code": link.require_code,
        "first_opened_at": _iso(link.first_opened_at),
        "last_opened_at": _iso(link.last_opened_at),
        "open_count": link.open_count,
        "verified": link.verify_count > 0,
    }


def current_link_json(ref, now=None):
    link = ref.links.select_related("referral").first()  # newest first
    return link_json(link, now) if link else None


def attachment_json(att):
    return {
        "id": att.pk,
        "file_name": att.file_name,
        "content_type": att.file_content_type,
        "size": att.file_size,
        "lab_report": att.lab_report_id,
        "review_status": att.lab_report.review_status,
        "uploaded_at": _iso(att.created_at),
    }


# ---------------------------------------------------------------- the second check (the code)

def _code_target(link):
    """The contact the code goes to: the other one from where the link went, when there is one."""
    went = {d.get("channel") for d in (link.deliveries or []) if d.get("sent")}
    mobile, email = link.recipient_mobile, link.recipient_email
    if "sms" in went and "email" not in went and email:
        return "email", email
    if "email" in went and "sms" not in went and mobile:
        return "sms", mobile
    if email:
        return "email", email
    if mobile:
        return "sms", mobile
    return None, ""


def code_hint(link):
    """Where the code goes, masked (e.g. 'a•••@clinic.org'); '' when there is nowhere to send one."""
    channel, to = _code_target(link)
    if channel == "sms":
        return mask_phone(to)
    return mask_email(to) if channel else ""


def code_is_outstanding(link, now=None):
    now = now or timezone.now()
    return bool(link.code_hash and link.code_expires_at and link.code_expires_at > now and link.code_attempts < CODE_MAX_ATTEMPTS)


def _code_hash(link, code):
    return hashlib.sha256(f"{link.pk}:{code}".encode()).hexdigest()


def send_code(link, now=None):
    """Send a new 6-digit code. Returns a hint like 'a•••@clinic.org' saying where it went."""
    now = now or timezone.now()
    channel, to = _code_target(link)
    if channel is None:
        raise rf.ReferralError("No contact is on file to send a code to.", 409)
    cutoff = now - timedelta(hours=1)
    recent = []
    for stamp in link.code_sends or []:
        try:
            if datetime.fromisoformat(stamp) > cutoff:
                recent.append(stamp)
        except (TypeError, ValueError):
            continue
    if len(recent) >= CODE_MAX_SENDS_PER_HOUR:
        raise rf.ReferralError("Too many codes were sent. Please try again in an hour.", 429)

    code = f"{secrets.randbelow(10 ** 6):06d}"
    link.code_hash = _code_hash(link, code)
    link.code_expires_at = now + timedelta(minutes=CODE_TTL_MINUTES)
    link.code_attempts = 0
    link.code_sends = recent + [_iso(now)]
    link.save(update_fields=["code_hash", "code_expires_at", "code_attempts", "code_sends"])

    ref = link.referral
    org_name = ref.organization.name
    if channel == "sms":
        ok, _reason = _send_text(
            to, f"{org_name}: your referral code is {code}. It works for {CODE_TTL_MINUTES} minutes. Reply STOP to opt out.", ref, None, [code]
        )
        hint = mask_phone(to)
    else:
        ok, _reason = _send_mail(
            to,
            f"Your referral code from {org_name}",
            f"Your code is {code}. It works for {CODE_TTL_MINUTES} minutes.\n\nIf you did not just open a referral link, you can ignore this.\n",
            ref,
            None,
            [code],
        )
        hint = mask_email(to)
    if not ok:
        raise rf.ReferralError("The code could not be sent. Please ask the clinic to send the link again.", 502)
    return hint


def make_session(link):
    return signing.dumps({"l": link.pk, "k": link.token_hash[:12]}, salt=SESSION_SALT)


def verify_code(link, code, now=None):
    """Check the code. Returns the session token. Wrong guesses are counted and limited."""
    now = now or timezone.now()
    code = digits(code)
    if not link.code_hash or not link.code_expires_at or link.code_expires_at <= now:
        raise rf.ReferralError("That code has expired. Ask for a new one.", 400)
    if link.code_attempts >= CODE_MAX_ATTEMPTS:
        raise rf.ReferralError("Too many wrong tries. Ask for a new code.", 429)
    if len(code) != 6 or not secrets.compare_digest(_code_hash(link, code), link.code_hash):
        link.code_attempts += 1
        link.save(update_fields=["code_attempts"])
        raise rf.ReferralError("That code isn't right.", 400)
    link.code_hash = ""
    link.code_expires_at = None
    link.code_attempts = 0
    link.verify_count += 1
    link.save(update_fields=["code_hash", "code_expires_at", "code_attempts", "verify_count"])
    return make_session(link)


# ---------------------------------------------------------------- opening a link (specialist side)

def resolve(raw, now=None):
    """The usable link for this key, or LinkUnavailable."""
    raw = str(raw or "")
    if not raw or len(raw) > 200:
        raise LinkUnavailable()
    link = ReferralLink.objects.select_related("referral", "referral__organization").filter(token_hash=hash_token(raw)).first()
    if link is None or not link_is_usable(link, now):
        raise LinkUnavailable()
    return link


def from_session(token, now=None):
    try:
        data = signing.loads(str(token or ""), salt=SESSION_SALT, max_age=settings.REFERRAL_SESSION_TTL_SECONDS)
    except signing.BadSignature:
        raise LinkUnavailable()
    link = ReferralLink.objects.select_related("referral", "referral__organization").filter(pk=data.get("l")).first()
    if link is None or link.token_hash[:12] != data.get("k") or not link_is_usable(link, now):
        raise LinkUnavailable()
    return link


def record_open(link, now=None):
    now = now or timezone.now()
    first = link.first_opened_at is None
    if first:
        link.first_opened_at = now
    link.last_opened_at = now
    link.open_count += 1
    link.save(update_fields=["first_opened_at", "last_opened_at", "open_count"])
    if first:
        rf.log_event(link.referral, "link_opened", None, from_status=link.referral.status, to_status=link.referral.status,
                     detail={"via": "secure_link", "by": link.referral.destination_name})


def _age(dob, today=None):
    if not dob:
        return None
    today = today or timezone.localdate()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _name(user):
    if user is None:
        return ""
    return (f"{user.first_name} {user.last_name}".strip()) or user.username


def allowed_replies(ref):
    return [name for name in rf.EXTERNAL_ACTIONS if ref.status in rf.ACTIONS[name][0]]


def conversation(ref):
    """What the specialist and the clinic have said to each other on this referral (never internal notes)."""
    rows = []
    for e in ref.events.all():
        d = e.detail or {}
        if d.get("via") == "secure_link" and e.event_type != "link_opened":
            rows.append({"from": "specialist", "type": e.event_type, "note": d.get("note") or "", "at": _iso(e.created_at),
                         "scheduled_for": d.get("scheduled_for"), "location": d.get("location") or "", "files": d.get("files") or []})
        elif e.event_type == "resent":
            rows.append({"from": "clinic", "type": "answer", "note": d.get("note") or "", "at": _iso(e.created_at)})
    return rows


def packet(link):
    """Everything the specialist is shown. Deliberately small: the referral and the allergy snapshot."""
    ref = link.referral
    profile = getattr(ref.patient, "patient_profile", None)
    snap = ref.clinical_snapshot or {}
    return {
        "organization": ref.organization.name,
        "expires_at": _iso(link.expires_at),
        "status": ref.status,
        "status_label": rf.STATUS_LABELS.get(ref.status, ref.status),
        "urgency": ref.urgency,
        "urgency_label": rf.URGENCY_LABELS.get(ref.urgency, ref.urgency),
        "specialty": ref.specialty,
        "destination_name": ref.destination_name,
        "patient": {
            "name": _name(ref.patient),
            "age": _age(getattr(profile, "date_of_birth", None)),
            "sex": getattr(profile, "legal_sex", "") or "",
        },
        "reason": ref.reason,
        "clinical_question": ref.clinical_question,
        "diagnosis": " - ".join(x for x in (ref.diagnosis_code, ref.diagnosis_text) if x),
        "referring": {"name": _name(ref.referring_provider), "phone": getattr(ref.referring_provider, "phone_number", "") or ""},
        "allergies": {
            "items": [{"substance": a.get("substance", ""), "reaction": a.get("reaction", "")} for a in snap.get("allergies", [])],
            "none_known": bool(snap.get("no_known_allergies")),
            "as_of": snap.get("captured_at"),
        },
        "scheduled_for": _iso(ref.scheduled_for),
        "appointment_location": ref.appointment_location,
        "conversation": conversation(ref),
        "replies": [{"action": a, "label": REPLY_LABELS[a]} for a in allowed_replies(ref)],
        "max_files": MAX_FILES,
        "max_file_mb": lab_results.MAX_FILE_BYTES // (1024 * 1024),
    }


# ---------------------------------------------------------------- the specialist's reply

def _inspect_upload(upload):
    content = upload.read()
    if not content:
        raise rf.ReferralError("One of the files is empty.")
    if len(content) > lab_results.MAX_FILE_BYTES:
        raise rf.ReferralError(f"A file is too large. The limit is {lab_results.MAX_FILE_BYTES // (1024 * 1024)} MB each.")
    content_type = lab_results.sniff_content_type(content[:16])
    if content_type is None:
        raise rf.ReferralError("Only PDF, JPEG or PNG files can be attached.")
    return content, content_type, lab_results.safe_filename(getattr(upload, "name", ""))


def _file_document(ref, link, content, content_type, name, now):
    """File one attachment on the patient's chart as an unreviewed outside document and link it to the referral."""
    digest = hashlib.sha256(content).hexdigest()
    report = (
        LabReport.objects.filter(patient=ref.patient, file_sha256=digest).exclude(status="entered_in_error").order_by("-created_at").first()
    )
    if report is None:
        who = ref.destination_name or "specialist"
        report = LabReport.objects.create(
            organization=ref.organization,
            patient=ref.patient,
            title=f"Outside consult: {ref.specialty or 'Specialist'} - {who}"[:255],
            source="scan",
            status="final",
            performing_lab=who[:120],
            resulted_at=now,
            comment=f"Sent by the specialist through a secure referral link (referral #{ref.pk}).",
            entered_by=None,
            file_name=name,
            file_content_type=content_type,
            file_size=len(content),
            file_sha256=digest,
        )
        LabReportFileData.objects.create(report=report, data=content)
        lab_results.log_event(
            report, "uploaded", None, source="system",
            detail={"file_name": name, "size": len(content), "referral": ref.pk, "via": "secure_link"},
        )
    return ReferralAttachment.objects.create(
        referral=ref, lab_report=report, link=link, file_name=name, file_content_type=content_type, file_size=len(content)
    )


def _text(value):
    return str(value or "").strip()[:MAX_TEXT]


def _seen_datetime(value, now):
    """The day the specialist says the patient was seen (a date), as a moment that is never in the future.
    Blank means now."""
    from django.utils.dateparse import parse_date

    raw = _text(value)[:40]
    if not raw:
        return now
    day = parse_date(raw)
    if day is None:
        raise rf.ReferralError("Date seen is not a valid date.")
    when = timezone.make_aware(datetime.combine(day, time(12, 0)))
    if when > now:
        if day > timezone.localdate(now):
            raise rf.ReferralError("The patient can't have been seen in the future.")
        when = now
    return when


def handle_reply(link, data, uploads, now=None):
    """Apply the specialist's reply. Raises ReferralError when something is missing or not allowed."""
    now = now or timezone.now()
    ref = link.referral
    action = data.get("action")
    if action not in rf.EXTERNAL_ACTIONS:
        raise rf.ReferralError("Choose how you are replying.")
    uploads = list(uploads or [])
    if len(uploads) > MAX_FILES:
        raise rf.ReferralError(f"You can attach up to {MAX_FILES} files.")
    inspected = [_inspect_upload(u) for u in uploads]
    text = _text(data.get("message"))
    names = [i[2] for i in inspected]

    payload = {}
    if action == "schedule":
        payload = {
            "scheduled_for": data.get("scheduled_for"),
            "appointment_location": _text(data.get("appointment_location"))[:200] or ref.destination_name,
        }
        if text:
            payload["note"] = text
    elif action == "seen":
        if uploads:
            raise rf.ReferralError("Attach files when you send the consult.")
        payload = {"seen_at": _seen_datetime(data.get("seen_on"), now)}
        if text:
            payload["note"] = text
    elif action in ("needs_info", "decline"):
        payload = {"note": text}
    else:  # report
        if not text and not inspected:
            raise rf.ReferralError("Type the findings or attach the consult letter.")
        seen_on = _text(data.get("seen_on"))[:40]
        parts = []
        if seen_on:
            parts.append(f"Seen on: {seen_on}")
        parts.append(text or "See the attached consult letter.")
        if names:
            parts.append("Attached: " + ", ".join(names))
        payload = {"report_text": "\n\n".join(parts)}

    extra = {"via": "secure_link", "by": ref.destination_name, "link": link.pk}
    if names:
        extra["files"] = names
    if action in ("schedule", "seen") and text:
        extra["note"] = text

    with transaction.atomic():
        rf.apply_external(ref, action, payload, extra, now)
        for content, content_type, name in inspected:
            _file_document(Referral.objects.get(pk=ref.pk), link, content, content_type, name, now)
    link.referral.refresh_from_db()
    return packet(link)
