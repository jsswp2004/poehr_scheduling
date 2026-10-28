"""
Documentation reports (Reports module).

Pick one or several note templates or screens (the PHQ-9, an Admission Note, a Progress Note...), choose what to show
about each note, its patient, its people and its visit, and pick which observations (fields) of the notes to include,
each with its label and value. One row per documented note ("wide": a column per observation) or one row per
observation ("long": Observation and Value columns).

How it fits the report engine: like a linked report, the source is built for the report that carries it. The saved
config holds the usual report settings plus `docs`:

    {"templates": ["phq9", "gad7"], "observations": ["total_score", "q9"], "layout": "wide" | "long",
     "status": "signed" | "all"}

Values are read from the note itself: calculated results (and their meaning) are stored with the note, and the
labels of dropdown, radio and checklist answers come from the template as it was when the note was written
(ClinicalNote.template_snapshot), so a template edited later never changes an old note.

Access is the Notes report's: the clinical-notes right, limited to the user's facilities, every run audit-logged, and
Hide PHI masks patient names, MRN and typed text (coded values, scores, visit ID and dates stay).
"""

import datetime
from collections import OrderedDict

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.utils import timezone

from .custom_reports import ReportConfigError, dim, measure, register

DOC_KEY = "note_documentation"
RIGHT = "clinical_notes.view_author"
MAX_TEMPLATES = 12
MAX_OBSERVATIONS = 30
MAX_NOTES = 20000
LAYOUTS = ("wide", "long")
STATUSES = ("signed", "all")

# Notes written without a template use the fixed SOAP fields; each is an observation of its own.
SOAP = [("subjective", "Subjective"), ("objective", "Objective"), ("assessment", "Assessment"), ("plan", "Plan")]
BUILTIN_TYPES = {
    "initial_assessment": "Initial Assessment",
    "progress_note": "Progress Note",
    "admission_note": "Admission Note",
    "nursing_assessment": "Nursing Assessment",
    "doctor_assessment": "Doctor Assessment",
}
TEXT_TYPES = ("text", "textarea")
NUMBER_TYPES = ("numeric", "calculated")
SKIP_TYPES = ("chart_data",)
MEANING_SUFFIX = "__interpretation"


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _local(dt):
    return timezone.localtime(dt) if timezone.is_aware(dt) else dt


def _person(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def _pretty(value):
    return (value or "").replace("_", " ").strip().capitalize()


def _number(raw):
    from appointments.calculations import to_number

    return to_number(raw)


def _is_empty(raw):
    return raw is None or raw == "" or raw == [] or raw == {}


def _mrn(user):
    """The patient's medical record number (it lives on the patient profile), or None."""
    try:
        return user.patient_profile.mrn or None
    except ObjectDoesNotExist:
        return None


def _discipline(user):
    """The staff roster's profession for this login (free text), else 'Not set'."""
    if not user:
        return "Not set"
    try:
        s = user.staff_profile
    except ObjectDoesNotExist:
        return "Not set"
    return (s.profession or "").strip() or "Not set"


# ---------------------------------------------------------------------------
# Templates and observations
# ---------------------------------------------------------------------------
def _templates_qs(org):
    from appointments.models import NoteTemplate

    qs = NoteTemplate.objects.filter(kind="note", is_active=True)
    if org is not None:
        qs = qs.filter(Q(organization=org) | Q(organization__isnull=True))
    return qs


def _note_type_labels():
    from appointments.models import NOTE_TYPES_DICTIONARY_CODE, DictionaryItem

    return {i.value: i.label for i in DictionaryItem.objects.filter(dictionary__code=NOTE_TYPES_DICTIONARY_CODE)}


def template_list(org):
    """Every note or screen a report can start from: active templates, then the fixed SOAP types."""
    labels = _note_type_labels()
    out, codes = [], set()
    for t in _templates_qs(org).order_by("name"):
        codes.add(t.code)
        out.append({"code": t.code, "name": t.name, "structured": True, "group": labels.get(t.note_type) or "Other structured notes"})
    for code, name in BUILTIN_TYPES.items():
        if code not in codes:
            out.append({"code": code, "name": name, "structured": False, "group": "Free-text notes"})
    return out


def _fields_of(code, org):
    """The observations of one template (live definition), as plain dicts."""
    t = _templates_qs(org).filter(code=code).first()
    if t is None:
        if code in BUILTIN_TYPES:
            return [{"key": k, "label": label, "field_type": "textarea", "section": "", "soap": True} for k, label in SOAP]
        return []
    out = []
    for f in t.fields.all().order_by("sort_order", "id"):
        if f.field_type in SKIP_TYPES:
            continue
        out.append({"key": f.key, "label": f.label, "field_type": f.field_type, "section": f.section_label or "", "soap": False})
    return out


def observation_catalog(codes, org):
    """Observations of the picked templates. A field with the same key, label and type in several of them is one
    observation (so a "Total score" lines up in one column); otherwise each template keeps its own."""
    seen = OrderedDict()
    for code in codes:
        for f in _fields_of(code, org):
            seen.setdefault(f["key"], []).append((code, f))
    out = []

    def add(oid, label, ftype, section, items, soap):
        out.append({"id": oid, "label": label, "type": ftype, "section": section, "codes": [c for c, _ in items], "field_key": items[0][1]["key"], "soap": soap, "meaning_of": None})
        if ftype == "calculated":
            out.append({"id": oid + MEANING_SUFFIX, "label": f"{label} · meaning", "type": "meaning", "section": section, "codes": [c for c, _ in items], "field_key": items[0][1]["key"], "soap": False, "meaning_of": oid})

    for key, items in seen.items():
        shapes = {(f["label"], f["field_type"]) for _, f in items}
        if len(shapes) == 1:
            f = items[0][1]
            add(key, f["label"], f["field_type"], f["section"], items, f["soap"])
        else:
            for code, f in items:
                add(f"{code}.{key}", f["label"], f["field_type"], f["section"], [(code, f)], f["soap"])
    return out


def catalog(user, org, codes=None):
    """What the builder needs: the templates to pick from, and the observations of the picked ones."""
    codes = [c for c in (codes or []) if isinstance(c, str)][:MAX_TEMPLATES]
    return {
        "templates": template_list(org),
        "observations": [
            {k: o[k] for k in ("id", "label", "type", "section", "codes")} for o in observation_catalog(codes, org)
        ],
        "max_templates": MAX_TEMPLATES,
        "max_observations": MAX_OBSERVATIONS,
    }


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def clean_docs(raw):
    raw = raw if isinstance(raw, dict) else {}
    codes = []
    for c in raw.get("templates") or []:
        if isinstance(c, str) and c.strip() and c.strip() not in codes:
            codes.append(c.strip()[:64])
    if not codes:
        raise ReportConfigError("Choose at least one note or screen.")
    if len(codes) > MAX_TEMPLATES:
        raise ReportConfigError(f"Choose {MAX_TEMPLATES} notes or screens or fewer.")
    obs = []
    for o in raw.get("observations") or []:
        if isinstance(o, str) and o and o not in obs:
            obs.append(o[:140])
    if len(obs) > MAX_OBSERVATIONS:
        raise ReportConfigError(f"Choose {MAX_OBSERVATIONS} observations or fewer.")
    layout = raw.get("layout") if raw.get("layout") in LAYOUTS else "wide"
    status = raw.get("status") if raw.get("status") in STATUSES else "signed"
    return {"templates": codes, "observations": obs, "layout": layout, "status": status}


def split_config(raw):
    """The config from the client holds `docs` beside the usual report settings."""
    raw = raw if isinstance(raw, dict) else {}
    return clean_docs(raw.get("docs")), {k: v for k, v in raw.items() if k != "docs"}


# ---------------------------------------------------------------------------
# Values
# ---------------------------------------------------------------------------
def _truthy(raw):
    return raw is True or str(raw).strip().lower() in ("true", "yes", "1", "on")


def _label_of(options, raw):
    return options.get(str(raw), str(raw))


def _show(raw, ftype, options):
    """(text to show, number or None) for one stored answer."""
    if _is_empty(raw):
        return None, None
    if ftype == "checkbox":
        return ("Yes" if _truthy(raw) else "No"), None
    if ftype in ("radio", "dropdown"):
        return _label_of(options, raw), None
    if ftype == "multiselect":
        items = raw if isinstance(raw, (list, tuple)) else [raw]
        return ", ".join(_label_of(options, x) for x in items if not _is_empty(x)) or None, None
    if ftype in NUMBER_TYPES:
        return str(raw), _number(raw)
    return str(raw).strip() or None, None


def _snapshot_options(n):
    snap = n.template_snapshot or {}
    out = {}
    for f in snap.get("fields") or []:
        out[f.get("key")] = {str(o.get("value")): o.get("label") for o in f.get("options") or [] if isinstance(o, dict)}
    return out


def _note_code(n):
    if n.template_id:
        return n.template.code
    return n.documentation_type or n.note_type or "note"


def _observation_value(n, o, live_options, snap_options, hide):
    """(text, number) of observation `o` in note `n`, or (None, None) when the note has none."""
    if _note_code(n) not in o["codes"]:
        return None, None
    data = n.structured_data or {}
    if o["soap"]:
        raw = getattr(n, o["field_key"], "")
        text, num = _show(raw, "textarea", {})
        masked = hide and text
        return ("[Hidden]" if masked else text), None
    if o["meaning_of"]:
        raw = data.get(o["field_key"] + MEANING_SUFFIX)
        return (str(raw).strip() or None) if not _is_empty(raw) else None, None
    options = snap_options.get(o["field_key"]) or live_options.get(o["field_key"]) or {}
    text, num = _show(data.get(o["field_key"]), o["type"], options)
    if hide and text and o["type"] in TEXT_TYPES:
        text = "[Hidden]"
    return text, num


def _live_options(codes, org):
    out = {}
    for t in _templates_qs(org).filter(code__in=codes).prefetch_related("fields__dictionary__items"):
        for f in t.fields.all():
            if f.dictionary_id:
                out.setdefault(f.key, {}).update({i.value: i.label for i in f.dictionary.items.all()})
    return out


# ---------------------------------------------------------------------------
# The source
# ---------------------------------------------------------------------------
def _base_fields():
    return [
        dim("template", "Note or screen"), dim("note_id", "Note ID"), dim("status", "Status"),
        dim("date", "Date documented", "date"), dim("signed_on", "Date signed", "date"),
        dim("patient", "Patient name", phi="name"), dim("mrn", "MRN", phi="text"), dim("visit_id", "Visit ID"),
        dim("author", "Author"), dim("author_role", "Author's role"),
        dim("attending", "Attending physician"), dim("discipline", "Physician's discipline"),
        dim("visit_date", "Visit date", "date"), dim("unit", "Unit or clinic"), dim("facility", "Facility"),
        measure("notes", "Notes"), measure("hours_to_sign", "Hours to sign", "hours", agg="avg"),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ]


BASE_COLUMNS = ["template", "date", "patient", "mrn", "visit_id", "author", "attending", "discipline"]


def _load_notes(org, start, end, user, docs, observations, hide):
    from appointments.models import ClinicalNote
    from users.facility_scope import assigned_facility_ids

    codes = docs["templates"]
    qs = (
        ClinicalNote.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
        .filter(Q(organization=org) | Q(organization__isnull=True, appointment__organization=org))
        .filter(
            Q(template__code__in=codes)
            | Q(template__isnull=True, documentation_type__in=codes)
            | Q(template__isnull=True, documentation_type="", note_type__in=codes)
        )
        .select_related("patient__patient_profile", "author", "template", "appointment__provider__staff_profile", "appointment__unit__facility")
        .order_by("created_at")
    )
    if docs["status"] == "signed":
        qs = qs.filter(status="signed")
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))

    names = {t["code"]: t["name"] for t in template_list(org)}
    live = _live_options(codes, org)
    long_layout = docs["layout"] == "long"
    rows = []
    for count, n in enumerate(qs[: MAX_NOTES + 1]):
        if count >= MAX_NOTES:
            raise ReportConfigError("This covers too many notes. Choose a shorter date range or fewer notes.")
        code = _note_code(n)
        appt = n.appointment if n.appointment_id else None
        unit = appt.unit if appt and appt.unit_id else None
        made = _local(n.created_at)
        base = {
            "_patient": n.patient_id, "_id": n.pk,
            "template": names.get(code) or (n.template.name if n.template_id else _pretty(code)),
            "note_id": f"N-{n.pk}", "status": "Signed" if n.status == "signed" else "Draft",
            "date": made.date().isoformat(), "signed_on": _local(n.signed_at).date().isoformat() if n.signed_at else None,
            "patient": _person(n.patient, "Unknown patient"), "mrn": _mrn(n.patient),
            "visit_id": str(n.appointment_id) if n.appointment_id else None,
            "author": _person(n.author), "author_role": _pretty(n.author_role_at_signing or getattr(n.author, "role", "")) or "Unknown",
            "attending": _person(appt.provider, "Not set") if appt and appt.provider_id else "Not set",
            "discipline": _discipline(appt.provider) if appt and appt.provider_id else "Not set",
            "visit_date": _local(appt.appointment_datetime).date().isoformat() if appt else None,
            "unit": unit.name if unit else "No location", "facility": unit.facility.name if unit else "No location",
            "notes": 1,
            "hours_to_sign": max((n.signed_at - n.created_at).total_seconds() / 3600.0, 0) if n.signed_at else None,
        }
        snap = _snapshot_options(n)
        if long_layout:
            for o in observations:
                text, num = _observation_value(n, o, live, snap, hide)
                if text is None:
                    continue
                rows.append({**base, "observation": o["label"], "value": text, "value_num": num})
        else:
            row = dict(base)
            for o in observations:
                text, num = _observation_value(n, o, live, snap, hide)
                if o["type"] in NUMBER_TYPES:
                    row[f"num__{o['id']}"] = num if num is not None else None
                else:
                    row[f"obs__{o['id']}"] = text
            rows.append(row)
    return rows


def build_source(docs, org, user, hide=False):
    """A report source for engine.run_report, made for these notes and observations."""
    cat = observation_catalog(docs["templates"], org)
    by_id = {o["id"]: o for o in cat}
    picked = [by_id[i] for i in docs["observations"] if i in by_id]
    fields = _base_fields()
    columns = list(BASE_COLUMNS)
    if docs["layout"] == "long":
        fields += [
            dim("observation", "Observation"), dim("value", "Value"),
            measure("value_num", "Value (number)", agg="avg"),
        ]
        columns += ["observation", "value"]
    else:
        for o in picked:
            if o["type"] in NUMBER_TYPES:
                fields.append(measure(f"num__{o['id']}", o["label"], "number", agg="avg"))
                columns.append(f"num__{o['id']}")
            else:
                phi = "text" if (o["soap"] or o["type"] in TEXT_TYPES) else None
                fields.append(dim(f"obs__{o['id']}", o["label"], phi=phi))
                columns.append(f"obs__{o['id']}")
    return {
        "key": DOC_KEY, "module": "notes", "right": RIGHT, "scoped": True, "patient_data": True,
        "label": "Documentation", "group": "Documentation", "description": "", "fields": fields, "dated": True,
        "load": lambda o_, s_, e_, u_=None: _load_notes(o_, s_, e_, u_ if u_ is not None else user, docs, picked, hide),
        "default_columns": columns, "default_group": None,
    }


def _load_empty(org, start, end, user=None):
    return []


# Registered so the source appears in the list of sources (and its access rule is the Notes report's). Reports
# run through build_source(), which adds the observation columns of the chosen notes.
register(
    DOC_KEY, "Documentation", "Documentation",
    "Notes and screens (structured or free text) with their patient, people, visit and the observations you pick, "
    "each with its label and value. Each run is audit-logged.",
    _base_fields(), _load_empty, default_columns=BASE_COLUMNS, module="notes", right=RIGHT, scoped=True, patient_data=True,
)
