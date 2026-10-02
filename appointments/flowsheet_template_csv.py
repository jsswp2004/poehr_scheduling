"""
CSV import/export format for flowsheet templates (the flowsheet builder).

One CSV file describes ONE flowsheet template. Every row is one chart row of
that flowsheet, in display order:

    Code, Name, Section, Key, Label, Unit, Row Type, Value

``Code`` / ``Name`` describe the flowsheet itself and must be identical on
every row. ``Section`` is the heading the row is grouped under. ``Row Type``
is Numeric, Text or Dropdown (Dictionary). ``Value`` holds the option list for
Dropdown rows as ``stored_value=Label|stored_value=Label`` (a bare ``Label``
is allowed -- its stored value is then derived from the label) and must be
blank for Numeric and Text rows. ``Unit`` is optional (e.g. bpm, mmHg).

This is the flowsheet twin of note_template_csv.py and shares its option
parsing. Like that module it has no Django imports, so the rules can be unit
tested without a database; saving a parsed flowsheet is done by
``flowsheet_template_import.apply_flowsheet_import``.
"""

import csv
import io
import re

from .note_template_csv import SLUG_RE, _err, _norm, format_options, parse_options

COLUMNS = ["Code", "Name", "Section", "Key", "Label", "Unit", "Row Type", "Value"]

# FlowsheetRowDefinition.field_type value -> label used in the CSV.
ROW_TYPE_LABELS = {
    "numeric": "Numeric",
    "text": "Text",
    "dropdown": "Dropdown (Dictionary)",
}

# Limits mirror the model columns (appointments/models.py).
MAX_CODE = 64
MAX_NAME = 128
MAX_SECTION = 128
MAX_KEY = 64
MAX_LABEL = 200
MAX_UNIT = 32
MAX_ERRORS = 200

_TYPE_LOOKUP = {}
for _code, _label in ROW_TYPE_LABELS.items():
    _TYPE_LOOKUP[_norm(_label)] = _code
    _TYPE_LOOKUP[_code] = _code
_TYPE_LOOKUP[_norm("Dropdown")] = "dropdown"


def parse_flowsheet_csv(text):
    """
    Validate CSV text and return ``(parsed, errors)``.

    ``parsed`` is ``None`` when there are errors, otherwise::

        {"code": str, "name": str, "rows": [
            {"row", "section_label", "key", "label", "unit",
             "field_type", "options"}, ...]}

    ``options`` is a list of ``(value, label)`` for dropdown rows, else None.
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

    rows, seen_keys = [], {}
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

        before = len(errors)

        # ---- flowsheet-level columns: identical on every row ----
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
                errors.append(_err(row_num, "Code", f"Code '{row_code}' differs from '{code}' on the first row. One file holds one flowsheet."))
            if row_name != name:
                errors.append(_err(row_num, "Name", f"Name '{row_name}' differs from '{name}' on the first row."))

        # ---- row columns ----
        section, key, label, unit = cell("Section"), cell("Key"), cell("Label"), cell("Unit")
        if not section:
            errors.append(_err(row_num, "Section", "Section is required (it is the heading the row is grouped under)."))
        elif len(section) > MAX_SECTION:
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
        if len(unit) > MAX_UNIT:
            errors.append(_err(row_num, "Unit", f"Unit must be at most {MAX_UNIT} characters."))

        raw_type = cell("Row Type")
        field_type = _TYPE_LOOKUP.get(_norm(raw_type))
        if field_type is None:
            allowed = "; ".join(ROW_TYPE_LABELS.values())
            errors.append(_err(row_num, "Row Type", f"'{raw_type}' is not a valid Row Type. Use one of: {allowed}."))

        raw_value = cell("Value")
        options = None
        if field_type == "dropdown":
            if not raw_value:
                errors.append(_err(row_num, "Value", "Value must list the options for a Dropdown row, e.g. 0=No pain|1=Mild."))
            else:
                options, problems = parse_options(raw_value)
                for p in problems:
                    errors.append(_err(row_num, "Value", p))
        elif field_type is not None and raw_value:
            errors.append(_err(row_num, "Value", f"Value must be blank for a {ROW_TYPE_LABELS[field_type]} row (only Dropdown rows have options)."))

        if key and SLUG_RE.match(key) and key not in seen_keys:
            seen_keys[key] = row_num

        if len(errors) == before:
            rows.append(
                {
                    "row": row_num,
                    "section_label": section,
                    "key": key,
                    "label": label,
                    "unit": unit,
                    "field_type": field_type,
                    "options": options,
                }
            )
        if len(errors) >= MAX_ERRORS:
            errors.append(_err(0, "", f"Stopped after {MAX_ERRORS} errors. Fix these and upload again."))
            return None, errors

    if not errors and not rows:
        errors.append(_err(0, "", "The file has no rows. A flowsheet needs at least one row."))
    if errors:
        return None, errors
    return {"code": code, "name": name, "rows": rows}, []


def build_csv_text(code, name, rows):
    """
    Build CSV text for a flowsheet. ``rows`` is an ordered list of dicts with
    section_label, key, label, unit, field_type, options ([(value, label)] or None).
    Raises ValueError if an option can't be represented in the Value column.
    """
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(COLUMNS)
    for r in rows:
        writer.writerow(
            [
                code,
                name,
                r.get("section_label") or "",
                r["key"],
                r["label"],
                r.get("unit") or "",
                ROW_TYPE_LABELS[r["field_type"]],
                format_options(r["options"]) if r.get("options") else "",
            ]
        )
    return out.getvalue()


# A ready-to-edit sample. The code is deliberately NOT 'vital_signs' so
# uploading the sample as-is creates a new flowsheet instead of overwriting
# a real one.
SAMPLE_CODE = "sample_vitals"
SAMPLE_NAME = "Sample Vital Signs"
SAMPLE_ROWS = [
    ("Vital Signs", "temperature", "Temperature", "F", "numeric", None),
    ("Vital Signs", "heart_rate", "Heart Rate", "bpm", "numeric", None),
    ("Vital Signs", "bp_systolic", "BP Systolic", "mmHg", "numeric", None),
    ("Vital Signs", "bp_diastolic", "BP Diastolic", "mmHg", "numeric", None),
    ("Vital Signs", "resp_rate", "Respiratory Rate", "breaths/min", "numeric", None),
    ("Vital Signs", "spo2", "SpO2", "%", "numeric", None),
    ("Vital Signs", "o2_delivery", "Oxygen Delivery", "", "dropdown",
     [("room_air", "Room air"), ("nasal_cannula", "Nasal cannula"), ("mask", "Mask"), ("ventilator", "Ventilator")]),
    ("Measurements", "weight", "Weight", "lb", "numeric", None),
    ("Measurements", "height", "Height", "in", "numeric", None),
    ("Assessment", "pain_score", "Pain Score", "", "dropdown",
     [(str(n), str(n)) for n in range(0, 11)]),
    ("Assessment", "comments", "Comments", "", "text", None),
]


def sample_csv_text():
    rows = [
        {"section_label": s, "key": k, "label": l, "unit": u, "field_type": t, "options": o}
        for (s, k, l, u, t, o) in SAMPLE_ROWS
    ]
    return build_csv_text(SAMPLE_CODE, SAMPLE_NAME, rows)
