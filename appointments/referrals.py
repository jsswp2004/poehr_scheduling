"""
Referral Manager: the rules for how a referral moves from a draft to a closed loop.

    draft -> (physician signs) sent -> scheduled -> seen -> report_received -> closed

with side exits (declined, needs_info, cancelled, expired). Every change is a call to
`apply_action`, which checks who may do it, checks the current status allows it, updates the
timers that decide "overdue", and writes the history row -- all under a row lock so two people
clicking at once cannot both move the same referral.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import PatientAllergy, PatientAllergyStatus, Referral, ReferralEvent, ReferralSettings

# Who may use the module at all, and who may sign a referral out.
STAFF_ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")
ADMIN_ROLES = ("admin", "system_admin")
SIGN_ROLES = ("doctor", "admin", "system_admin")

OPEN_STATUSES = ("sent", "scheduled", "seen", "needs_info", "report_received")
CLOSED_STATUSES = ("closed", "declined", "cancelled", "expired")
STATUS_LABELS = dict(Referral.STATUS_CHOICES)
URGENCY_LABELS = dict(Referral.URGENCY_CHOICES)

SPECIALTIES = [
    "Allergy / Immunology", "Behavioral Health", "Cardiology", "Dermatology", "Endocrinology",
    "ENT (Otolaryngology)", "Gastroenterology", "General Surgery", "Geriatrics", "Hematology",
    "Infectious Disease", "Nephrology", "Neurology", "Obstetrics / Gynecology", "Oncology",
    "Ophthalmology", "Orthopedics", "Pain Management", "Physical Therapy", "Podiatry",
    "Psychiatry", "Pulmonology", "Rheumatology", "Urology", "Other",
]

# the queues on the worklist
QUEUES = [
    ("needs_action", "Needs action"),
    ("draft", "Drafts"),
    ("to_schedule", "Awaiting scheduling"),
    ("scheduled", "Scheduled"),
    ("awaiting_report", "Awaiting report"),
    ("to_review", "Report to review"),
    ("overdue", "Overdue"),
    ("closed", "Closed"),
    ("all", "All"),
]

# what each action does: allowed from these statuses -> goes to this status ("" = no change)
ACTIONS = {
    "sign_send": ({"draft"}, "sent"),
    "resend": ({"needs_info"}, "sent"),
    "schedule": ({"sent", "needs_info", "scheduled"}, "scheduled"),
    "seen": ({"scheduled", "sent"}, "seen"),
    "report": ({"sent", "scheduled", "seen"}, "report_received"),
    "needs_info": ({"sent", "scheduled"}, "needs_info"),
    "decline": ({"sent", "scheduled", "needs_info"}, "declined"),
    "close": ({"report_received", "seen", "declined", "expired"}, "closed"),
    "cancel": ({"draft", "sent", "scheduled", "needs_info"}, "cancelled"),
    "expire": ({"sent", "needs_info"}, "expired"),
    "assign": (set(OPEN_STATUSES) | {"draft"}, ""),
    "note": ({value for value, _label in Referral.STATUS_CHOICES}, ""),
}
ACTION_LABELS = {
    "sign_send": "Sign and send",
    "resend": "Send again",
    "schedule": "Mark scheduled",
    "seen": "Mark seen",
    "report": "Report received",
    "needs_info": "Needs more info",
    "decline": "Declined by specialist",
    "close": "Close",
    "cancel": "Cancel",
    "expire": "Mark expired",
    "assign": "Assign",
    "note": "Add note",
}
# actions that must come with a written reason / text
NEEDS_TEXT = {"needs_info": "Say what information is needed.", "decline": "Say why it was declined.",
              "cancel": "Say why it is being cancelled.", "report": "Paste or type the specialist's report."}


class ReferralError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ---------------------------------------------------------------- timers

def settings_for(org):
    """(schedule_days by urgency, report_days) for a clinic, falling back to the defaults."""
    days = dict(ReferralSettings.DEFAULT_SCHEDULE_DAYS)
    report = ReferralSettings.DEFAULT_REPORT_DAYS
    row = ReferralSettings.objects.filter(organization=org).first() if org else None
    if row:
        for key, value in (row.schedule_days or {}).items():
            if key in days and isinstance(value, int) and value > 0:
                days[key] = value
        if row.report_days:
            report = row.report_days
    return days, report


def overdue_reason(ref, now=None):
    """Why this referral is overdue, or '' when it is on time (or nothing is being waited on)."""
    now = now or timezone.now()
    if ref.status in ("sent", "needs_info") and ref.schedule_due and ref.schedule_due < now:
        return "Not scheduled in time"
    if ref.status in ("scheduled", "seen") and ref.report_due and ref.report_due < now:
        return "Report overdue"
    return ""


def overdue_q(now=None):
    now = now or timezone.now()
    return (Q(status__in=["sent", "needs_info"], schedule_due__lt=now)) | (
        Q(status__in=["scheduled", "seen"], report_due__lt=now)
    )


def queue_q(queue, user=None, now=None):
    """The filter for one worklist queue."""
    now = now or timezone.now()
    if queue == "draft":
        return Q(status="draft")
    if queue == "to_schedule":
        return Q(status="sent")
    if queue == "scheduled":
        return Q(status="scheduled")
    if queue == "awaiting_report":
        return Q(status="seen") | Q(status="scheduled", scheduled_for__lt=now)
    if queue == "to_review":
        return Q(status="report_received")
    if queue == "overdue":
        return overdue_q(now)
    if queue == "closed":
        return Q(status__in=CLOSED_STATUSES)
    if queue == "needs_action":
        return (
            Q(status__in=["sent", "needs_info", "seen", "report_received"])
            | Q(status="scheduled", scheduled_for__lt=now)
            | overdue_q(now)
        )
    if queue == "mine" and user is not None:
        return Q(assigned_to=user, status__in=OPEN_STATUSES)
    return Q()


# ---------------------------------------------------------------- permissions

def can_sign(user, ref):
    if user.role in ADMIN_ROLES:
        return True
    return user.role == "doctor" and ref.referring_provider_id == user.pk


def allowed_actions(user, ref):
    """The actions this user can take on this referral right now (drives the buttons)."""
    if getattr(user, "role", None) not in STAFF_ROLES:
        return []
    out = []
    for name, (froms, _to) in ACTIONS.items():
        if ref.status not in froms:
            continue
        if name == "sign_send" and not can_sign(user, ref):
            continue
        out.append(name)
    return out


# ---------------------------------------------------------------- helpers

def log_event(ref, event_type, user=None, *, from_status="", to_status="", detail=None):
    return ReferralEvent.objects.create(
        referral=ref,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        user=user if getattr(user, "pk", None) else None,
        detail=detail or {},
    )


def clinical_snapshot(patient):
    """What goes out with the referral: the allergies as they stand today."""
    rows = PatientAllergy.objects.filter(patient=patient, status="active").order_by("substance", "id")
    allergies = [
        {"substance": a.substance, "reaction": a.reaction, "severity": a.severity, "code": a.code, "code_system": a.code_system}
        for a in rows
    ]
    nka = (not allergies) and PatientAllergyStatus.objects.filter(patient=patient, no_known_allergies=True).exists()
    return {"allergies": allergies, "no_known_allergies": bool(nka), "captured_at": timezone.now().isoformat()}


def missing_for_send(ref):
    missing = []
    if not (ref.destination_id or ref.destination_name.strip()):
        missing.append("who the referral is going to")
    if not ref.specialty.strip():
        missing.append("the specialty")
    if not ref.reason.strip():
        missing.append("the reason for the referral")
    return missing


def _parse_when(value, label):
    from django.utils.dateparse import parse_datetime

    if not value:
        raise ReferralError(f"Give {label}.")
    if hasattr(value, "year"):
        when = value
    else:
        when = parse_datetime(str(value))
    if when is None:
        raise ReferralError(f"{label[0].upper()}{label[1:]} is not a valid date and time.")
    if timezone.is_naive(when):
        when = timezone.make_aware(when)
    return when


# ---------------------------------------------------------------- the one entry point

@transaction.atomic
def apply_action(ref, user, action, data=None, now=None):
    """Do `action` to `ref` for `user`. Raises ReferralError when a rule is broken."""
    data = data or {}
    now = now or timezone.now()
    if action not in ACTIONS:
        raise ReferralError("Unknown action.")
    if getattr(user, "role", None) not in STAFF_ROLES:
        raise ReferralError("Not allowed.", 403)
    if user.role != "system_admin" and ref.organization_id != user.organization_id:
        raise ReferralError("Referral not found.", 404)

    ref = Referral.objects.select_for_update().get(pk=ref.pk)
    froms, to_status = ACTIONS[action]
    if ref.status not in froms:
        raise ReferralError(f"A {STATUS_LABELS[ref.status].lower()} referral can't take that step.", 409)
    if action == "sign_send" and not can_sign(user, ref):
        raise ReferralError("Only the referring physician (or an administrator) can sign and send a referral.", 403)

    if action == "report":
        text = str(data.get("report_text") or data.get("note") or "").strip()
    else:
        text = str(data.get("note") or data.get("reason") or "").strip()[:1000]
    if action in NEEDS_TEXT and not text:
        raise ReferralError(NEEDS_TEXT[action])

    old = ref.status
    detail = {}
    schedule_days, report_days = settings_for(ref.organization)

    if action == "sign_send":
        missing = missing_for_send(ref)
        if missing:
            raise ReferralError("Before sending, add " + ", ".join(missing) + ".")
        if ref.destination_id and not ref.destination_name:
            ref.destination_name = ref.destination.name
        if ref.destination_id and not ref.specialty:
            ref.specialty = ref.destination.specialty
        ref.signed_by = user
        ref.signed_at = now
        ref.sent_at = now
        ref.schedule_due = now + timedelta(days=schedule_days.get(ref.urgency, 14))
        ref.clinical_snapshot = clinical_snapshot(ref.patient)
        ref.status_note = ""
        event = "signed_sent"
    elif action == "resend":
        ref.sent_at = now
        ref.schedule_due = now + timedelta(days=schedule_days.get(ref.urgency, 14))
        ref.clinical_snapshot = clinical_snapshot(ref.patient)
        ref.status_note = ""
        detail["note"] = text
        event = "resent"
    elif action == "schedule":
        when = _parse_when(data.get("scheduled_for"), "the appointment date and time")
        ref.scheduled_for = when
        ref.appointment_location = str(data.get("appointment_location") or "").strip()[:200]
        ref.schedule_due = None
        ref.report_due = when + timedelta(days=report_days)
        ref.status_note = ""
        event = "rescheduled" if old == "scheduled" else "scheduled"
        detail = {"scheduled_for": when.isoformat(), "location": ref.appointment_location}
    elif action == "seen":
        seen = _parse_when(data.get("seen_at"), "when the patient was seen") if data.get("seen_at") else now
        if seen > now + timedelta(minutes=5):
            raise ReferralError("The patient can't have been seen in the future.")
        ref.seen_at = seen
        ref.schedule_due = None
        ref.report_due = seen + timedelta(days=report_days)
        event = "seen"
    elif action == "report":
        ref.report_text = text
        ref.report_received_at = now
        if not ref.seen_at:
            ref.seen_at = ref.scheduled_for if (ref.scheduled_for and ref.scheduled_for <= now) else now
        ref.schedule_due = None
        ref.report_due = None
        event = "report_received"
    elif action == "needs_info":
        ref.status_note = text[:300]
        ref.schedule_due = now + timedelta(days=schedule_days.get(ref.urgency, 14))
        ref.report_due = None
        event = "needs_info"
        detail["note"] = text
    elif action == "decline":
        ref.status_note = text[:300]
        ref.schedule_due = ref.report_due = None
        event = "declined"
        detail["note"] = text
    elif action == "close":
        ref.closed_at = now
        ref.schedule_due = ref.report_due = None
        event = "closed"
        detail["note"] = text
    elif action == "cancel":
        ref.status_note = text[:300]
        ref.schedule_due = ref.report_due = None
        event = "cancelled"
        detail["note"] = text
    elif action == "expire":
        ref.schedule_due = ref.report_due = None
        ref.status_note = text[:300]
        event = "expired"
        detail["note"] = text
    elif action == "assign":
        assignee_id = data.get("assigned_to")
        if assignee_id in (None, "", 0, "0"):
            ref.assigned_to = None
            detail["assigned_to"] = None
        else:
            from users.models import CustomUser

            assignee = CustomUser.objects.filter(pk=assignee_id, role__in=STAFF_ROLES).first()
            if assignee is None or (assignee.role != "system_admin" and assignee.organization_id != ref.organization_id):
                raise ReferralError("That person can't be assigned here.")
            ref.assigned_to = assignee
            detail["assigned_to"] = assignee.pk
        event = "assigned"
    else:  # note
        if not text:
            raise ReferralError("Type the note first.")
        event = "note"
        detail["note"] = text

    if to_status:
        ref.status = to_status
    ref.save()
    log_event(ref, event, user, from_status=old, to_status=ref.status, detail=detail)
    return ref
