"""
Intake & Output: the numbers behind the Intake & Output flowsheet.

The flowsheet itself is an ordinary flowsheet (rows by time columns, see FlowsheetTemplate). What an
ordinary flowsheet cannot do is add up ACROSS time columns, so this module does that: totals for the
current shift, the last 24 hours and the whole stay, per row and overall, and the alerts the clinic has
asked for. It has no Django imports, so the rules can be tested without a database.

Rules
* Everything is millilitres. (The flowsheet screen turns "8 oz" into 240 as it is typed: 1 oz = 30 mL.)
* Intake and output are totalled separately; net = intake - output.
* A blank cell means "not measured". It is never counted as zero in an alert.
* True urine output from a catheter = catheter drainage - irrigation instilled (never below 0). Irrigation
  is not intake, and the raw catheter drainage is not added to the output total, only true urine is.
* Insensible loss (skin, lungs) cannot be measured, so it is neither charted nor added.
* Ice chips are charted as the frozen volume; half of it (the melted volume) counts as intake.
"""

import math
from datetime import datetime, timedelta

ML_PER_OZ = 30
INTAKE_KEYS = ("oral_fluids", "ice_chips", "iv_fluids", "blood_products", "tpn_lipids", "tube_feeding", "flushes")
OUTPUT_KEYS = ("urine_voided", "stool", "emesis", "drain_1", "drain_2", "drain_3", "suction", "blood_loss")
CATHETER_KEY = "urine_catheter"
IRRIGATION_KEY = "irrigation_in"
TRUE_URINE_KEY = "urine_true"
URINE_KEYS = ("urine_voided", TRUE_URINE_KEY)
CHARTED_KEYS = INTAKE_KEYS + OUTPUT_KEYS + (CATHETER_KEY, IRRIGATION_KEY)

DEFAULTS = {
    "shift_starts": ["07:00", "19:00"],
    "low_urine_ml_kg_h": 0.5,
    "no_urine_hours": 6,
    "low_urine_24h_ml": 800,
    "positive_balance_24h_ml": 2000,
}
LB_PER_KG = 2.20462
RATE_WINDOW_HOURS = 6


def number(value):
    """A measured amount as a float, or None when blank, not a number, or negative."""
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(str(value).strip())
    except ValueError:
        return None
    if math.isnan(n) or math.isinf(n) or n < 0:
        return None
    return n


def clean(n):
    """Whole numbers as ints, anything else to one decimal, so the screen shows 240 not 240.0."""
    if n is None:
        return None
    return int(n) if float(n).is_integer() else round(n, 1)


def parse_when(text):
    try:
        when = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return when if when.tzinfo else None


def minutes_of(text):
    """"07:00" -> 420, or None."""
    try:
        hours, minutes = str(text).split(":")
        hours, minutes = int(hours), int(minutes)
    except (TypeError, ValueError):
        return None
    return hours * 60 + minutes if 0 <= hours < 24 and 0 <= minutes < 60 else None


def shift_window(now, starts):
    """(start, end) of the shift that contains `now`; `now` must be timezone-aware in the clinic's zone."""
    marks = sorted({m for m in (minutes_of(s) for s in starts) if m is not None}) or [7 * 60, 19 * 60]
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    here = now.hour * 60 + now.minute
    before = [m for m in marks if m <= here]
    start_min = before[-1] if before else marks[-1] - 24 * 60
    later = [m for m in marks if m > start_min]
    end_min = later[0] if later else marks[0] + 24 * 60
    return midnight + timedelta(minutes=start_min), midnight + timedelta(minutes=end_min)


def column_values(data, col_id):
    """Every charted amount in one time column, plus true urine output worked out from the catheter."""
    values = {}
    for key in CHARTED_KEYS:
        n = number(((data or {}).get(key) or {}).get(col_id))
        if n is not None:
            values[key] = n / 2 if key == "ice_chips" else n
    if CATHETER_KEY in values:
        values[TRUE_URINE_KEY] = max(values[CATHETER_KEY] - values.get(IRRIGATION_KEY, 0), 0)
    return values


def intake_output_of(values):
    """(intake, output) for one column's values; None for a side with nothing measured."""
    intake = [values[k] for k in INTAKE_KEYS if k in values]
    output = [values[k] for k in OUTPUT_KEYS + (TRUE_URINE_KEY,) if k in values]
    return (sum(intake) if intake else None, sum(output) if output else None)


def net_of(intake, output):
    return None if intake is None and output is None else (intake or 0) - (output or 0)


def summarize(columns, data, now, settings=None, weight_kg=None):
    """
    Totals and alerts for one flowsheet.

    columns   the flowsheet's time columns [{"id", "timestamp"}, ...]
    data      {row_key: {column_id: value}}
    now       timezone-aware "current time" in the clinic's zone
    settings  the clinic's values (see DEFAULTS); missing keys fall back to the defaults
    """
    cfg = {**DEFAULTS, **{k: v for k, v in (settings or {}).items() if v is not None or k in DEFAULTS}}
    shift_start, shift_end = shift_window(now, cfg["shift_starts"])
    day_start = now - timedelta(hours=24)
    periods = {
        "shift": {"label": f"{shift_start:%H:%M} to {shift_end:%H:%M}", "start": shift_start.isoformat(), "end": shift_end.isoformat()},
        "day": {"label": "Last 24 hours", "start": day_start.isoformat(), "end": now.isoformat()},
        "stay": {"label": "Length of stay", "start": None, "end": None},
    }
    sums = {p: {"intake": 0.0, "output": 0.0, "rows": {}} for p in periods}
    by_column = {}
    urine_events, first_at = [], None
    urine_recent = 0.0
    rate_start = now - timedelta(hours=RATE_WINDOW_HOURS)

    for col in columns or []:
        when = parse_when(col.get("timestamp"))
        values = column_values(data, col.get("id"))
        if when is None or not values:
            continue
        when = when.astimezone(now.tzinfo)
        intake, output = intake_output_of(values)
        by_column[col["id"]] = {"intake": clean(intake), "output": clean(output), "net": clean(net_of(intake, output)),
                                TRUE_URINE_KEY: clean(values.get(TRUE_URINE_KEY))}
        member = {"stay": True, "shift": shift_start <= when < shift_end, "day": day_start < when <= now}
        for name, inside in member.items():
            if not inside:
                continue
            sums[name]["intake"] += intake or 0
            sums[name]["output"] += output or 0
            for key, n in values.items():
                sums[name]["rows"][key] = sums[name]["rows"].get(key, 0) + n
        first_at = when if first_at is None or when < first_at else first_at
        urine = sum(values.get(k, 0) for k in URINE_KEYS)
        if urine > 0 and when <= now:
            urine_events.append(when)
        if rate_start < when <= now:
            urine_recent += urine

    result_periods = {}
    for name, info in periods.items():
        total = sums[name]
        result_periods[name] = {**info, "intake": clean(total["intake"]), "output": clean(total["output"]),
                                "net": clean(total["intake"] - total["output"])}
    rows = {}
    for name in periods:
        for key, n in sums[name]["rows"].items():
            rows.setdefault(key, {})[name] = clean(n)

    alerts = []
    day_net = sums["day"]["intake"] - sums["day"]["output"]
    limit = cfg.get("positive_balance_24h_ml")
    if limit and day_net > limit:
        alerts.append({"code": "positive_balance", "message": f"24-hour net balance is +{day_net:,.0f} mL, over the +{limit:,.0f} mL limit."})

    observed_hours = (now - first_at).total_seconds() / 3600 if first_at else 0
    hours = cfg.get("no_urine_hours")
    if first_at and hours and observed_hours >= hours:
        last = max(urine_events) if urine_events else None
        quiet = (now - last).total_seconds() / 3600 if last else observed_hours
        if quiet >= hours:
            since = f"since {last:%H:%M}" if last else "since charting began"
            alerts.append({"code": "no_urine", "message": f"No urine charted for {int(quiet)} hours ({since})."})

    rate = None
    if weight_kg and first_at and first_at <= rate_start:
        rate = urine_recent / weight_kg / RATE_WINDOW_HOURS
        floor = cfg.get("low_urine_ml_kg_h")
        if floor and urine_recent > 0 and rate < floor:
            alerts.append({"code": "low_urine_rate", "message": f"Urine output is {rate:.2f} mL/kg/h over the last {RATE_WINDOW_HOURS} hours, under {floor} mL/kg/h."})

    day_urine = sums["day"]["rows"].get("urine_voided", 0) + sums["day"]["rows"].get(TRUE_URINE_KEY, 0)
    floor_24 = cfg.get("low_urine_24h_ml")
    if floor_24 and first_at and first_at <= day_start and day_urine < floor_24:
        alerts.append({"code": "low_urine_24h", "message": f"Urine output was {day_urine:,.0f} mL in 24 hours, under {floor_24:,.0f} mL."})

    return {
        "now": now.isoformat(),
        "periods": result_periods,
        "columns": by_column,
        "rows": rows,
        "alerts": alerts,
        "urine_ml_kg_h": None if rate is None else round(rate, 2),
        "weight_kg": None if not weight_kg else round(weight_kg, 1),
    }
