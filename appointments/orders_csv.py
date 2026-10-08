"""
CSV import/export for the orderables catalog (the Order Builder's
"Upload CSV"). Pure parsing/formatting lives here with no database access, so
it is easy to test; the view resolves detail forms and writes the rows.

Columns (header row required; order doesn't matter; extra columns are ignored):

  code, name                      required
  category                        laboratory | imaging | procedure | referral | nursing | medication | other
  code_system                     local | loinc | hcpcs | icd10pcs | snomed | rxnorm | cpt
  external_code                   the code in that system (CPT is entered by the clinic)
  description
  default_priority                routine | urgent | stat
  requires_cosign                 yes/no (also true/false, 1/0)
  detail_form_code                code of an "Order detail form" template (optional)
  is_active                       yes/no (default yes)
  creates_tasks                   optional: yes | no | auto (blank = auto: medications make nurse tasks,
                                  nursing orders do when given a frequency, everything else does not)
  default_frequency               optional: the usual frequency key (daily, bid, tid, q4h, prn ...)

The two task columns are only applied when they are in the file, so an older file that lacks them
never changes how an existing order behaves.

Blank cells take the default. The whole file is validated first and every
problem is reported as {row, column, message}; nothing is saved unless the
file is clean.
"""

import csv
import io
import re

COLUMNS = [
    "code",
    "name",
    "category",
    "code_system",
    "external_code",
    "description",
    "default_priority",
    "requires_cosign",
    "detail_form_code",
    "is_active",
]
TASK_COLUMNS = ["creates_tasks", "default_frequency"]

_TRUE = {"yes", "y", "true", "t", "1"}
_FALSE = {"no", "n", "false", "f", "0"}
_SLUG = re.compile(r"^[-a-zA-Z0-9_]+$")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
MAX_ROWS = 2000


def _err(row, column, message):
    return {"row": row, "column": column, "message": message}


def _bool(value, default):
    v = value.strip().lower()
    if v == "":
        return default, True
    if v in _TRUE:
        return True, True
    if v in _FALSE:
        return False, True
    return default, False


def unwrap_quoted_lines(text):
    """
    Some tools (a text paste saved from Excel, "quote everything" exports) wrap each whole line in
    quotes, which turns every row into one big cell. When the header line is wrapped that way, take
    the outer quotes off every line (and turn "" back into ").
    """
    lines = text.splitlines()
    first = next((l for l in lines if l.strip()), "")
    if not (len(first) > 2 and first.startswith('"') and first.endswith('"') and "," in first):
        return text
    if len(next(csv.reader([first]))) != 1:
        return text  # a normal quoted header with several cells
    out = []
    for line in lines:
        if line.startswith('"') and line.endswith('"') and len(line) >= 2:
            line = line[1:-1].replace('""', '"')
        out.append(line)
    return "\n".join(out) + "\n"


def parse_orderable_csv(text, categories, code_systems, priorities, frequencies=()):
    """Return (rows, errors). `categories` etc. are the allowed values."""
    errors = []
    reader = csv.DictReader(io.StringIO(unwrap_quoted_lines(text.lstrip("\ufeff"))))
    if not reader.fieldnames:
        return [], [_err(0, "", "The file is empty.")]
    header = {(h or "").strip().lower(): h for h in reader.fieldnames}
    for needed in ("code", "name"):
        if needed not in header:
            errors.append(_err(0, needed, f"Missing the required column '{needed}'."))
    if errors:
        return [], errors

    def cell(raw, name):
        key = header.get(name)
        # control characters (a NUL from a database export, for one) can't be stored: drop them
        return _CONTROL.sub("", raw.get(key) or "").strip() if key is not None else ""

    rows, seen = [], {}
    has_creates, has_freq = "creates_tasks" in header, "default_frequency" in header
    for index, raw in enumerate(reader, start=2):
        if index - 1 > MAX_ROWS:
            errors.append(_err(index, "", f"More than {MAX_ROWS} rows; split the file."))
            break
        if not any((v or "").strip() for v in raw.values() if isinstance(v, str)):
            continue  # blank line

        code, name = cell(raw, "code"), cell(raw, "name")
        row = {
            "code": code,
            "name": name,
            "category": cell(raw, "category").lower() or "laboratory",
            "code_system": cell(raw, "code_system").lower() or "local",
            "external_code": cell(raw, "external_code"),
            "description": cell(raw, "description"),
            "default_priority": cell(raw, "default_priority").lower() or "routine",
            "detail_form_code": cell(raw, "detail_form_code"),
            "_row": index,
        }
        if not code:
            errors.append(_err(index, "code", "Code is required."))
        elif not _SLUG.match(code) or len(code) > 64:
            errors.append(_err(index, "code", "Use letters, numbers, - and _ only (max 64), e.g. cbc_with_diff."))
        elif code.lower() in seen:
            errors.append(_err(index, "code", f"Duplicate of row {seen[code.lower()]}."))
        else:
            seen[code.lower()] = index
        if not name:
            errors.append(_err(index, "name", "Name is required."))
        elif len(name) > 255:
            errors.append(_err(index, "name", "Name is longer than 255 characters."))
        if row["category"] not in categories:
            errors.append(_err(index, "category", f"'{row['category']}' is not one of: {', '.join(categories)}."))
        if row["code_system"] not in code_systems:
            errors.append(_err(index, "code_system", f"'{row['code_system']}' is not one of: {', '.join(code_systems)}."))
        if row["default_priority"] not in priorities:
            errors.append(_err(index, "default_priority", f"'{row['default_priority']}' is not one of: {', '.join(priorities)}."))
        if len(row["external_code"]) > 64:
            errors.append(_err(index, "external_code", "External code is longer than 64 characters."))
        row["requires_cosign"], ok = _bool(cell(raw, "requires_cosign"), False)
        if not ok:
            errors.append(_err(index, "requires_cosign", "Use yes or no."))
        row["is_active"], ok = _bool(cell(raw, "is_active"), True)
        if not ok:
            errors.append(_err(index, "is_active", "Use yes or no."))
        if has_creates:
            value = cell(raw, "creates_tasks").lower()
            if value in ("", "auto"):
                row["creates_tasks"] = None
            else:
                row["creates_tasks"], ok = _bool(value, None)
                if not ok:
                    errors.append(_err(index, "creates_tasks", "Use yes, no or auto."))
        if has_freq:
            freq = cell(raw, "default_frequency").lower()
            if freq and freq not in frequencies:
                errors.append(_err(index, "default_frequency", f"'{freq}' is not one of: {', '.join(frequencies)}."))
            row["default_frequency"] = freq
        rows.append(row)

    if not rows and not errors:
        errors.append(_err(0, "", "The file has a header but no orderable rows."))
    return rows, errors


def _yn(value):
    return "yes" if value else "no"


def export_orderable_csv(orderables):
    """CSV text for an iterable of Orderable rows, in the upload format."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(COLUMNS + TASK_COLUMNS)
    for o in orderables:
        writer.writerow(
            [
                o.code,
                o.name,
                o.category,
                o.code_system,
                o.external_code,
                o.description,
                o.default_priority,
                _yn(o.requires_cosign),
                o.detail_template.code if o.detail_template_id else "",
                _yn(o.is_active),
                "" if o.creates_tasks is None else _yn(o.creates_tasks),
                o.default_frequency,
            ]
        )
    return out.getvalue()


SAMPLE_ROWS = [
    ["cbc_with_diff", "CBC with differential", "laboratory", "loinc", "57021-8", "Complete blood count with automated differential", "routine", "no", "", "yes", "", ""],
    ["bmp", "Basic metabolic panel", "laboratory", "loinc", "51990-0", "", "routine", "no", "", "yes", "", ""],
    ["xr_chest_2v", "Chest X-ray, 2 views", "imaging", "local", "", "PA and lateral", "routine", "no", "", "yes", "", ""],
    ["cardiology_referral", "Referral: Cardiology", "referral", "local", "", "", "routine", "no", "", "yes", "", ""],
    ["vitals_q4h", "Vital signs every 4 hours", "nursing", "local", "", "", "routine", "no", "", "yes", "yes", "q4h"],
    ["office_visit_est", "Established patient office visit", "procedure", "cpt", "99213", "CPT code entered by the clinic", "routine", "yes", "", "yes", "", ""],
    ["amoxicillin_500_cap", "Amoxicillin 500 mg capsule", "medication", "local", "", "", "routine", "no", "", "yes", "", "tid"],
]


def sample_orderable_csv():
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(COLUMNS + TASK_COLUMNS)
    writer.writerows(SAMPLE_ROWS)
    return out.getvalue()
