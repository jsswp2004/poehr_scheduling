"""
What an ED board looks like, as data: columns, statuses, color rules, the overdue-vitals limit and the staff roster.

`DEFAULT_CONFIG` is the built-in layout. An admin changes it in the Status Board Builder; each saved
version is one config. `clean_config` checks one that came from the browser, and `resolve_config` finds
the one a department's board should use.
"""
import copy
import re

from .models import CustomUser, StatusBoardVersion

# (key, label, width): the columns the board knows how to draw.
BUILTIN_COLUMNS = [
    ("loc", "LOC", 80),
    ("los", "LOS", 100),
    ("patient", "Patient", 170),
    ("age", "Age", 80),
    ("reason", "Visit Reason", 130),
    ("complaint", "Chief Complaint", 130),
    ("esi", "ESI", 70),
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
# Without these the board is not usable, so a version cannot hide them.
ALWAYS_VISIBLE = {"loc", "patient", "actions"}

DEFAULT_STATUSES = [
    {"value": "wtbs", "code": "WTBS", "label": "Waiting to be seen"},
    {"value": "tip", "code": "TIP", "label": "Treatment in progress"},
    {"value": "dispo", "code": "DISPO", "label": "Disposition pending"},
    {"value": "admit_pending", "code": "ADM", "label": "Admit pending"},
    {"value": "discharge_pending", "code": "DC", "label": "Discharge pending"},
]

DEFAULT_CONFIG = {
    "columns": [{"key": k, "label": label, "width": w, "visible": True, "type": "builtin"} for k, label, w in BUILTIN_COLUMNS],
    "statuses": DEFAULT_STATUSES,
    "rules": [],
    "vitals_overdue_minutes": 60,
    # None means everyone in the clinic with that role; a list limits the dropdown to those people
    "roster": {"nurses": None, "doctors": None},
}

CUSTOM_KEY = re.compile(r"^c_[a-z0-9_]{1,30}$")
STATUS_VALUE = re.compile(r"^[a-z0-9_]{1,20}$")
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
CUSTOM_TYPES = ("text", "dropdown", "checkbox")
RULE_FIELDS = ("esi", "ed_status", "vitals_overdue", "registration_complete", "sex")
MAX_COLUMNS, MAX_RULES, MAX_STATUSES, MAX_OPTIONS = 60, 30, 12, 30


def default_config():
    return copy.deepcopy(DEFAULT_CONFIG)


class ConfigError(ValueError):
    pass


def _text(value, name, limit, required=False):
    value = ("" if value is None else str(value)).strip()
    if required and not value:
        raise ConfigError(f"{name} is required.")
    if len(value) > limit:
        raise ConfigError(f"{name} can be at most {limit} characters.")
    return value


def _clean_columns(raw):
    if not isinstance(raw, list) or len(raw) > MAX_COLUMNS:
        raise ConfigError("Columns must be a list.")
    out, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            raise ConfigError("Each column must be an object.")
        key = str(item.get("key") or "")
        if key in seen:
            raise ConfigError(f"Column '{key}' appears twice.")
        builtin = key in BUILTIN_KEYS
        if not builtin and not CUSTOM_KEY.match(key):
            raise ConfigError(f"'{key}' is not a column the board can show.")
        seen.add(key)
        default = next((c for c in BUILTIN_COLUMNS if c[0] == key), None)
        label = _text(item.get("label", default[1] if default else ""), "A column name", 40, required=bool(not builtin or key != "actions"))
        try:
            width = int(item.get("width") or (default[2] if default else 120))
        except (TypeError, ValueError):
            raise ConfigError("Column widths must be numbers.")
        if not 40 <= width <= 600:
            raise ConfigError("Column widths must be between 40 and 600.")
        visible = bool(item.get("visible", True)) or key in ALWAYS_VISIBLE
        column = {"key": key, "label": label, "width": width, "visible": visible, "type": "builtin" if builtin else "custom"}
        if not builtin:
            kind = item.get("kind", "text")
            if kind not in CUSTOM_TYPES:
                raise ConfigError("A custom column must be text, dropdown or checkbox.")
            column["kind"] = kind
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
    # a version always carries every built-in column; any it left out come back hidden at the end
    for key, label, width in BUILTIN_COLUMNS:
        if key not in seen:
            out.append({"key": key, "label": label, "width": width, "visible": key in ALWAYS_VISIBLE, "type": "builtin"})
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


def _clean_rules(raw, columns):
    if not isinstance(raw, list) or len(raw) > MAX_RULES:
        raise ConfigError(f"There can be at most {MAX_RULES} color rules.")
    custom_keys = {c["key"] for c in columns if c["type"] == "custom"}
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


def _clean_roster(raw, org):
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


def clean_config(raw, org):
    """The config in canonical form, or ConfigError saying what is wrong."""
    if not isinstance(raw, dict):
        raise ConfigError("The layout is missing.")
    columns = _clean_columns(raw.get("columns", default_config()["columns"]))
    try:
        minutes = int(raw.get("vitals_overdue_minutes", 60))
    except (TypeError, ValueError):
        raise ConfigError("The overdue vitals limit must be a number of minutes.")
    if not 5 <= minutes <= 1440:
        raise ConfigError("The overdue vitals limit must be between 5 and 1440 minutes.")
    return {
        "columns": columns,
        "statuses": _clean_statuses(raw.get("statuses", DEFAULT_STATUSES)),
        "rules": _clean_rules(raw.get("rules", []), columns),
        "vitals_overdue_minutes": minutes,
        "roster": _clean_roster(raw.get("roster"), org),
    }


def resolve_config(org, unit=None):
    """(config, version number or None): the published layout for a department, else the clinic's, else built-in."""
    qs = StatusBoardVersion.objects.filter(organization=org, status=StatusBoardVersion.PUBLISHED)
    version = None
    if unit is not None:
        version = qs.filter(unit=unit).first()
    if version is None:
        version = qs.filter(unit__isnull=True).first()
    if version is None:
        return default_config(), None
    # tolerate a layout saved by an older build: fill anything missing with defaults
    config = default_config()
    config.update(version.config or {})
    return config, version.number


def status_keys(config):
    return {s["value"] for s in config["statuses"]}
