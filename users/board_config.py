"""
What an ED board looks like, as data.

Two kinds of thing, kept apart on purpose:

* Shared settings (one per clinic): the status list, the overdue-vitals limit, the custom columns (name, kind,
  choices) and the nurse/doctor lists. They describe what the data on a visit means, so every view agrees.
* Views (many per clinic, each with a name an admin picks): which columns show and in what order, color rules,
  and which patients the view lists. A view appears in the board's View dropdown.
"""
import copy
import re

from .models import CustomUser, StatusBoardSettings, StatusBoardView

# (key, label, width): the columns the board knows how to draw.
BUILTIN_COLUMNS = [
    ("loc", "LOC", 80),
    ("los", "LOS", 100),
    ("patient", "Patient", 170),
    ("age", "Age", 80),
    ("reason", "Visit Reason", 130),
    ("complaint", "Chief Complaint", 130),
    ("esi", "ESI", 70),
    ("triage_note", "Triage Note", 110),
    ("reassess", "Reassess", 110),
    ("status", "STS", 90),
    ("md", "MD", 150),
    ("rn", "RN", 150),
    ("resident", "Resident", 120),
    ("comments", "Comments", 190),
    ("vitals", "Vitals", 110),
    ("meds", "Meds", 60),
    ("lab", "Lab", 60),
    ("rad", "Rad", 60),
    ("urine", "Urine", 60),
    ("ekg", "EKG", 60),
    ("cardiac", "Cardiac", 70),
    ("bed_status", "Bed Status", 100),
    ("inc_reg", "Inc Reg", 70),
    ("gender", "Gender", 80),
    ("reg_comp", "REG Comp", 90),
    ("actions", "", 130),
]
BUILTIN_KEYS = [k for k, _l, _w in BUILTIN_COLUMNS]
# Only a follow-up board (discharged ED patients) has these two.
FOLLOW_UP_COLUMNS = [
    ("discharged", "Discharged", 150),
    ("new_results", "New results", 150),
]
FOLLOW_UP_KEYS = [k for k, _l, _w in FOLLOW_UP_COLUMNS]
# Without these the board is not usable, so a view cannot hide them.
ALWAYS_VISIBLE = {"loc", "patient", "actions"}
FOLLOW_UP_ALWAYS_VISIBLE = {"patient"}  # a discharged patient has no bed, so Location can go
# Columns a follow-up board starts with; the rest of the standard columns start hidden.
FOLLOW_UP_DEFAULT_ON = ("discharged", "new_results", "patient", "age", "complaint", "esi", "md", "rn", "comments")

KINDS = ("live", "follow_up")
DEFAULT_FOLLOW_UP_DAYS, MAX_FOLLOW_UP_DAYS = 7, 30

DEFAULT_STATUSES = [
    {"value": "wtbs", "code": "WTBS", "label": "Waiting to be seen"},
    {"value": "tip", "code": "TIP", "label": "Treatment in progress"},
    {"value": "dispo", "code": "DISPO", "label": "Disposition pending"},
    {"value": "admit_pending", "code": "ADM", "label": "Admit pending"},
    {"value": "discharge_pending", "code": "DC", "label": "Discharge pending"},
]

# The views every clinic has; they cannot be edited. `filter` says which rows they list.
BUILTIN_VIEWS = [
    {"key": "all", "label": "ED All View", "filter": "all"},
    {"key": "waiting", "label": "Waiting Area", "filter": "waiting"},
]
BUILTIN_VIEW_KEYS = {v["key"] for v in BUILTIN_VIEWS}
# The follow-up board's own standard view (the live board's list never includes it).
BUILTIN_FOLLOW_UP_VIEW = {"key": "followup", "label": "ED Follow-up", "filter": "all"}
FILTERS = ("all", "waiting", "mine")

CUSTOM_KEY = re.compile(r"^c_[a-z0-9_]{1,30}$")
STATUS_VALUE = re.compile(r"^[a-z0-9_]{1,20}$")
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
CUSTOM_KINDS = ("text", "dropdown", "checkbox")
RULE_FIELDS = ("esi", "ed_status", "vitals_overdue", "recheck_overdue", "registration_complete", "sex")
MAX_VIEWS, MAX_COLUMNS, MAX_RULES, MAX_STATUSES, MAX_OPTIONS, MAX_CUSTOM, MAX_BEDS = 30, 60, 30, 12, 30, 20, 500

# Conditions on the patient that a view can keep: field -> the operations it understands.
CRITERIA_FIELDS = {
    "age": ("lt", "lte", "gt", "gte"),
    "esi": ("in",),
    "ed_status": ("in",),
    "sex": ("in",),
    "md": ("in",),
    "rn": ("in",),
    "complaint": ("contains",),
}
AGE_UNITS = ("years", "months", "days")
SEXES = ("F", "M", "X")
MAX_CONDITIONS = 10


class ConfigError(ValueError):
    pass


def default_settings():
    return {
        "statuses": copy.deepcopy(DEFAULT_STATUSES),
        "vitals_overdue_minutes": 60,
        "custom_columns": [],
        "roster": {"default": {"nurses": None, "doctors": None}, "units": {}},
    }


def default_criteria():
    return {"match": "all", "conditions": []}


def default_follow_up():
    return {"days": DEFAULT_FOLLOW_UP_DAYS}


def default_view_config(kind="live"):
    if kind == "follow_up":
        # the standard layout, with Discharged and New results right after Age
        columns = []
        for k, label, w in BUILTIN_COLUMNS:
            columns.append({"key": k, "label": label, "width": w, "visible": k in FOLLOW_UP_DEFAULT_ON, "type": "builtin"})
            if k == "age":
                columns += [{"key": fk, "label": fl, "width": fw, "visible": True, "type": "builtin"} for fk, fl, fw in FOLLOW_UP_COLUMNS]
    else:
        columns = [{"key": k, "label": label, "width": w, "visible": True, "type": "builtin"} for k, label, w in BUILTIN_COLUMNS]
    return {
        "kind": kind,
        "columns": columns,
        "rules": [],
        "filter": "all",
        "beds": [],
        "criteria": default_criteria(),
        "show_empty_beds": True,
        "follow_up": default_follow_up(),
    }


def always_visible(kind):
    return FOLLOW_UP_ALWAYS_VISIBLE if kind == "follow_up" else ALWAYS_VISIBLE


def _text(value, name, limit, required=False):
    value = ("" if value is None else str(value)).strip()
    if required and not value:
        raise ConfigError(f"{name} is required.")
    if len(value) > limit:
        raise ConfigError(f"{name} can be at most {limit} characters.")
    return value


# ---------------------------------------------------------------- shared settings

def get_settings(org):
    """The clinic's shared settings, with defaults for anything it has not set."""
    out = default_settings()
    row = StatusBoardSettings.objects.filter(organization=org).first()
    if row:
        if row.statuses:
            out["statuses"] = row.statuses
        out["vitals_overdue_minutes"] = row.vitals_overdue_minutes
        out["custom_columns"] = row.custom_columns or []
        roster = row.roster or {}
        out["roster"] = {"default": roster.get("default") or out["roster"]["default"], "units": roster.get("units") or {}}
    return out


def _clean_statuses(raw):
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_STATUSES:
        raise ConfigError(f"There must be between 1 and {MAX_STATUSES} statuses.")
    out, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            raise ConfigError("Each status must be an object.")
        value = str(item.get("value") or "")
        if not STATUS_VALUE.match(value):
            raise ConfigError("A status key can only use lowercase letters, numbers and underscores (up to 20).")
        if value in seen:
            raise ConfigError(f"Status '{value}' appears twice.")
        seen.add(value)
        out.append({"value": value, "code": _text(item.get("code"), "A status code", 8, required=True), "label": _text(item.get("label"), "A status name", 40, required=True)})
    return out


def _clean_custom_columns(raw):
    if not isinstance(raw, list) or len(raw) > MAX_CUSTOM:
        raise ConfigError(f"There can be at most {MAX_CUSTOM} custom columns.")
    out, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            raise ConfigError("Each custom column must be an object.")
        key = str(item.get("key") or "")
        if not CUSTOM_KEY.match(key):
            raise ConfigError(f"'{key}' is not a valid custom column.")
        if key in seen:
            raise ConfigError(f"Custom column '{key}' appears twice.")
        seen.add(key)
        label = _text(item.get("label"), "A column name", 40, required=True)
        kind = item.get("kind", "text")
        if kind not in CUSTOM_KINDS:
            raise ConfigError("A custom column must be text, dropdown or checkbox.")
        column = {"key": key, "label": label, "kind": kind}
        if kind == "dropdown":
            options = item.get("options") or []
            if not isinstance(options, list) or not options or len(options) > MAX_OPTIONS:
                raise ConfigError(f"The dropdown '{label}' needs between 1 and {MAX_OPTIONS} choices.")
            cleaned = []
            for option in options:
                option = _text(option, "A dropdown choice", 40, required=True)
                if option not in cleaned:
                    cleaned.append(option)
            column["options"] = cleaned
        out.append(column)
    return out


def _clean_people(raw, org):
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for name, role in (("nurses", "nurse"), ("doctors", "doctor")):
        ids = raw.get(name)
        if ids is None:
            out[name] = None
            continue
        if not isinstance(ids, list):
            raise ConfigError("The roster must be a list of people.")
        try:
            wanted = {int(i) for i in ids}
        except (TypeError, ValueError):
            raise ConfigError("The roster must be a list of people.")
        found = set(CustomUser.objects.filter(pk__in=wanted, organization=org, role=role, is_active=True).values_list("pk", flat=True))
        if found != wanted:
            raise ConfigError(f"Everyone on the {role} roster must be an active {role} in this clinic.")
        out[name] = sorted(found)
    return out


def _clean_roster(raw, org):
    from appointments.models import Unit

    raw = raw if isinstance(raw, dict) else {}
    units = {}
    for unit_id, people in (raw.get("units") or {}).items():
        if not Unit.objects.filter(pk=unit_id, facility__organization=org, care_type="emergency").exists():
            raise ConfigError("A department roster belongs to an emergency department in this clinic.")
        cleaned = _clean_people(people, org)
        if cleaned != {"nurses": None, "doctors": None}:
            units[str(unit_id)] = cleaned
    return {"default": _clean_people(raw.get("default"), org), "units": units}


def clean_settings(raw, org, current=None):
    """The shared settings in canonical form (anything not sent keeps its current value), or ConfigError."""
    if not isinstance(raw, dict):
        raise ConfigError("The settings are missing.")
    current = current or get_settings(org)
    out = dict(current)
    if "statuses" in raw:
        out["statuses"] = _clean_statuses(raw["statuses"])
    if "vitals_overdue_minutes" in raw:
        try:
            minutes = int(raw["vitals_overdue_minutes"])
        except (TypeError, ValueError):
            raise ConfigError("The overdue vitals limit must be a number of minutes.")
        if not 5 <= minutes <= 1440:
            raise ConfigError("The overdue vitals limit must be between 5 and 1440 minutes.")
        out["vitals_overdue_minutes"] = minutes
    if "custom_columns" in raw:
        out["custom_columns"] = _clean_custom_columns(raw["custom_columns"])
    if "roster" in raw:
        out["roster"] = _clean_roster(raw["roster"], org)
    return out


def status_keys(settings):
    return {s["value"] for s in settings["statuses"]}


def roster_for(settings, unit_id):
    """{"nurses": [ids] | None, "doctors": [...] | None} for a department (its own list, else the clinic's)."""
    own = (settings["roster"].get("units") or {}).get(str(unit_id)) if unit_id is not None else None
    return own or settings["roster"].get("default") or {"nurses": None, "doctors": None}


# --------------------------------------------------------------------------- views

def _clean_columns(raw, settings, kind="live"):
    if not isinstance(raw, list) or len(raw) > MAX_COLUMNS:
        raise ConfigError("Columns must be a list.")
    follow_up = kind == "follow_up"
    keep_on = always_visible(kind)
    extra = {k: (label, w) for k, label, w in FOLLOW_UP_COLUMNS} if follow_up else {}
    custom = {c["key"]: c for c in settings["custom_columns"]}
    out, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            raise ConfigError("Each column must be an object.")
        key = str(item.get("key") or "")
        if key in seen:
            raise ConfigError(f"Column '{key}' appears twice.")
        builtin = key in BUILTIN_KEYS or key in extra
        if not builtin and key not in custom:
            raise ConfigError(f"'{key}' is not a column the board can show.")
        seen.add(key)
        default = next((c for c in BUILTIN_COLUMNS + (FOLLOW_UP_COLUMNS if follow_up else []) if c[0] == key), None)
        fallback = default[1] if default else custom[key]["label"]
        label = _text(item.get("label", fallback), "A column name", 40, required=key != "actions")
        try:
            width = int(item.get("width") or (default[2] if default else 120))
        except (TypeError, ValueError):
            raise ConfigError("Column widths must be numbers.")
        if not 40 <= width <= 600:
            raise ConfigError("Column widths must be between 40 and 600.")
        out.append({"key": key, "label": label, "width": width, "visible": bool(item.get("visible", True)) or key in keep_on, "type": "builtin" if builtin else "custom"})
    # a view always lists every built-in and custom column; any it left out come back hidden at the end
    # (a follow-up board's own two columns come back visible, at the front)
    missing = [(k, label, w) for k, label, w in FOLLOW_UP_COLUMNS if follow_up and k not in seen]
    out = [{"key": k, "label": label, "width": w, "visible": True, "type": "builtin"} for k, label, w in missing] + out
    for key, label, width in BUILTIN_COLUMNS:
        if key not in seen:
            out.append({"key": key, "label": label, "width": width, "visible": key in keep_on, "type": "builtin"})
    for key, column in custom.items():
        if key not in seen:
            out.append({"key": key, "label": column["label"], "width": 120, "visible": False, "type": "custom"})
    return out


def _clean_rules(raw, settings):
    if not isinstance(raw, list) or len(raw) > MAX_RULES:
        raise ConfigError(f"There can be at most {MAX_RULES} color rules.")
    custom_keys = {c["key"] for c in settings["custom_columns"]}
    out = []
    for item in raw:
        if not isinstance(item, dict):
            raise ConfigError("Each color rule must be an object.")
        field = item.get("field")
        if field not in RULE_FIELDS and field not in custom_keys:
            raise ConfigError(f"A color rule cannot look at '{field}'.")
        op = item.get("op", "eq")
        if op not in ("eq", "neq"):
            raise ConfigError("A color rule must be 'is' or 'is not'.")
        target = item.get("target", "row")
        if target not in ("row", "cell"):
            raise ConfigError("A color rule colors a row or a cell.")
        color = str(item.get("color") or "")
        if not COLOR.match(color):
            raise ConfigError("Colors must look like #ff0000.")
        value = item.get("value")
        value = bool(value) if isinstance(value, bool) else _text(value, "A rule value", 40)
        out.append({"field": field, "op": op, "value": value, "target": target, "color": color})
    return out


def bed_label(bed):
    """How a bed reads on the board: the room, a hyphen, then the bed ("Adults-A")."""
    room = (bed.room.name or "").strip()
    return f"{room}-{bed.name}" if room else bed.name


def _bed_queryset(org):
    from appointments.models import Bed

    return Bed.objects.filter(room__unit__facility__organization=org, room__unit__care_type="emergency")


def _clean_beds(raw, org):
    """The beds a view is limited to (empty = every bed), as ids that exist in this clinic's emergency units."""
    if raw in (None, ""):
        return []
    if not isinstance(raw, list) or len(raw) > MAX_BEDS:
        raise ConfigError(f"A view can be limited to at most {MAX_BEDS} beds.")
    ids = []
    for item in raw:
        if isinstance(item, bool) or not isinstance(item, int):
            raise ConfigError("Beds must be picked from the list.")
        if item not in ids:
            ids.append(item)
    found = set(_bed_queryset(org).filter(pk__in=ids).values_list("pk", flat=True)) if org is not None else set(ids)
    if len(found) != len(ids):
        raise ConfigError("One of those beds is not an emergency bed in this clinic.")
    return ids


def _clean_condition(item, settings, org):
    if not isinstance(item, dict):
        raise ConfigError("Each condition must be an object.")
    field = item.get("field")
    if field not in CRITERIA_FIELDS:
        raise ConfigError(f"A view cannot filter on '{field}'.")
    op = item.get("op") or CRITERIA_FIELDS[field][0]
    if op not in CRITERIA_FIELDS[field]:
        raise ConfigError(f"'{op}' does not work with {field}.")
    value = item.get("value")
    if field == "age":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 150 or value != int(value):
            raise ConfigError("An age condition needs a whole number from 0 to 150.")
        unit = item.get("unit", "years")
        if unit not in AGE_UNITS:
            raise ConfigError("Age is counted in years, months or days.")
        return {"field": field, "op": op, "value": int(value), "unit": unit}
    if field == "complaint":
        text = _text(value, "The chief complaint text", 80, required=True)
        return {"field": field, "op": op, "value": text}
    if not isinstance(value, list) or not value or len(value) > MAX_OPTIONS * 2:
        raise ConfigError(f"Pick at least one choice for {field}.")
    if field == "esi":
        if any(isinstance(v, bool) or v not in (1, 2, 3, 4, 5) for v in value):
            raise ConfigError("Triage levels are 1 to 5.")
        picks = sorted(set(value))
    elif field == "sex":
        if any(v not in SEXES for v in value):
            raise ConfigError("Gender must be F, M or X.")
        picks = [v for v in SEXES if v in value]
    elif field == "ed_status":
        known = status_keys(settings)
        if any(v not in known for v in value):
            raise ConfigError("One of those statuses is not on this clinic's list.")
        picks = list(dict.fromkeys(value))
    else:  # md / rn: people in this clinic
        if any(isinstance(v, bool) or not isinstance(v, int) for v in value):
            raise ConfigError("Pick people from the list.")
        role = "doctor" if field == "md" else "nurse"
        picks = list(dict.fromkeys(value))
        if org is not None and CustomUser.objects.filter(pk__in=picks, organization=org, role=role).count() != len(picks):
            raise ConfigError(f"Everyone chosen must be a {role} in this clinic.")
    return {"field": field, "op": op, "value": picks}


def _clean_criteria(raw, settings, org, lenient=False):
    """{"match": "all"|"any", "conditions": [...]}; lenient drops conditions that no longer make sense."""
    raw = raw if isinstance(raw, dict) else {}
    match = raw.get("match", "all")
    if match not in ("all", "any"):
        raise ConfigError("Conditions must match all of them or any of them.")
    items = raw.get("conditions") or []
    if not isinstance(items, list) or len(items) > MAX_CONDITIONS:
        raise ConfigError(f"A view can have at most {MAX_CONDITIONS} conditions.")
    out = []
    for item in items:
        try:
            out.append(_clean_condition(item, settings, org))
        except ConfigError:
            if not lenient:
                raise
    return {"match": match, "conditions": out}


def _clean_follow_up(raw):
    raw = raw if isinstance(raw, dict) else {}
    days = raw.get("days", DEFAULT_FOLLOW_UP_DAYS)
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= MAX_FOLLOW_UP_DAYS:
        raise ConfigError(f"The look-back must be from 1 to {MAX_FOLLOW_UP_DAYS} days.")
    return {"days": days}


def clean_view_config(raw, settings, org=None, lenient=False):
    """One view's layout in canonical form, or ConfigError saying what is wrong."""
    if not isinstance(raw, dict):
        raise ConfigError("The layout is missing.")
    kind = raw.get("kind", "live")
    if kind not in KINDS:
        raise ConfigError("A view is a live board or a follow-up board.")
    view_filter = raw.get("filter", "all")
    if view_filter not in FILTERS:
        raise ConfigError("A view lists all patients, only those waiting, or only the signed-in person's.")
    if kind == "follow_up":
        view_filter = "all"  # discharged patients are never waiting, and "mine" is the person's open patients
    return {
        "kind": kind,
        "columns": _clean_columns(raw.get("columns", default_view_config(kind)["columns"]), settings, kind),
        "rules": _clean_rules(raw.get("rules", []), settings),
        "filter": view_filter,
        "beds": _clean_beds(raw.get("beds", []), org),
        "criteria": _clean_criteria(raw.get("criteria"), settings, org, lenient),
        "show_empty_beds": bool(raw.get("show_empty_beds", True)),
        "follow_up": _clean_follow_up(raw.get("follow_up")),
    }


def view_key(view):
    return f"v{view.pk}"


def view_payload(view, settings):
    """A saved view as the board and builder read it: custom columns carry their kind and choices."""
    config = clean_view_config_lenient(view.config, settings, view.organization)
    custom = {c["key"]: c for c in settings["custom_columns"]}
    columns = []
    for c in config["columns"]:
        c = dict(c)
        if c["type"] == "custom":
            c["kind"] = custom[c["key"]]["kind"]
            if custom[c["key"]]["kind"] == "dropdown":
                c["options"] = custom[c["key"]]["options"]
        columns.append(c)
    return {
        "key": view_key(view), "id": view.pk, "label": view.name, "builtin": False, "kind": config["kind"], "filter": config["filter"], "beds": config["beds"],
        "columns": columns, "rules": config["rules"], "criteria": config["criteria"], "show_empty_beds": config["show_empty_beds"], "follow_up": config["follow_up"],
    }


def clean_view_config_lenient(config, settings, org=None):
    """Like clean_view_config but drops what no longer exists (a deleted custom column) instead of failing."""
    config = dict(config or {})
    kind = config.get("kind", "live")
    kind = kind if kind in KINDS else "live"
    config["kind"] = kind
    known = set(BUILTIN_KEYS) | {c["key"] for c in settings["custom_columns"]} | (set(FOLLOW_UP_KEYS) if kind == "follow_up" else set())
    config["columns"] = [c for c in config.get("columns", []) if c.get("key") in known] or default_view_config(kind)["columns"]
    custom_keys = {c["key"] for c in settings["custom_columns"]}
    config["rules"] = [r for r in config.get("rules", []) if r.get("field") in RULE_FIELDS or r.get("field") in custom_keys]
    if org is not None:  # beds that were deleted or deactivated drop out of the view
        wanted = [b for b in config.get("beds") or [] if isinstance(b, int) and not isinstance(b, bool)]
        alive = set(_bed_queryset(org).filter(is_active=True, room__is_active=True, pk__in=wanted).values_list("pk", flat=True))
        config["beds"] = [b for b in wanted if b in alive]
    return clean_view_config(config, settings, org, lenient=True)


def builtin_view_payload(spec, kind="live"):
    cfg = default_view_config(kind)
    return {
        "key": spec["key"], "id": None, "label": spec["label"], "builtin": True, "kind": kind, "filter": spec["filter"], "beds": [], "columns": cfg["columns"], "rules": [],
        "criteria": cfg["criteria"], "show_empty_beds": True, "follow_up": cfg["follow_up"],
    }


def all_view_payloads(org, settings, kind="live"):
    """The views one board lists: the live ED board shows live views, the follow-up board shows follow-up views."""
    if kind == "follow_up":
        views = [builtin_view_payload(BUILTIN_FOLLOW_UP_VIEW, "follow_up")]
    else:
        views = [builtin_view_payload(v) for v in BUILTIN_VIEWS]
    views += [p for p in (view_payload(v, settings) for v in StatusBoardView.objects.filter(organization=org)) if p["kind"] == kind]
    return views
