"""
Calculated items for the flowsheet builder and the note builder.

A *calculated* row (flowsheet) or field (note) is never typed in. Its value is
worked out from other items in the same flowsheet column / note, using a small
declarative config stored on the item (``calc``)::

    {
      "operation":   "sum" | "average" | "min" | "max" | "formula",
      "sources":     ["phq9_q1", "phq9_q2", ...],   # item keys, earlier items only
      "formula":     "weight / (height * height) * 703",   # only for "formula"
      "require_all": true,    # blank until every source is answered
      "decimals":    0,       # 0-6
      "bands": [              # optional interpretation of the result
        {"min": 0,  "max": 4,  "label": "None-minimal"},
        {"min": 5,  "max": 9,  "label": "Mild"},
        ...
      ],
      "alerts": [             # optional cautions shown when a source is high
        {"source": "phq9_q9", "min": 1, "message": "Further assessment ..."}
      ]
    }

How an answer becomes a number: numeric items use the number typed; dropdown
and radio items use the *stored value of the chosen option* (so a dictionary
whose values are 0, 1, 2, 3 scores 0-3); a checkbox is 1 when ticked, else 0.
A calculated item may use an earlier calculated item as a source.

This module has no Django imports so the rules can be unit tested without a
database. ``frontend/src/utils/calculations.js`` is a line-for-line twin used
for the live total on screen; ``test_calculations.py`` and
``calculations.test.js`` run the same cases against both. The server always
recomputes on save, so a stored result can never disagree with its inputs.
"""

import json
import math
import re
from decimal import ROUND_HALF_UP, Decimal

OPERATIONS = ("sum", "average", "min", "max", "formula")
OPERATION_LABELS = {
    "sum": "Sum (total)",
    "average": "Average",
    "min": "Lowest",
    "max": "Highest",
    "formula": "Formula",
}

# Field types whose answer can feed a calculation.
SOURCE_TYPES = ("numeric", "dropdown", "radio", "checkbox", "calculated")
OPTION_TYPES = ("dropdown", "radio")

# The interpretation text of a calculated item "foo" is stored next to it under
# "foo__interpretation" (note: structured_data["foo__interpretation"]; flowsheet:
# data["foo__interpretation"][column_id]) so reports can read it without
# re-deriving it. Item keys may not end with this suffix.
INTERPRETATION_SUFFIX = "__interpretation"

MAX_DECIMALS = 6
MAX_BANDS = 20
MAX_ALERTS = 20
MAX_SOURCES = 100
MAX_LABEL = 100
MAX_MESSAGE = 300
MAX_FORMULA = 300
# Results at or beyond this are treated as invalid rather than formatted.
MAX_MAGNITUDE = 1e15

_NUMBER_RE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")
_TOKEN_RE = re.compile(r"\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(.))")


# --- numbers ----------------------------------------------------------------


def to_number(raw):
    """A stored answer as a float, or None when unanswered / not a number."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool):
        return 1.0 if raw else 0.0
    if isinstance(raw, (int, float)):
        value = float(raw)
    elif isinstance(raw, str):
        text = raw.strip()
        # Plain decimals only (no "1_000", "inf", "nan", "0x10"): the JS twin
        # applies the same rule, so both sides read an answer identically.
        if not _NUMBER_RE.match(text):
            return None
        try:
            value = float(text)
        except ValueError:
            return None
    else:
        return None
    if math.isnan(value) or math.isinf(value):
        return None
    return value


def round_half_up(value, decimals):
    """Round away from zero on ties, exactly as the JS twin does (1.005 -> 1.01)."""
    if abs(value) < 1e-6:
        return 0.0
    sign = -1 if value < 0 else 1
    q = Decimal(1).scaleb(-decimals)
    rounded = Decimal(repr(abs(value))).quantize(q, rounding=ROUND_HALF_UP)
    return sign * float(rounded)


def format_number(value, decimals):
    """Fixed-point text with exactly `decimals` places and no '-0'."""
    rounded = round_half_up(value, decimals)
    if rounded == 0:
        rounded = 0.0
    return f"{rounded:.{decimals}f}"


def _sum(values):
    """Neumaier compensated sum -- the same steps as the JS twin, so both agree to the last bit."""
    total = 0.0
    comp = 0.0
    for x in values:
        t = total + x
        if abs(total) >= abs(x):
            comp += (total - t) + x
        else:
            comp += (x - t) + total
        total = t
    return total + comp


def clean_number(value):
    """int when whole, else float -- keeps stored configs tidy and stable."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


# --- formula ----------------------------------------------------------------


class FormulaError(ValueError):
    pass


def _tokenize(text):
    tokens = []
    pos = 0
    text = text or ""
    while pos < len(text):
        match = _TOKEN_RE.match(text, pos)
        if not match:
            break
        number, ident, other = match.groups()
        pos = match.end()
        if number is not None:
            tokens.append(("num", float(number)))
        elif ident is not None:
            tokens.append(("name", ident))
        elif other is not None and not other.isspace():
            if other not in "+-*/()":
                raise FormulaError(f"'{other}' is not allowed in a formula. Use numbers, item keys, + - * / and ( ).")
            tokens.append(("op", other))
    return tokens


def parse_formula(text):
    """Parse to a nested-tuple tree. Raises FormulaError with a readable message."""
    if not text or not text.strip():
        raise FormulaError("Enter a formula.")
    if len(text) > MAX_FORMULA:
        raise FormulaError(f"A formula can be at most {MAX_FORMULA} characters.")
    tokens = _tokenize(text)
    index = 0

    def peek():
        return tokens[index] if index < len(tokens) else None

    def take():
        nonlocal index
        token = tokens[index]
        index += 1
        return token

    def parse_expr():
        node = parse_term()
        while peek() is not None and peek()[0] == "op" and peek()[1] in "+-":
            op = take()[1]
            node = ("bin", op, node, parse_term())
        return node

    def parse_term():
        node = parse_unary()
        while peek() is not None and peek()[0] == "op" and peek()[1] in "*/":
            op = take()[1]
            node = ("bin", op, node, parse_unary())
        return node

    def parse_unary():
        token = peek()
        if token is not None and token == ("op", "-"):
            take()
            return ("neg", parse_unary())
        return parse_primary()

    def parse_primary():
        token = peek()
        if token is None:
            raise FormulaError("The formula ends unexpectedly.")
        if token[0] == "num":
            take()
            return ("num", token[1])
        if token[0] == "name":
            take()
            return ("name", token[1])
        if token == ("op", "("):
            take()
            node = parse_expr()
            closing = peek()
            if closing != ("op", ")"):
                raise FormulaError("A '(' in the formula has no matching ')'.")
            take()
            return node
        raise FormulaError(f"Unexpected '{token[1]}' in the formula.")

    tree = parse_expr()
    if index != len(tokens):
        raise FormulaError(f"Unexpected '{tokens[index][1]}' in the formula.")
    return tree


def formula_names(tree):
    """Item keys used by a parsed formula, in order of first appearance."""
    names = []

    def walk(node):
        kind = node[0]
        if kind == "name":
            if node[1] not in names:
                names.append(node[1])
        elif kind == "neg":
            walk(node[1])
        elif kind == "bin":
            walk(node[2])
            walk(node[3])

    walk(tree)
    return names


def evaluate_formula(tree, variables):
    """Value of a parsed formula, or None (a name unanswered, divide by zero, overflow)."""
    kind = tree[0]
    if kind == "num":
        return tree[1]
    if kind == "name":
        return variables.get(tree[1])
    if kind == "neg":
        inner = evaluate_formula(tree[1], variables)
        return None if inner is None else -inner
    left = evaluate_formula(tree[2], variables)
    right = evaluate_formula(tree[3], variables)
    if left is None or right is None:
        return None
    op = tree[1]
    if op == "+":
        result = left + right
    elif op == "-":
        result = left - right
    elif op == "*":
        result = left * right
    else:
        if right == 0:
            return None
        result = left / right
    if math.isnan(result) or math.isinf(result):
        return None
    return result


# --- validation (used by the builders and the CSV importers) ----------------


def _bound(value, what):
    """A band / alert number, or None for 'no limit'. Raises ValueError."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError(f"{what} must be a number.")
    number = to_number(value)
    if number is None:
        raise ValueError(f"{what} must be a number.")
    return number


def validate_calc(calc, key, earlier):
    """
    Check a calculation config and return ``(cleaned, errors)``.

    ``earlier`` maps the key of every item that comes BEFORE this one to
    ``{"field_type": str, "numeric_options": bool|None, "label": str}`` --
    ``numeric_options`` says whether a dropdown/radio's option values are all
    numbers. Only earlier items can be sources, which also rules out loops.
    ``cleaned`` is None when there are errors.
    """
    errors = []
    if not isinstance(calc, dict) or not calc:
        return None, ["A calculated item needs a calculation."]

    operation = calc.get("operation")
    if operation not in OPERATIONS:
        return None, [f"Choose how to calculate this: one of {', '.join(OPERATIONS)}."]

    def check_source(name, context):
        info = earlier.get(name)
        if info is None:
            errors.append(f"{context} '{name}' must be an item that comes earlier in the list.")
            return False
        field_type = info.get("field_type")
        if field_type not in SOURCE_TYPES:
            errors.append(f"{context} '{name}' is a {field_type} item and can't be used in a calculation.")
            return False
        if field_type in OPTION_TYPES and not info.get("numeric_options"):
            errors.append(
                f"{context} '{name}' uses a dictionary whose option values aren't all numbers. "
                "Set each option's stored value to its score (for example 0, 1, 2, 3)."
            )
            return False
        return True

    sources = []
    formula_text = ""
    if operation == "formula":
        formula_text = (calc.get("formula") or "").strip()
        try:
            tree = parse_formula(formula_text)
        except FormulaError as exc:
            return None, [str(exc)]
        sources = formula_names(tree)
        if not sources:
            errors.append("A formula must use at least one item key.")
        for name in sources:
            if name == key:
                errors.append("A calculation can't use itself.")
            else:
                check_source(name, "The formula uses")
    else:
        raw_sources = calc.get("sources")
        if not isinstance(raw_sources, list) or not raw_sources:
            return None, ["Pick at least one item to calculate from."]
        if len(raw_sources) > MAX_SOURCES:
            return None, [f"A calculation can use at most {MAX_SOURCES} items."]
        for name in raw_sources:
            if not isinstance(name, str):
                errors.append("Sources must be item keys.")
                continue
            if name in sources:
                errors.append(f"'{name}' is listed more than once.")
                continue
            sources.append(name)
            if name == key:
                errors.append("A calculation can't use itself.")
            else:
                check_source(name, "Source")

    decimals = calc.get("decimals", 0)
    if isinstance(decimals, bool) or not isinstance(decimals, int) or not 0 <= decimals <= MAX_DECIMALS:
        errors.append(f"Decimals must be a whole number from 0 to {MAX_DECIMALS}.")
        decimals = 0

    require_all = calc.get("require_all", True)
    if not isinstance(require_all, bool):
        errors.append("'Require every answer' must be true or false.")
        require_all = True

    bands_out = []
    raw_bands = calc.get("bands") or []
    if not isinstance(raw_bands, list) or len(raw_bands) > MAX_BANDS:
        errors.append(f"Interpretation can have at most {MAX_BANDS} ranges.")
        raw_bands = []
    for position, band in enumerate(raw_bands, start=1):
        if not isinstance(band, dict):
            errors.append(f"Range {position} is not valid.")
            continue
        label = band.get("label")
        label = label.strip() if isinstance(label, str) else ""
        if not label:
            errors.append(f"Range {position} needs a label.")
            continue
        if len(label) > MAX_LABEL:
            errors.append(f"Range {position}'s label must be at most {MAX_LABEL} characters.")
            continue
        try:
            low = _bound(band.get("min"), f"Range {position}'s minimum")
            high = _bound(band.get("max"), f"Range {position}'s maximum")
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if low is None and high is None:
            errors.append(f"Range {position} needs a minimum or a maximum.")
            continue
        if low is not None and high is not None and low > high:
            errors.append(f"Range {position} ('{label}') has a minimum above its maximum.")
            continue
        bands_out.append({"min": clean_number(low), "max": clean_number(high), "label": label})
    ordered = sorted(bands_out, key=lambda b: -math.inf if b["min"] is None else b["min"])
    for previous, current in zip(ordered, ordered[1:]):
        prev_high = math.inf if previous["max"] is None else previous["max"]
        cur_low = -math.inf if current["min"] is None else current["min"]
        if prev_high >= cur_low:
            errors.append(f"Ranges '{previous['label']}' and '{current['label']}' overlap.")

    alerts_out = []
    raw_alerts = calc.get("alerts") or []
    if not isinstance(raw_alerts, list) or len(raw_alerts) > MAX_ALERTS:
        errors.append(f"A calculation can have at most {MAX_ALERTS} cautions.")
        raw_alerts = []
    for position, alert in enumerate(raw_alerts, start=1):
        if not isinstance(alert, dict):
            errors.append(f"Caution {position} is not valid.")
            continue
        source = alert.get("source")
        message = alert.get("message")
        message = message.strip() if isinstance(message, str) else ""
        if not message:
            errors.append(f"Caution {position} needs a message.")
            continue
        if len(message) > MAX_MESSAGE:
            errors.append(f"Caution {position}'s message must be at most {MAX_MESSAGE} characters.")
            continue
        if not isinstance(source, str) or not check_source(source, f"Caution {position}'s item"):
            if not isinstance(source, str):
                errors.append(f"Caution {position} needs an item.")
            continue
        try:
            threshold = _bound(alert.get("min"), f"Caution {position}'s 'at or above'")
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if threshold is None:
            errors.append(f"Caution {position} needs an 'at or above' number.")
            continue
        alerts_out.append({"source": source, "min": clean_number(threshold), "message": message})

    if errors:
        return None, errors

    cleaned = {
        "operation": operation,
        "sources": sources,
        "require_all": require_all,
        "decimals": decimals,
        "bands": bands_out,
        "alerts": alerts_out,
    }
    if operation == "formula":
        cleaned["formula"] = formula_text
    return cleaned, []


def calc_signature(calc):
    """Stable text for diffing configs (a change bumps the template version)."""
    if not calc:
        return ""
    return json.dumps(calc, sort_keys=True, separators=(",", ":"))


# --- computing --------------------------------------------------------------


def _find_band(number, bands):
    for band in bands or []:
        low, high = band.get("min"), band.get("max")
        if (low is None or number >= low) and (high is None or number <= high):
            return band["label"]
    return ""


def compute_calc(calc, values):
    """
    Work out one calculated item from `values` (item key -> stored answer).

    Returns ``{"value": str, "number": float|None, "interpretation": str,
    "alerts": [str, ...]}``. ``value`` is "" while the result can't be
    determined yet (an answer is missing, or divide by zero).
    """
    calc = calc or {}
    decimals = calc.get("decimals", 0)
    operation = calc.get("operation")
    sources = calc.get("sources") or []
    numbers = {name: to_number(values.get(name)) for name in sources}

    result = None
    if operation == "formula":
        try:
            tree = parse_formula(calc.get("formula"))
        except FormulaError:
            tree = None
        if tree is not None and all(numbers.get(n) is not None for n in formula_names(tree)):
            result = evaluate_formula(tree, numbers)
    elif operation in ("sum", "average", "min", "max"):
        answered = [numbers[n] for n in sources if numbers[n] is not None]
        complete = len(answered) == len(sources)
        if answered and (complete or not calc.get("require_all", True)):
            if operation == "sum":
                result = _sum(answered)
            elif operation == "average":
                result = _sum(answered) / len(answered)
            elif operation == "min":
                result = min(answered)
            else:
                result = max(answered)

    if result is not None and (math.isnan(result) or math.isinf(result) or abs(result) >= MAX_MAGNITUDE):
        result = None

    value = ""
    number = None
    interpretation = ""
    if result is not None:
        value = format_number(result, decimals)
        number = float(value)
        interpretation = _find_band(number, calc.get("bands"))

    alerts = []
    for alert in calc.get("alerts") or []:
        score = to_number(values.get(alert.get("source")))
        if score is not None and score >= alert.get("min", 0) and alert["message"] not in alerts:
            alerts.append(alert["message"])

    return {"value": value, "number": number, "interpretation": interpretation, "alerts": alerts}


def apply_calculations(items, values):
    """
    Fill in every calculated item of one note / one flowsheet column.

    ``items`` is the ordered list of ``{"key", "field_type", "calc"}``; only
    those with field_type "calculated" are computed, in order, so a later
    calculation can use an earlier one. ``values`` is mutated: the result goes
    under the item's key and its interpretation under key + INTERPRETATION_SUFFIX
    (both removed while there is no result). Returns the per-item results.
    """
    results = {}
    for item in items:
        if item.get("field_type") != "calculated":
            continue
        key = item["key"]
        result = compute_calc(item.get("calc"), values)
        results[key] = result
        if result["value"] != "":
            values[key] = result["value"]
            values[key + INTERPRETATION_SUFFIX] = result["interpretation"]
        else:
            values.pop(key, None)
            values.pop(key + INTERPRETATION_SUFFIX, None)
    return results
