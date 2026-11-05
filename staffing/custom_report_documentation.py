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
MAX_GROUPS = 12
MAX_EXPANDED = 40  # notes and flowsheets a report may cover once whole categories are included
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

# Flowsheets are documentation too: a flowsheet is picked as "flowsheet:<template code>", and each time point
# charted on it is one document (wide layout) with its charted items as the observations.
FS_PREFIX = "flowsheet:"


def is_flowsheet(code):
    return isinstance(code, str) and code.startswith(FS_PREFIX)


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


def _flowsheet_templates_qs(org):
    from appointments.models import FlowsheetTemplate

    qs = FlowsheetTemplate.objects.filter(is_active=True)
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
    for t in _flowsheet_templates_qs(org).order_by("sort_order", "name"):
        out.append({"code": FS_PREFIX + t.code, "name": t.name, "structured": True, "group": "Flowsheets"})
    return out


def _fields_of(code, org):
    """The observations of one template (live definition), as plain dicts."""
    if is_flowsheet(code):
        t = _flowsheet_templates_qs(org).filter(code=code[len(FS_PREFIX):]).first()
        if t is None:
            return []
        return [
            {"key": r.key, "label": r.label, "field_type": r.field_type, "section": r.section_label or "", "soap": False}
            for r in t.rows.all().order_by("sort_order", "id")
        ]
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


def expand(docs, org):
    """The picked templates plus every current template of the categories the report always includes.
    New notes, screens and flowsheets added to those categories join the report by themselves."""
    groups = docs.get("groups") or []
    if not groups:
        return docs
    codes = list(docs["templates"])
    for t in template_list(org):
        if t["group"] in groups and t["code"] not in codes:
            codes.append(t["code"])
    if len(codes) > MAX_EXPANDED:
        raise ReportConfigError(f"Those categories cover {len(codes)} notes; the most one report can use is {MAX_EXPANDED}.")
    return {**docs, "templates": codes}


def catalog(user, org, codes=None, groups=None):
    """What the builder needs: the templates to pick from, and the observations of the picked ones."""
    codes = [c for c in (codes or []) if isinstance(c, str)][:MAX_TEMPLATES]
    groups = [g for g in (groups or []) if isinstance(g, str)][:MAX_GROUPS]
    templates = template_list(org)
    covered = expand({"templates": codes, "groups": groups}, org)["templates"] if (codes or groups) else []
    return {
        "templates": templates,
        "groups": sorted({t["group"] for t in templates}),
        "covered": covered,
        "observations": [
            {k: o[k] for k in ("id", "label", "type", "section", "codes")} for o in observation_catalog(covered, org)
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
    groups = []
    for g in raw.get("groups") or []:
        if isinstance(g, str) and g.strip() and g.strip() not in groups:
            groups.append(g.strip()[:80])
    if len(groups) > MAX_GROUPS:
        raise ReportConfigError(f"Choose {MAX_GROUPS} categories or fewer.")
    if not codes and not groups:
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
    return {"templates": codes, "groups": groups, "observations": obs, "layout": layout, "status": status}


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


def _flowsheet_options(codes, org):
    """{template code: {row key: {value: label}}} for the flowsheet rows that pick from a dictionary."""
    out = {}
    qs = _flowsheet_templates_qs(org).filter(code__in=[c[len(FS_PREFIX):] for c in codes if is_flowsheet(c)])
    for t in qs.prefetch_related("rows__dictionary__items"):
        for r in t.rows.all():
            if r.dictionary_id:
                out.setdefault(FS_PREFIX + t.code, {})[r.key] = {i.value: i.label for i in r.dictionary.items.all()}
    return out


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
        dim("date", "Date documented", "date"), dim("time", "Time documented"), dim("signed_on", "Date signed", "date"),
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

    codes = [c for c in docs["templates"] if not is_flowsheet(c)]
    if not codes:
        return []
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
            "_patient": n.patient_id, "_id": n.pk, "_ref": f"note:{n.pk}", "_appt": n.appointment_id,
            "_author": n.author_id, "_doc": appt.provider_id if appt else None,
            "template": names.get(code) or (n.template.name if n.template_id else _pretty(code)),
            "note_id": f"N-{n.pk}", "status": "Signed" if n.status == "signed" else "Draft",
            "date": made.date().isoformat(), "time": made.strftime("%H:%M"), "signed_on": _local(n.signed_at).date().isoformat() if n.signed_at else None,
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


def _load_flowsheets(org, start, end, user, docs, observations, hide):
    """Flowsheets as documentation: one document per time point charted, with the picked items as observations."""
    from appointments.models import VitalSignsFlowsheet
    from django.contrib.auth import get_user_model
    from users.facility_scope import assigned_facility_ids

    codes = [c for c in docs["templates"] if is_flowsheet(c)]
    if not codes:
        return []
    qs = (
        VitalSignsFlowsheet.objects.filter(
            organization=org, template__code__in=[c[len(FS_PREFIX):] for c in codes],
            updated_at__date__gte=start, created_at__date__lte=end,
        )
        .select_related("patient__patient_profile", "template", "created_by", "appointment__provider__staff_profile", "appointment__unit__facility")
        .order_by("id")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))

    live = _flowsheet_options(codes, org)
    roles = {}
    for sheet in qs:
        for col in sheet.columns or []:
            if isinstance(col.get("recorded_by"), int):
                roles[col["recorded_by"]] = None
    for u in get_user_model().objects.filter(pk__in=list(roles)):
        roles[u.pk] = u.role
    long_layout = docs["layout"] == "long"
    rows = []
    for sheet in qs:
        code = FS_PREFIX + sheet.template.code
        options = live.get(code, {})
        appt = sheet.appointment
        unit = appt.unit if appt.unit_id else None
        for number, col in enumerate(sheet.columns or [], start=1):
            when = _stamp_local(col.get("timestamp"))
            if when is None or not (start <= when.date() <= end):
                continue
            if len(rows) >= MAX_NOTES:
                raise ReportConfigError("This covers too many documents. Choose a shorter date range or fewer notes.")
            who = (col.get("recorded_by_name") or "").strip() or _person(sheet.created_by)
            base = {
                "_patient": sheet.patient_id, "_id": f"{sheet.pk}:{col.get('id')}", "_ref": f"flowsheet:{sheet.pk}:{col.get('id')}",
                "_appt": sheet.appointment_id, "_doc": appt.provider_id if appt.provider_id else None,
                "_author": col.get("recorded_by") if isinstance(col.get("recorded_by"), int) else None,
                "template": sheet.template.name, "note_id": f"F-{sheet.pk}-{number}", "status": "Charted",
                "date": when.date().isoformat(), "time": when.strftime("%H:%M"), "signed_on": None,
                "patient": _person(sheet.patient, "Unknown patient"), "mrn": _mrn(sheet.patient),
                "visit_id": str(sheet.appointment_id),
                "author": who, "author_role": _pretty(roles.get(col.get("recorded_by")) or "") or "Unknown",
                "attending": _person(appt.provider, "Not set") if appt.provider_id else "Not set",
                "discipline": _discipline(appt.provider) if appt.provider_id else "Not set",
                "visit_date": _local(appt.appointment_datetime).date().isoformat(),
                "unit": unit.name if unit else "No location", "facility": unit.facility.name if unit else "No location",
                "notes": 1, "hours_to_sign": None,
            }
            data = sheet.data or {}
            if long_layout:
                for o in observations:
                    if code not in o["codes"]:
                        continue
                    text, num = _show((data.get(o["field_key"]) or {}).get(col.get("id")), o["type"], options.get(o["field_key"], {}))
                    if text is None:
                        continue
                    if hide and o["type"] in TEXT_TYPES:
                        text = "[Hidden]"
                    rows.append({**base, "observation": o["label"], "value": text, "value_num": num})
            else:
                row = dict(base)
                for o in observations:
                    text = num = None
                    if code in o["codes"]:
                        text, num = _show((data.get(o["field_key"]) or {}).get(col.get("id")), o["type"], options.get(o["field_key"], {}))
                        if hide and text and o["type"] in TEXT_TYPES:
                            text = "[Hidden]"
                    if o["type"] in NUMBER_TYPES:
                        row[f"num__{o['id']}"] = num
                    else:
                        row[f"obs__{o['id']}"] = text
                rows.append(row)
    return rows


def _stamp_local(text):
    try:
        dt = datetime.datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return _local(dt)


def _load_all(org, start, end, user, docs, observations, hide):
    rows = _load_notes(org, start, end, user, docs, observations, hide)
    rows += _load_flowsheets(org, start, end, user, docs, observations, hide)
    return rows


def build_source(docs, org, user, hide=False):
    """A report source for engine.run_report, made for these notes and observations."""
    docs = expand(docs, org)
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
        "load": lambda o_, s_, e_, u_=None: _load_all(o_, s_, e_, u_ if u_ is not None else user, docs, picked, hide),
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


# ---------------------------------------------------------------------------
# One whole document (the reading view behind a row)
# ---------------------------------------------------------------------------
class DocumentNotFound(Exception):
    pass


def _stamp_text(dt):
    return _local(dt).strftime("%Y-%m-%d %H:%M") if dt else None


def _header(pairs):
    return [{"label": k, "value": v} for k, v in pairs if v not in (None, "")]


def _visit_header(appt):
    unit = appt.unit if appt and appt.unit_id else None
    return [
        ("Visit ID", str(appt.pk) if appt else None),
        ("Visit date", _local(appt.appointment_datetime).strftime("%Y-%m-%d %H:%M") if appt else None),
        ("Attending physician", _person(appt.provider, "Not set") if appt and appt.provider_id else "Not set"),
        ("Physician's discipline", _discipline(appt.provider) if appt and appt.provider_id else "Not set"),
        ("Unit or clinic", unit.name if unit else "No location"),
        ("Facility", unit.facility.name if unit else "No location"),
    ]


def _sections(items):
    """[(section, item)] -> [{"label", "items"}] keeping the order the fields come in."""
    out = OrderedDict()
    for section, item in items:
        out.setdefault(section or "", []).append(item)
    return [{"label": k, "items": v} for k, v in out.items()]


def _note_document(ref_id, org, user, hide):
    from appointments.models import ClinicalNote
    from users.facility_scope import assigned_facility_ids

    qs = (
        ClinicalNote.objects.filter(pk=ref_id)
        .filter(Q(organization=org) | Q(organization__isnull=True, appointment__organization=org))
        .select_related("patient__patient_profile", "author", "template", "appointment__provider__staff_profile", "appointment__unit__facility")
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))
    n = qs.first()
    if n is None:
        raise DocumentNotFound()
    appt = n.appointment if n.appointment_id else None
    snap = n.template_snapshot or {}
    data = n.structured_data or {}
    options = _snapshot_options(n)
    items = []
    if n.template_id:
        fields = snap.get("fields") or []
        if not fields or not all(f.get("label") and f.get("field_type") for f in fields):
            # no complete frozen copy of the template: fall back to its current definition
            fields = [
                {"key": f["key"], "label": f["label"], "field_type": f["field_type"], "section_label": f["section"]}
                for f in _fields_of(n.template.code, org)
            ]
        live = _live_options([n.template.code], org)
        for f in fields:
            ftype = f.get("field_type")
            if ftype in SKIP_TYPES:
                continue
            key = f.get("key")
            text, _num = _show(data.get(key), ftype, options.get(key) or live.get(key) or {})
            if text is None:
                continue
            if hide and ftype in TEXT_TYPES:
                text = "[Hidden]"
            item = {"label": f.get("label") or key, "value": text, "type": ftype}
            meaning = data.get(key + MEANING_SUFFIX)
            if ftype == "calculated" and not _is_empty(meaning):
                item["meaning"] = str(meaning).strip()
            items.append((f.get("section_label") or "", item))
    else:
        for key, label in SOAP:
            text, _num = _show(getattr(n, key, ""), "textarea", {})
            if text is None:
                continue
            items.append(("", {"label": label, "value": "[Hidden]" if hide else text, "type": "textarea"}))
    code = _note_code(n)
    names = {t["code"]: t["name"] for t in template_list(org)}
    mrn = _mrn(n.patient)
    return {
        "kind": "note",
        "title": names.get(code) or (n.template.name if n.template_id else _pretty(code)),
        "status": "Signed" if n.status == "signed" else "Draft",
        "header": _header(
            [
                ("Patient", "[Hidden]" if hide else _person(n.patient, "Unknown patient")),
                ("MRN", "[Hidden]" if hide and mrn else mrn),
                ("Documented", _stamp_text(n.created_at)),
                ("Signed", _stamp_text(n.signed_at)),
                ("Author", _person(n.author)),
                ("Author's role", _pretty(n.author_role_at_signing or getattr(n.author, "role", ""))),
            ]
            + _visit_header(appt)
        ),
        "sections": _sections(items),
        "patient_id": n.patient_id,
    }


def _flowsheet_document(sheet_id, col_id, org, user, hide):
    from appointments.models import VitalSignsFlowsheet
    from users.facility_scope import assigned_facility_ids

    qs = VitalSignsFlowsheet.objects.filter(pk=sheet_id, organization=org).select_related(
        "patient__patient_profile", "template", "created_by", "appointment__provider__staff_profile", "appointment__unit__facility"
    )
    ids = assigned_facility_ids(user)
    if ids is not None:
        qs = qs.filter(Q(appointment__unit__facility_id__in=ids) | Q(appointment__unit__isnull=True))
    sheet = qs.first()
    col = next((c for c in (sheet.columns if sheet else []) if c.get("id") == col_id), None)
    if sheet is None or col is None:
        raise DocumentNotFound()
    options = _flowsheet_options([FS_PREFIX + sheet.template.code], org).get(FS_PREFIX + sheet.template.code, {})
    items = []
    for r in sheet.template.rows.all().order_by("sort_order", "id"):
        text, _num = _show(((sheet.data or {}).get(r.key) or {}).get(col_id), r.field_type, options.get(r.key, {}))
        if text is None:
            continue
        if hide and r.field_type in TEXT_TYPES:
            text = "[Hidden]"
        label = f"{r.label} ({r.unit})" if r.unit else r.label
        items.append((r.section_label or "", {"label": label, "value": text, "type": r.field_type}))
    when = _stamp_local(col.get("timestamp"))
    mrn = _mrn(sheet.patient)
    return {
        "kind": "flowsheet",
        "title": sheet.template.name,
        "status": "Charted",
        "header": _header(
            [
                ("Patient", "[Hidden]" if hide else _person(sheet.patient, "Unknown patient")),
                ("MRN", "[Hidden]" if hide and mrn else mrn),
                ("Charted", when.strftime("%Y-%m-%d %H:%M") if when else None),
                ("Charted by", (col.get("recorded_by_name") or "").strip() or _person(sheet.created_by)),
            ]
            + _visit_header(sheet.appointment)
        ),
        "sections": _sections(items),
        "patient_id": sheet.patient_id,
    }


def document(ref, org, user, hide=True):
    """The whole note or flowsheet time point behind a report row ("note:12" or "flowsheet:7:col_x")."""
    parts = str(ref or "").split(":")
    try:
        if parts[0] == "note" and len(parts) == 2:
            return _note_document(int(parts[1]), org, user, hide)
        if parts[0] == "flowsheet" and len(parts) == 3:
            return _flowsheet_document(int(parts[1]), parts[2], org, user, hide)
    except ValueError:
        pass
    raise DocumentNotFound()
