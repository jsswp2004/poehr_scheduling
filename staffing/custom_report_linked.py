"""
Linked reports: pick several kinds of records (a message, a patient, a visit, a nurse...) and the report joins
them through the links the database really has, then reuses the normal report engine to group and count.

An object is one kind of record with its fields. A link says how two objects connect (a stored ID, or a
phone number for messages). Nothing here widens access: every object keeps the right its own report source
uses, facility limits still apply, and the PHI columns can still be hidden.

Counting rule: a joined row repeats a record once per match (one text can match several visits), so every
measure counts each record once (distinct) or averages each record once.
"""

import datetime
from collections import OrderedDict, defaultdict

from django.db.models import Q
from django.utils import timezone

from . import custom_reports as engine
from .custom_reports import ReportConfigError, dim, measure
from . import custom_report_documentation as documentation

MAX_JOINED = 50000
MAX_OBJECTS = 8
MAX_WINDOW = 90
MAX_PATIENTS = 20000

OBJECTS = OrderedDict()
LINKS = []  # in priority order: when an object could join through several links, the earliest wins


def _local_date(dt):
    return (timezone.localtime(dt) if timezone.is_aware(dt) else dt).date()


def _name(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def _pretty(value):
    return (value or "").replace("_", " ").strip().capitalize()


def _phone_keys(*numbers):
    from communicator.utils import format_phone_to_international

    keys = []
    for n in numbers:
        n = (n or "").strip()
        if n:
            p = format_phone_to_international(n)
            if p and "p:" + p not in keys:
                keys.append("p:" + p)
    return keys


def register_object(key, label, plural, module_label, dated, fields, load, primary, empty, right=None, patient_data=False):
    OBJECTS[key] = {
        "key": key, "label": label, "plural": plural, "module_label": module_label, "dated": dated, "fields": fields,
        "load": load, "primary": primary, "empty": empty, "right": right, "patient_data": patient_data,
    }


def link(a, b, label, keys_a, keys_b, fuzzy=False, extra=None):
    LINKS.append({"a": a, "b": b, "label": label, "fuzzy": fuzzy, "ka": keys_a, "kb": keys_b, "extra": extra})


# ---------------------------------------------------------------------------
# Loaders: one dict per record. Keys starting with "_" are for joining and never shown.
# ---------------------------------------------------------------------------
def load_msg(org, start, end, user=None):
    from .custom_report_sources_communicator import CHANNEL_LABELS, _message_qs, _status

    rows = []
    for m in _message_qs(org, start, end, ("sms", "email")):
        d = _local_date(m.created_at)
        rec = (m.recipient or "").strip()
        keys = ["e:" + rec.lower()] if "@" in rec else _phone_keys(rec)
        rows.append(
            {"_id": m.pk, "_d": d, "_keys": keys, "sent": d.isoformat(),
             "channel": CHANNEL_LABELS.get(m.message_type, m.message_type), "status": _status(m.status)}
        )
    return rows


def _age_band(dob):
    if not dob:
        return "Unknown"
    today = timezone.localdate()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return "Under 18" if years < 18 else "18 to 39" if years < 40 else "40 to 64" if years < 65 else "65 and over"


def load_pat(org, start, end, user=None):
    from users.facility_scope import visit_facility_q
    from users.models import Patient, Registration

    qs = Patient.objects.filter(organization=org).select_related("user")
    q = visit_facility_q(user)
    if q is not None:  # a facility-limited user only sees patients seen in their facilities
        qs = qs.filter(pk__in=Registration.objects.filter(organization=org).filter(q).values("patient_id"))
    rows = []
    for p in qs[: MAX_PATIENTS + 1]:
        keys = _phone_keys(p.phone_number, getattr(p.user, "phone_number", ""))
        email = (getattr(p.user, "email", "") or "").strip().lower()
        if email:
            keys.append("e:" + email)
        rows.append(
            {"_id": p.user_id, "_user": p.user_id, "_keys": keys, "name": _name(p.user, "Unknown patient"),
             "age_band": _age_band(p.date_of_birth), "sex": _pretty(p.legal_sex) or "Unknown",
             "language": p.preferred_language or "Not recorded"}
        )
    if len(rows) > MAX_PATIENTS:
        raise ReportConfigError("There are too many patients to list. Start from visits, notes or messages instead.")
    return rows


CARE = {"ambulatory": "Clinic", "emergency": "ED", "acute": "Inpatient"}
ADMISSION = {"scheduled": "Scheduled", "emergency": "Emergency", "direct": "Direct"}


def load_visit(org, start, end, user=None):
    from users.facility_scope import visit_facility_q
    from users.models import Registration

    qs = (
        Registration.objects.filter(organization=org)
        .filter(
            Q(arrival_time__date__gte=start, arrival_time__date__lte=end)
            | Q(arrival_time__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
        )
        .select_related("patient", "unit", "facility")
        .order_by("id")
    )
    q = visit_facility_q(user)
    if q is not None:
        qs = qs.filter(q)
    rows = []
    for v in qs:
        when = v.arrival_time or v.created_at
        d = _local_date(when)
        hours = None
        if v.arrival_time and v.discharge_datetime:
            hours = max((v.discharge_datetime - v.arrival_time).total_seconds() / 3600.0, 0)
        rows.append(
            {"_id": v.pk, "_d": d, "_patient": v.patient.user_id, "_nurse": v.assigned_nurse_id,
             "_doc": v.attending_provider_id or v.resident_provider_id, "_appt": v.appointment_id,
             "date": d.isoformat(), "care": CARE.get(v.care_setting, "Not set"),
             "admission": ADMISSION.get(v.admission_type, "Not set"),
             "unit": v.unit.name if v.unit_id else "No location", "facility": v.facility.name if v.facility_id else "No location",
             "status": "Discharged" if v.discharge_datetime else "In department",
             "reason": (v.reason_for_visit or "").strip() or None, "los_hours": hours}
        )
    return rows


def _staff_roles(org):
    from .models import NURSING_ROLE_CHOICES, Staff

    labels = dict(NURSING_ROLE_CHOICES)
    return {s.user_id: labels.get(s.nursing_role, s.nursing_role) or "Not set"
            for s in Staff.objects.filter(organization=org, user__isnull=False)}


def _people(org, role):
    from users.models import CustomUser

    return CustomUser.objects.filter(organization=org, role=role, is_active=True).order_by("last_name", "first_name", "id")


def load_nurse(org, start, end, user=None):
    roles = _staff_roles(org)
    return [{"_id": u.pk, "name": _name(u), "role": roles.get(u.pk, "Not on the roster")} for u in _people(org, "nurse")]


def load_doc(org, start, end, user=None):
    return [{"_id": u.pk, "name": _name(u)} for u in _people(org, "doctor")]


def load_appt(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from appointments.models import Appointment

    qs = (
        Appointment.all_objects.filter(organization=org, appointment_datetime__date__gte=start, appointment_datetime__date__lte=end)
        .select_related("provider").order_by("appointment_datetime")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(unit__facility_id__in=ids) | Q(unit__isnull=True))
    rows = []
    for a in qs:
        d = _local_date(a.appointment_datetime)
        created = _local_date(a.created_at) if a.created_at else d
        no_show = a.status == "no_show" or bool(a.no_show)
        rows.append(
            {"_id": a.pk, "_d": d, "_patient": a.patient_id, "_provider": a.provider_id, "_appt": a.pk,
             "date": d.isoformat(), "status": "No show" if no_show else _pretty(a.status),
             "provider": _name(a.provider, "No provider"), "visit_type": "Video" if a.is_video else "In person",
             "lead_days": max((d - created).days, 0), "minutes": a.duration_minutes or 0}
        )
    return rows


def load_note(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from appointments.models import ClinicalNote

    qs = (
        ClinicalNote.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
        .filter(Q(organization=org) | Q(organization__isnull=True, appointment__organization=org))
        .select_related("author").order_by("created_at")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))
    from .custom_report_sources_notes import _note_text

    rows = []
    for n in qs:
        d = _local_date(n.created_at)
        hours = max((n.signed_at - n.created_at).total_seconds() / 3600.0, 0) if n.signed_at else None
        rows.append(
            {"_id": n.pk, "_d": d, "_appt": n.appointment_id, "_patient": n.patient_id, "date": d.isoformat(),
             "note_type": {"nursing_assessment": "Nursing assessment", "doctor_assessment": "Doctor assessment"}.get(n.note_type) or _pretty(n.note_type),
             "status": _pretty(n.status), "author": _name(n.author), "text": _note_text(n) or None, "hours_to_sign": hours}
        )
    return rows


def load_docs_placeholder(org, start, end, user=None):
    return []  # the real loader needs the canvas (which notes and observations): see load_docs()


def _docs_picked(canvas, org):
    """(docs settings with whole categories expanded, the picked observations of those notes)."""
    docs = documentation.expand({**canvas["docs"], "layout": "wide"}, org)
    by_id = {o["id"]: o for o in documentation.observation_catalog(docs["templates"], org)}
    return docs, [by_id[i] for i in docs["observations"] if i in by_id]


def load_docs(canvas, org, start, end, user=None):
    docs, picked = _docs_picked(canvas, org)
    rows = documentation._load_all(org, start, end, user, docs, picked, False)
    for r in rows:
        r["_id"] = r["_ref"]  # notes and flowsheet time points share one id space
        r["_d"] = datetime.date.fromisoformat(r["date"])
    return rows


def _docs_fields(canvas, org):
    """The observations picked for the Documentation box, as columns of that box."""
    if "docs" not in canvas.get("objects", []) or not canvas.get("docs"):
        return []
    _docs, picked = _docs_picked(canvas, org)
    out = []
    for o in picked:
        if o["type"] in documentation.NUMBER_TYPES:
            out.append(measure(f"num__{o['id']}", o["label"], "number", agg="avg"))
        else:
            phi = "text" if (o["soap"] or o["type"] in documentation.TEXT_TYPES) else None
            out.append(dim(f"obs__{o['id']}", o["label"], phi=phi))
    return out


def _fields_of(k, canvas, org):
    return OBJECTS[k]["fields"] + (_docs_fields(canvas, org) if k == "docs" else [])


def load_shift(org, start, end, user=None):
    from .models import NURSING_ROLE_CHOICES, SHIFT_TYPE_CHOICES, StaffShift

    labels = dict(SHIFT_TYPE_CHOICES)
    role_labels = dict(NURSING_ROLE_CHOICES)
    qs = StaffShift.objects.filter(organization=org, date__gte=start, date__lte=end, is_cancelled=False).select_related("staff", "unit")
    rows = []
    for s in qs:
        hours = None
        if s.start_time and s.end_time:
            a = datetime.datetime.combine(s.date, s.start_time)
            b = datetime.datetime.combine(s.date, s.end_time)
            hours = ((b - a).total_seconds() + (86400 if b <= a else 0)) / 3600.0
        rows.append(
            {"_id": s.pk, "_d": s.date, "_user": s.staff.user_id, "date": s.date.isoformat(),
             "staff": f"{s.staff.first_name} {s.staff.last_name}".strip() or "Unnamed",
             "profession": (s.staff.profession or "").strip() or "Not set",
             "nursing_role": role_labels.get(s.staff.nursing_role, "Not set"),
             "shift_type": labels.get(s.shift_type, _pretty(s.shift_type)),
             "unit": s.unit.name if s.unit_id else "Not set", "hours": hours}
        )
    return rows


def load_order(org, start, end, user=None):
    from users.facility_scope import assigned_facility_ids

    from appointments.models import Order

    qs = (
        Order.objects.filter(organization=org, created_at__date__gte=start, created_at__date__lte=end)
        .select_related("ordering_provider").order_by("created_at")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))
    rows = []
    for o in qs:
        d = _local_date(o.created_at)
        hours = None
        if o.completed_at:
            hours = max((o.completed_at - (o.signed_at or o.created_at)).total_seconds() / 3600.0, 0)
        rows.append(
            {"_id": o.pk, "_d": d, "_appt": o.appointment_id, "_patient": o.patient_id, "_doc": o.ordering_provider_id,
             "date": d.isoformat(), "category": _pretty(o.orderable_category), "order": o.orderable_name or "Unknown",
             "priority": _pretty(o.priority), "status": _pretty(o.status), "hours_to_complete": hours}
        )
    return rows


def load_lab(org, start, end, user=None):
    from users.facility_scope import visit_facility_q

    from appointments.models import LabReport

    qs = (
        LabReport.objects.filter(organization=org)
        .filter(
            Q(resulted_at__date__gte=start, resulted_at__date__lte=end)
            | Q(resulted_at__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
        )
        .prefetch_related("items").order_by("id")
    )
    q = visit_facility_q(user, prefix="visit__")
    if q is not None:
        qs = qs.filter(q | Q(visit__isnull=True))
    rows = []
    for r in qs:
        d = _local_date(r.resulted_at or r.created_at)
        items = list(r.items.all())
        rows.append(
            {"_id": r.pk, "_d": d, "_visit": r.visit_id, "_patient": r.patient_id, "_order": r.order_id, "date": d.isoformat(),
             "panel": (r.title or "").strip() or "Untitled", "status": _pretty(r.status),
             "review": "Reviewed" if r.review_status == "reviewed" else "Not yet reviewed",
             "abnormal": sum(1 for i in items if i.abnormal_flag),
             "critical": sum(1 for i in items if i.abnormal_flag in ("LL", "HH"))}
        )
    return rows


def load_referral(org, start, end, user=None):
    from appointments.models import Referral

    qs = Referral.objects.filter(organization=org, created_at__date__gte=start, created_at__date__lte=end).order_by("id")
    rows = []
    for r in qs:
        d = _local_date(r.created_at)
        days = max((r.report_received_at - r.sent_at).total_seconds() / 86400.0, 0) if r.sent_at and r.report_received_at else None
        rows.append(
            {"_id": r.pk, "_d": d, "_patient": r.patient_id, "_doc": r.referring_provider_id, "date": d.isoformat(),
             "specialty": (r.specialty or "").strip() or "Not set", "urgency": _pretty(r.urgency),
             "status": _pretty(r.status), "days_to_report": days}
        )
    return rows


def load_vaccine(org, start, end, user=None):
    from appointments.models import PatientImmunization

    qs = (
        PatientImmunization.all_objects.filter(organization=org)
        .filter(
            Q(given_on__gte=start, given_on__lte=end)
            | Q(given_on__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
        )
        .select_related("item").order_by("id")
    )
    rows = []
    for r in qs:
        d = r.given_on or _local_date(r.created_at)
        rows.append(
            {"_id": r.pk, "_d": d, "_patient": r.patient_id, "date": d.isoformat(),
             "item": (r.item.display_name or r.item.name) if r.item_id else "Unknown", "status": _pretty(r.status),
             "reason": _pretty(r.not_done_reason) or "None"}
        )
    return rows


def load_allergy(org, start, end, user=None):
    from appointments.models import PatientAllergy

    qs = (
        PatientAllergy.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
        .filter(Q(organization=org) | Q(organization__isnull=True, patient__organization=org)).order_by("id")
    )
    rows = []
    for a in qs:
        d = _local_date(a.created_at)
        rows.append(
            {"_id": a.pk, "_d": d, "_patient": a.patient_id, "date": d.isoformat(), "substance": (a.substance or "").strip() or "Unknown",
             "category": _pretty(a.category) or "Not set", "severity": _pretty(a.severity) or "Not set", "status": _pretty(a.status)}
        )
    return rows


# ---------------------------------------------------------------------------
# Objects and links
# ---------------------------------------------------------------------------
register_object(
    "msg", "Message log", "Messages", "Communicator", True,
    [dim("sent", "Date sent", "date"), dim("channel", "Channel"), dim("status", "Delivery")],
    load_msg, "channel", "No message", right="messages.view_logs", patient_data=True,
)
register_object(
    "pat", "Patient", "Patients", "Patients", False,
    [dim("name", "Name", phi="name"), dim("age_band", "Age band"), dim("sex", "Sex"), dim("language", "Language")],
    load_pat, "age_band", "No patient", patient_data=True,
)
register_object(
    "visit", "Visit", "Visits", "Patients", True,
    [dim("date", "Visit date", "date"), dim("care", "Visit type"), dim("admission", "Admission type"), dim("unit", "Unit"),
     dim("facility", "Facility"), dim("status", "Status"), dim("reason", "Reason for visit", phi="text"),
     measure("los_hours", "Hours in department", "hours", agg="avg")],
    load_visit, "care", "No visit", patient_data=True,
)
register_object(
    "nurse", "Nurse", "Nurses", "Staffing", False,
    [dim("name", "Name"), dim("role", "Nursing role")], load_nurse, "name", "No nurse",
)
register_object("doc", "Doctor", "Doctors", "Staffing", False, [dim("name", "Name")], load_doc, "name", "No doctor")
register_object(
    "appt", "Appointment", "Appointments", "Scheduling", True,
    [dim("date", "Date", "date"), dim("status", "Status"), dim("provider", "Provider"), dim("visit_type", "Visit mode"),
     measure("lead_days", "Days booked ahead", agg="avg"), measure("minutes", "Minutes booked", agg="avg")],
    load_appt, "status", "No appointment", right="analytics.view", patient_data=True,
)
register_object(
    "note", "Clinical note", "Notes", "Notes", True,
    [dim("date", "Date written", "date"), dim("note_type", "Note type"), dim("status", "Status"), dim("author", "Author"),
     dim("text", "Note text", phi="text"), measure("hours_to_sign", "Hours to sign", "hours", agg="avg")],
    load_note, "status", "No note", right="clinical_notes.view_author", patient_data=True,
)
register_object(
    "docs", "Documentation", "Documents", "Documentation", True,
    [dim("template", "Note or screen"), dim("status", "Status"), dim("date", "Date documented", "date"),
     dim("signed_on", "Date signed", "date"), dim("author", "Author"), dim("author_role", "Author's role"),
     dim("attending", "Attending physician"), dim("discipline", "Physician's discipline"), dim("mrn", "MRN", phi="text"),
     measure("hours_to_sign", "Hours to sign", "hours", agg="avg")],
    load_docs_placeholder, "template", "No documentation", right=documentation.RIGHT, patient_data=True,
)
register_object(
    "shift", "Shift", "Shifts", "Staffing", True,
    [dim("date", "Date", "date"), dim("staff", "Staff member"), dim("profession", "Profession"), dim("nursing_role", "Nursing role"),
     dim("shift_type", "Shift type"), dim("unit", "Unit"), measure("hours", "Hours", "hours", agg="avg")],
    load_shift, "shift_type", "No shift",
)

register_object(
    "order", "Order", "Orders", "Orders", True,
    [dim("date", "Date ordered", "date"), dim("category", "Category"), dim("order", "Order"), dim("priority", "Priority"),
     dim("status", "Status"), measure("hours_to_complete", "Hours to complete", "hours", agg="avg")],
    load_order, "category", "No order", right="orders.view", patient_data=True,
)
register_object(
    "lab", "Lab report", "Lab reports", "Labs", True,
    [dim("date", "Date resulted", "date"), dim("panel", "Panel or test"), dim("status", "Status"), dim("review", "Review"),
     measure("abnormal", "Abnormal results"), measure("critical", "Critical results")],
    load_lab, "panel", "No lab report", right="lab_results.view", patient_data=True,
)
register_object(
    "referral", "Referral", "Referrals", "Referrals", True,
    [dim("date", "Date created", "date"), dim("specialty", "Specialty"), dim("urgency", "Urgency"), dim("status", "Status"),
     measure("days_to_report", "Days until report", agg="avg")],
    load_referral, "specialty", "No referral", patient_data=True,
)
register_object(
    "vaccine", "Vaccine record", "Vaccine records", "Vaccines", True,
    [dim("date", "Date", "date"), dim("item", "Vaccine or screening"), dim("status", "Status"), dim("reason", "Reason not done")],
    load_vaccine, "item", "No vaccine record", right="immunizations.view", patient_data=True,
)
register_object(
    "allergy", "Allergy", "Allergies", "Allergies", True,
    [dim("date", "Date recorded", "date"), dim("substance", "Substance"), dim("category", "Category"),
     dim("severity", "Severity"), dim("status", "Status")],
    load_allergy, "substance", "No allergy", patient_data=True,
)


def _window_ok(ctx, visit, opts):
    """A visit counts for a text when it falls 0..window days after it."""
    msg = ctx.get("msg")
    if msg is None or visit is None:
        return True
    return 0 <= (visit["_d"] - msg["_d"]).days <= opts["window_days"]


def _x_pat_visit(ctx, cand, opts):
    visit = cand if "_nurse" in cand else ctx.get("visit")
    return _window_ok(ctx, visit, opts)


def _x_pat_msg(ctx, cand, opts):
    visit = ctx.get("visit")
    if visit is None:
        return True
    return 0 <= (visit["_d"] - cand["_d"]).days <= opts["window_days"]


def _x_nurse_shift(ctx, cand, opts):
    visit = ctx.get("visit")
    return visit is None or cand.get("_d") is None or cand["_d"] == visit["_d"]  # a nurse row has no date


def _x_msg_pat(ctx, cand, opts):
    # joining from a patient to a text: the text must fall within the window before the patient's visit
    if "_d" in cand:
        return _x_pat_msg(ctx, cand, opts)
    return True


def _one(k):
    return lambda r: [r.get(k)]


link("pat", "visit", "has visits", _one("_user"), _one("_patient"), extra=_x_pat_visit)
link("visit", "nurse", "assigned nurse", _one("_nurse"), _one("_id"))
link("visit", "doc", "attending doctor", _one("_doc"), _one("_id"))
link("visit", "appt", "booked as", _one("_appt"), _one("_id"))
link("visit", "note", "documented in", _one("_appt"), _one("_appt"))
link("msg", "pat", "matched by phone", lambda r: r["_keys"], lambda r: r["_keys"], fuzzy=True, extra=_x_msg_pat)
link("nurse", "shift", "worked", _one("_id"), _one("_user"), extra=_x_nurse_shift)
link("appt", "doc", "provider", _one("_provider"), _one("_id"))
link("appt", "note", "written for", _one("_id"), _one("_appt"))
link("pat", "appt", "has appointments", _one("_user"), _one("_patient"))
link("pat", "note", "has notes", _one("_user"), _one("_patient"))
link("visit", "order", "orders placed", _one("_appt"), _one("_appt"))
link("visit", "lab", "lab results", _one("_id"), _one("_visit"))
link("order", "lab", "resulted as", _one("_id"), _one("_order"))
link("doc", "order", "ordered by", _one("_id"), _one("_doc"))
link("doc", "referral", "referred by", _one("_id"), _one("_doc"))
link("pat", "order", "has orders", _one("_user"), _one("_patient"))
link("pat", "lab", "has lab reports", _one("_user"), _one("_patient"))
link("pat", "referral", "has referrals", _one("_user"), _one("_patient"))
link("pat", "vaccine", "has vaccine records", _one("_user"), _one("_patient"))
link("pat", "allergy", "has allergies", _one("_user"), _one("_patient"))
link("appt", "order", "orders placed", _one("_id"), _one("_appt"))
link("pat", "docs", "has documentation", _one("_user"), _one("_patient"))
link("visit", "docs", "documented in", _one("_appt"), _one("_appt"))
link("appt", "docs", "documented for", _one("_id"), _one("_appt"))
link("nurse", "docs", "documented by", _one("_id"), _one("_author"))
link("doc", "docs", "attending physician", _one("_id"), _one("_doc"))


# ---------------------------------------------------------------------------
# Catalog, validation, joining
# ---------------------------------------------------------------------------
def _allowed(o, user):
    return engine.source_allowed({"right": o["right"]}, user)


def catalog(user):
    return {
        "objects": [
            {
                "key": o["key"], "label": o["label"], "plural": o["plural"], "module_label": o["module_label"],
                "allowed": _allowed(o, user), "dated": o["dated"], "patient_data": o["patient_data"],
                "fields": [
                    {"key": f["key"], "label": f["label"], "kind": f["kind"], "type": f["type"], "phi": f.get("phi"), "agg": f.get("agg")}
                    for f in o["fields"]
                ],
            }
            for o in OBJECTS.values()
        ],
        "links": [{"a": l["a"], "b": l["b"], "label": l["label"], "fuzzy": l["fuzzy"]} for l in LINKS],
        "max_objects": MAX_OBJECTS,
    }


def clean_canvas(canvas, user):
    canvas = canvas if isinstance(canvas, dict) else {}
    keys = []
    for k in canvas.get("objects") or []:
        if k in OBJECTS and k not in keys:
            keys.append(k)
    if len(keys) < 2:
        raise ReportConfigError("Drag at least two things onto the canvas.")
    if len(keys) > MAX_OBJECTS:
        raise ReportConfigError(f"Use {MAX_OBJECTS} things or fewer on one canvas.")
    for k in keys:
        if not _allowed(OBJECTS[k], user):
            raise ReportConfigError(f"You do not have access to {OBJECTS[k]['label']} data.")
    try:
        window = int(canvas.get("window_days", 7))
    except (TypeError, ValueError):
        window = 7
    out = {
        "objects": keys,
        "keep_unmatched": canvas.get("keep_unmatched") is not False,
        "window_days": max(0, min(window, MAX_WINDOW)),
    }
    if "docs" in keys:
        raw = canvas.get("docs") if isinstance(canvas.get("docs"), dict) else {}
        out["docs"] = {**documentation.clean_docs(raw), "layout": "wide"}
    return out


def _neighbours(a):
    return {(l["b"] if l["a"] == a else l["a"]) for l in LINKS if a in (l["a"], l["b"])}


def _bridge_hint(missing, others):
    """Name the objects that would connect `missing` to the rest (shortest path in the whole graph)."""
    best = None
    for target in others:
        queue, seen = [[missing]], {missing}
        while queue:
            path = queue.pop(0)
            if path[-1] == target:
                best = path if best is None or len(path) < len(best) else best
                break
            for n in _neighbours(path[-1]):
                if n not in seen:
                    seen.add(n)
                    queue.append(path + [n])
    if not best:
        return ""
    mid = [OBJECTS[k]["label"] for k in best[1:-1]]
    return f" Add {' and '.join(mid)} to connect them." if mid else ""


def plan_joins(keys):
    """(root, [(target, link index, parent)]); raises when an object cannot be reached."""
    dated = [k for k in keys if OBJECTS[k]["dated"]]
    root = dated[0] if dated else keys[0]
    visited, steps = [root], []
    remaining = [k for k in keys if k != root]
    while remaining:
        best = None
        for t in remaining:
            for i, l in enumerate(LINKS):
                if l["a"] == t and l["b"] in visited:
                    parent = l["b"]
                elif l["b"] == t and l["a"] in visited:
                    parent = l["a"]
                else:
                    continue
                if best is None or i < best[1]:
                    best = (t, i, parent)
        if best is None:
            t = remaining[0]
            raise ReportConfigError(f"{OBJECTS[t]['label']} is not connected to the others.{_bridge_hint(t, visited)}")
        steps.append(best)
        visited.append(best[0])
        remaining.remove(best[0])
    return root, steps


def _ranges(keys, root, start, end, window):
    out = {}
    for k in keys:
        s, e = start, end
        if "msg" in keys:
            if root == "msg" and k != "msg":
                e = end + datetime.timedelta(days=window)  # visits after the text
            elif root != "msg" and k == "msg":
                s = start - datetime.timedelta(days=window)  # texts before the visit
        out[k] = (s, e)
    return out


def join_rows(canvas, org, start, end, user):
    keys = canvas["objects"]
    root, steps = plan_joins(keys)
    opts = {"window_days": canvas["window_days"], "keep": canvas["keep_unmatched"]}
    ranges = _ranges(keys, root, start, end, opts["window_days"])
    loaded = {
        k: (load_docs(canvas, org, ranges[k][0], ranges[k][1], user) if k == "docs" else OBJECTS[k]["load"](org, ranges[k][0], ranges[k][1], user))
        for k in keys
    }

    rows = [{root: r} for r in loaded[root]]
    for target, li, parent in steps:
        lk = LINKS[li]
        parent_is_a = lk["a"] == parent
        kp, kt = (lk["ka"], lk["kb"]) if parent_is_a else (lk["kb"], lk["ka"])
        index = defaultdict(list)
        for r in loaded[target]:
            for key in kt(r):
                if key is not None:
                    index[key].append(r)
        out = []
        for ctx in rows:
            pr = ctx.get(parent)
            cands, seen = [], set()
            if pr is not None:
                for key in kp(pr):
                    for c in index.get(key, ()):
                        if c["_id"] in seen:
                            continue
                        if lk["extra"] and not lk["extra"](ctx, c, opts):
                            continue
                        seen.add(c["_id"])
                        cands.append(c)
            if cands:
                out.extend({**ctx, target: c} for c in cands)
            elif opts["keep"]:
                out.append({**ctx, target: None})
            if len(out) > MAX_JOINED:
                raise ReportConfigError("This joins too many rows. Choose a shorter date range or fewer things.")
        rows = out

    flat = []
    for ctx in rows:
        d = {}
        for k in keys:
            o, r = OBJECTS[k], ctx.get(k)
            d[f"{k}___id"] = r["_id"] if r else None
            if k == "docs" and r:
                d["_ref"] = r["_ref"]  # lets a table open the whole document behind the row
            for f in _fields_of(k, canvas, org):
                v = r.get(f["key"]) if r else None
                if r is None and f["key"] == o["primary"]:
                    v = o["empty"]
                d[f"{k}__{f['key']}"] = v
        flat.append(d)
    return flat


def build_source(canvas, org, user):
    """A report source for engine.run_report, made for this canvas."""
    keys = canvas["objects"]
    fields = []
    for k in keys:
        o = OBJECTS[k]
        for f in _fields_of(k, canvas, org):
            key = f"{k}__{f['key']}"
            if f["kind"] == "dimension":
                fields.append(dim(key, f"{o['label']} · {f['label']}", f["type"], phi=f.get("phi")))
            else:
                fields.append(measure(key, f"{o['label']} · {f['label']}", f["type"], agg=f["agg"], dedupe=f"{k}___id"))
        fields.append(measure(f"{k}__count", o["plural"], agg="distinct", of=f"{k}___id"))
    defaults = [f"{k}__{OBJECTS[k]['primary']}" for k in keys] + [f"{k}__count" for k in keys]
    return {
        "key": "linked", "module": "linked", "right": None, "scoped": False,
        "patient_data": any(OBJECTS[k]["patient_data"] for k in keys),
        "label": "Linked report", "group": "Linked", "description": "", "fields": fields, "dated": True,
        "load": lambda o_, s_, e_: join_rows(canvas, o_, s_, e_, user),
        "default_columns": defaults, "default_group": None,
    }


def split_config(raw, user):
    """config from the client holds the canvas beside the usual report settings."""
    raw = raw if isinstance(raw, dict) else {}
    return clean_canvas(raw.get("canvas"), user), {k: v for k, v in raw.items() if k != "canvas"}
