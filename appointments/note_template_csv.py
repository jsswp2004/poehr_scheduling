"""
CSV import/export format for note templates (the note builder).

One CSV file describes ONE note template. Every row is one field of that
template, in display order:

    Code, Name, Tab name, Section, Key, Label, Field Type, Required,
    Help Text, Depends on, Value

``Code`` / ``Name`` describe the template itself and must be identical on
every row. ``Value`` holds the option list for Radio / Dropdown /
Multi-select fields as ``stored_value=Label|stored_value=Label`` (a bare
``Label`` is allowed -- its stored value is then derived from the label) and
must be blank for every other field type. ``Depends on`` is
``parent_key=option_value``.

This module is deliberately free of Django imports so the parsing and
validation rules can be unit-tested without a database. Persisting a parsed
template is done by ``note_template_import.apply_template_import``.
"""

import csv
import io
import re

COLUMNS = [
    "Code",
    "Name",
    "Tab name",
    "Section",
    "Key",
    "Label",
    "Field Type",
    "Required",
    "Help Text",
    "Depends on",
    "Value",
]

# NoteFieldDefinition.field_type value -> label used in the CSV.
FIELD_TYPE_LABELS = {
    "text": "Single-Line Text",
    "textarea": "Multi-line Text",
    "radio": "Radio Button (dictionary)",
    "dropdown": "Dropdown (Dictionary)",
    "multiselect": "Multi-select Checklist (dictionary)",
    "checkbox": "Checkbox (yes/no)",
    "numeric": "Numeric",
    "date": "Date",
}
DICTIONARY_TYPES = {"radio", "dropdown", "multiselect"}

# Limits mirror the model columns (appointments/models.py).
MAX_CODE = 64
MAX_NAME = 128
MAX_TAB = 128
MAX_SECTION = 128
MAX_KEY = 64
MAX_LABEL = 200
MAX_HELP = 255
MAX_OPTION_VALUE = 100
MAX_OPTION_LABEL = 200

MAX_ERRORS = 200
SLUG_RE = re.compile(r"^[-a-zA-Z0-9_]+$")

_TRUE = {"true", "yes", "y", "1"}
_FALSE = {"false", "no", "n", "0", ""}


def _norm(text):
    return re.sub(r"\s+", " ", (text or "").strip().lower())


_TYPE_LOOKUP = {}
for _code, _label in FIELD_TYPE_LABELS.items():
    _TYPE_LOOKUP[_norm(_label)] = _code
    _TYPE_LOOKUP[_code] = _code
_TYPE_LOOKUP[_norm("Single-line Text")] = "text"


def slugify_option(label):
    """Stored value derived from a bare option label (matches migration 0033)."""
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:MAX_OPTION_VALUE]


def decode_upload(raw_bytes):
    """Decode an uploaded file. Excel may save UTF-8 with a BOM or Windows-1252."""
    try:
        return raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw_bytes.decode("cp1252", errors="replace")


def _err(row, column, message):
    return {"row": row, "column": column, "message": message}


def parse_options(raw):
    """
    Parse a Value cell into ([(value, label), ...], [error messages]).
    Pieces are separated by ``|``; each piece is ``value=Label`` or ``Label``.
    """
    options, problems, seen = [], [], set()
    for piece in raw.split("|"):
        piece = piece.strip()
        if not piece:
            continue
        if "=" in piece:
            value, label = (part.strip() for part in piece.split("=", 1))
        else:
            label = piece
            value = slugify_option(label)
        if not value:
            problems.append(f"Option '{piece}' has no usable stored value.")
            continue
        if not label:
            problems.append(f"Option '{piece}' has no label.")
            continue
        if len(value) > MAX_OPTION_VALUE:
            problems.append(f"Option value '{value[:30]}...' is longer than {MAX_OPTION_VALUE} characters.")
            continue
        if len(label) > MAX_OPTION_LABEL:
            problems.append(f"Option label '{label[:30]}...' is longer than {MAX_OPTION_LABEL} characters.")
            continue
        if value in seen:
            problems.append(f"Option value '{value}' is listed more than once.")
            continue
        seen.add(value)
        options.append((value, label))
    if not options and not problems:
        problems.append("At least one option is required.")
    return options, problems


def parse_template_csv(text):
    """
    Validate CSV text and return ``(parsed, errors)``.

    ``parsed`` is ``None`` when there are errors, otherwise::

        {"code": str, "name": str, "fields": [
            {"row", "tab_label", "section_label", "key", "label",
             "field_type", "required", "help_text",
             "depends_on_key", "depends_on_value", "options"}, ...]}

    ``options`` is a list of ``(value, label)`` for dictionary types, else None.
    Every error is ``{"row": int, "column": str, "message": str}`` where row 1
    is the header row (row 0 = the file as a whole).
    """
    errors = []
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        return None, [_err(0, "", "The file is empty.")]

    col_index = {}
    for i, name in enumerate(header):
        col_index.setdefault(_norm(name), i)
    missing = [c for c in COLUMNS if _norm(c) not in col_index]
    if missing:
        return None, [_err(1, "", "Missing column(s) in the header row: " + ", ".join(missing))]

    fields, seen_keys = [], {}
    option_values = {}  # key -> set of option values, for Depends on checks
    code = name = None

    for row_num, cells in enumerate(reader, start=2):
        if not any(c.strip() for c in cells):
            continue  # blank line
        if len(cells) > len(header) and any(c.strip() for c in cells[len(header):]):
            errors.append(_err(row_num, "", "This row has more cells than the header. A comma inside a cell must be wrapped in quotes."))
            continue

        def cell(column):
            idx = col_index[_norm(column)]
            return cells[idx].strip() if idx < len(cells) else ""

        row_errors_before = len(errors)

        # ---- template-level columns: identical on every row ----
        row_code, row_name = cell("Code"), cell("Name")
        if code is None:
            code, name = row_code, row_name
            if not code:
                errors.append(_err(row_num, "Code", "Code is required."))
            elif not SLUG_RE.match(code) or len(code) > MAX_CODE:
                errors.append(_err(row_num, "Code", f"Code must use only letters, numbers, '_' or '-' and be at most {MAX_CODE} characters."))
            if not name:
                errors.append(_err(row_num, "Name", "Name is required."))
            elif len(name) > MAX_NAME:
                errors.append(_err(row_num, "Name", f"Name must be at most {MAX_NAME} characters."))
        else:
            if row_code != code:
                errors.append(_err(row_num, "Code", f"Code '{row_code}' differs from '{code}' on the first row. One file holds one template."))
            if row_name != name:
                errors.append(_err(row_num, "Name", f"Name '{row_name}' differs from '{name}' on the first row."))

        # ---- field columns ----
        tab, section = cell("Tab name"), cell("Section")
        key, label, help_text = cell("Key"), cell("Label"), cell("Help Text")
        if len(tab) > MAX_TAB:
            errors.append(_err(row_num, "Tab name", f"Tab name must be at most {MAX_TAB} characters."))
        if len(section) > MAX_SECTION:
            errors.append(_err(row_num, "Section", f"Section must be at most {MAX_SECTION} characters."))

        if not key:
            errors.append(_err(row_num, "Key", "Key is required."))
        elif not SLUG_RE.match(key) or len(key) > MAX_KEY:
            errors.append(_err(row_num, "Key", f"Key '{key}' must use only letters, numbers, '_' or '-' (no spaces) and be at most {MAX_KEY} characters."))
        elif key in seen_keys:
            errors.append(_err(row_num, "Key", f"Key '{key}' is already used on row {seen_keys[key]}. Keys must be unique."))

        if not label:
            errors.append(_err(row_num, "Label", "Label is required."))
        elif len(label) > MAX_LABEL:
            errors.append(_err(row_num, "Label", f"Label must be at most {MAX_LABEL} characters."))
        if len(help_text) > MAX_HELP:
            errors.append(_err(row_num, "Help Text", f"Help Text must be at most {MAX_HELP} characters."))

        raw_type = cell("Field Type")
        field_type = _TYPE_LOOKUP.get(_norm(raw_type))
        if field_type is None:
            allowed = "; ".join(FIELD_TYPE_LABELS.values())
            errors.append(_err(row_num, "Field Type", f"'{raw_type}' is not a valid Field Type. Use one of: {allowed}."))

        raw_required = _norm(cell("Required"))
        if raw_required in _TRUE:
            required = True
        elif raw_required in _FALSE:
            required = False
        else:
            required = False
            errors.append(_err(row_num, "Required", f"'{cell('Required')}' is not valid. Use TRUE or FALSE."))

        raw_value = cell("Value")
        options = None
        if field_type in DICTIONARY_TYPES:
            if not raw_value:
                errors.append(_err(row_num, "Value", f"Value must list the options for a {FIELD_TYPE_LABELS[field_type]} field."))
            else:
                options, problems = parse_options(raw_value)
                for p in problems:
                    errors.append(_err(row_num, "Value", p))
        elif field_type is not None and raw_value:
            errors.append(_err(row_num, "Value", f"Value must be blank for a {FIELD_TYPE_LABELS[field_type]} field (only Radio, Dropdown and Multi-select fields have options)."))

        # ---- Depends on ----
        dep_key = dep_value = None
        raw_dep = cell("Depends on")
        if raw_dep:
            if "=" not in raw_dep:
                errors.append(_err(row_num, "Depends on", "Use the form parent_key=option_value."))
            else:
                dep_key, dep_value = (p.strip() for p in raw_dep.split("=", 1))
                if dep_key not in seen_keys:
                    errors.append(_err(row_num, "Depends on", f"'{dep_key}' must be the Key of a field in an earlier row."))
                elif dep_key not in option_values:
                    errors.append(_err(row_num, "Depends on", f"'{dep_key}' has no options, so nothing can depend on it. The parent must be a Radio, Dropdown or Multi-select field."))
                elif dep_value not in option_values[dep_key]:
                    errors.append(_err(row_num, "Depends on", f"'{dep_value}' is not one of the stored values of '{dep_key}'."))

        if key and SLUG_RE.match(key) and key not in seen_keys:
            seen_keys[key] = row_num
        if options and key:
            option_values[key] = {v for v, _ in options}

        if len(errors) == row_errors_before:
            fields.append(
                {
                    "row": row_num,
                    "tab_label": tab,
                    "section_label": section,
                    "key": key,
                    "label": label,
                    "field_type": field_type,
                    "required": required,
                    "help_text": help_text,
                    "depends_on_key": dep_key,
                    "depends_on_value": dep_value or "",
                    "options": options,
                }
            )
        if len(errors) >= MAX_ERRORS:
            errors.append(_err(0, "", f"Stopped after {MAX_ERRORS} errors. Fix these and upload again."))
            return None, errors

    if not errors and not fields:
        errors.append(_err(0, "", "The file has no field rows. A template needs at least one field."))
    if errors:
        return None, errors
    return {"code": code, "name": name, "fields": fields}, []


def format_options(options):
    """[(value, label)] -> 'value=Label|value=Label'. Raises ValueError if not representable."""
    parts = []
    for value, label in options:
        if "|" in value or "|" in label or "=" in value:
            raise ValueError(
                f"Option value '{value}' / label '{label}' contains '|' (or '=' in the value), "
                "which the CSV format cannot represent."
            )
        parts.append(f"{value}={label}")
    return "|".join(parts)


def build_csv_text(code, name, fields):
    """
    Build CSV text for a template. ``fields`` is an ordered list of dicts with
    tab_label, section_label, key, label, field_type, required, help_text,
    depends_on_key, depends_on_value, options ([(value, label)] or None).
    """
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(COLUMNS)
    for f in fields:
        dep = f"{f['depends_on_key']}={f['depends_on_value']}" if f.get("depends_on_key") else ""
        writer.writerow(
            [
                code,
                name,
                f.get("tab_label") or "",
                f.get("section_label") or "",
                f["key"],
                f["label"],
                FIELD_TYPE_LABELS[f["field_type"]],
                "TRUE" if f.get("required") else "FALSE",
                f.get("help_text") or "",
                dep,
                format_options(f["options"]) if f.get("options") else "",
            ]
        )
    return out.getvalue()
