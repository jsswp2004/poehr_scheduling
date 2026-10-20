"""
Growth chart math: z-scores and percentiles from the published LMS tables, which chart set fits an age, corrected age
for babies born early, and the flags a clinician is shown. Pure logic: no database and no Django.

Which standard (CDC's guidance on using growth charts):
- under 24 months: WHO Child Growth Standards (weight-for-age, length-for-age, weight-for-length, head circumference);
  flag lines are 2 standard deviations, labelled the 2nd and 98th percentiles.
- 24 months to 20 years: CDC growth charts (weight-for-age, stature-for-age, BMI-for-age); 5th, 85th and 95th lines.
A premature baby (under 37 weeks) is plotted at corrected age until 24 months. Flags are prompts for a clinician,
not diagnoses.
"""
import bisect
import json
import math
import os
from datetime import date

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "growth_data")
DAYS_PER_MONTH = 30.4375
SWITCH_MONTHS = 24.0
END_MONTHS = 240.0
TERM_DAYS = 280
PRETERM_BELOW_DAYS = 259  # fewer than 37 completed weeks
KG_PER_LB = 0.45359237
CM_PER_IN = 2.54

Z_85 = 1.0364333894937898
Z_95 = 1.6448536269514722
Z_75 = 0.6744897501960817
Z_FLAG = 2.0  # the WHO flag lines, labelled the 2nd and 98th percentiles

WHO, CDC = "WHO child growth standards", "CDC growth charts"

# key -> (table file, label, standard, kind, unit, lines)
WHO_LINES = [("2nd", -Z_FLAG), ("15th", -Z_85), ("50th", 0.0), ("85th", Z_85), ("98th", Z_FLAG)]
CDC_LINES = [("5th", -Z_95), ("25th", -Z_75), ("50th", 0.0), ("75th", Z_75), ("95th", Z_95)]
BMI_LINES = [("5th", -Z_95), ("50th", 0.0), ("85th", Z_85), ("95th", Z_95)]
CHARTS = {
    "who_weight_for_age": {"table": "who_weight_for_age", "label": "Weight-for-age", "standard": WHO, "x": "age", "unit": "kg", "lines": WHO_LINES},
    "who_length_for_age": {"table": "who_length_for_age", "label": "Length-for-age", "standard": WHO, "x": "age", "unit": "cm", "lines": WHO_LINES},
    "who_weight_for_length": {"table": "who_weight_for_length", "label": "Weight-for-length", "standard": WHO, "x": "length", "unit": "kg", "lines": WHO_LINES},
    "who_head_circumference": {"table": "who_head_circumference", "label": "Head circumference", "standard": WHO, "x": "age", "unit": "cm", "lines": WHO_LINES},
    "cdc_weight_for_age": {"table": "cdc_weight_for_age", "label": "Weight-for-age", "standard": CDC, "x": "age", "unit": "kg", "lines": CDC_LINES},
    "cdc_stature_for_age": {"table": "cdc_stature_for_age", "label": "Stature-for-age", "standard": CDC, "x": "age", "unit": "cm", "lines": CDC_LINES},
    "cdc_bmi_for_age": {"table": "cdc_bmi_for_age", "label": "BMI-for-age", "standard": CDC, "x": "age", "unit": "kg/m²", "lines": BMI_LINES},
}
WHO_SET = ["who_weight_for_age", "who_length_for_age", "who_weight_for_length", "who_head_circumference"]
CDC_SET = ["cdc_weight_for_age", "cdc_stature_for_age", "cdc_bmi_for_age"]
SEX_KEY = {"male": "1", "female": "2"}

_cache = {}


def _load(name):
    if name not in _cache:
        with open(os.path.join(DATA_DIR, name + ".json"), encoding="utf-8") as handle:
            raw = json.load(handle)
        _cache[name] = {sex: ([row[0] for row in rows], rows) for sex, rows in raw.items()}
    return _cache[name]


def lms_at(table, sex, key):
    """(L, M, S) at an age or length, interpolated between table rows; None outside the table or for an unknown sex."""
    pair = _load(table).get(SEX_KEY.get(sex))
    if pair is None or key is None:
        return None
    keys, rows = pair
    if key < keys[0] - 1e-9 or key > keys[-1] + 1e-9:
        return None
    i = bisect.bisect_left(keys, key)
    if i >= len(keys):
        i = len(keys) - 1
    if abs(keys[i] - key) < 1e-9:
        return rows[i][1], rows[i][2], rows[i][3]
    lo, hi = rows[i - 1], rows[i]
    t = (key - lo[0]) / (hi[0] - lo[0])
    return tuple(lo[n] + t * (hi[n] - lo[n]) for n in (1, 2, 3))


def z_score(value, lms):
    low, mid, spread = lms
    if abs(low) < 1e-9:
        return math.log(value / mid) / spread
    return ((value / mid) ** low - 1) / (low * spread)


def value_at_z(z, lms):
    low, mid, spread = lms
    if abs(low) < 1e-9:
        return mid * math.exp(spread * z)
    base = 1 + low * spread * z
    return mid * base ** (1 / low) if base > 0 else None


def percentile_of(z):
    return 0.5 * math.erfc(-z / math.sqrt(2)) * 100


def ordinal(n):
    n = int(n)
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    return f"{n}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th') }"


def percentile_label(p):
    if p < 1:
        return "<1st"
    if p > 99:
        return ">99th"
    return ordinal(round(p))


# ---- ages -------------------------------------------------------------------------------------------------------

def gestation_days(weeks, days):
    if weeks in (None, ""):
        return None
    return int(weeks) * 7 + int(days or 0)


def correction_days(weeks, days):
    """Days to subtract from age for a baby born before 37 weeks; 0 for a term baby or when it is not known."""
    total = gestation_days(weeks, days)
    if total is None or total >= PRETERM_BELOW_DAYS:
        return 0
    return max(0, TERM_DAYS - total)


def plot_age_days(chrono_days, corr_days, corrected=True):
    """Age used on the chart: corrected while the child is under 24 months, otherwise the real age."""
    if corrected and corr_days and chrono_days < SWITCH_MONTHS * DAYS_PER_MONTH:
        return chrono_days - corr_days
    return chrono_days


def months(days):
    return days / DAYS_PER_MONTH


# ---- one set of measurements -------------------------------------------------------------------------------------

def classify(chart, z, percentile):
    """(status, label, flag). Flags are prompts for review, never diagnoses."""
    if chart.startswith("who_"):
        low, high = z < -Z_FLAG, z > Z_FLAG
        if chart == "who_length_for_age":
            if low:
                return "low", "Below the 2nd percentile (short length)", True
            return ("high", "Above the 98th percentile", False) if high else ("ok", "Within range", False)
        if low:
            return "low", "Below the 2nd percentile", True
        if high:
            return "high", "Above the 98th percentile", True
        return "ok", "Within range", False
    if chart == "cdc_bmi_for_age":
        if percentile < 5:
            return "low", "Below the 5th percentile (underweight range)", True
        if percentile >= 95:
            return "high", "At or above the 95th percentile (obesity range)", True
        if percentile >= 85:
            return "high", "85th to below the 95th percentile (overweight range)", True
        return "ok", "Within range", False
    if percentile < 5:
        return "low", "Below the 5th percentile", True
    if percentile > 95:
        return "high", "Above the 95th percentile", chart == "cdc_weight_for_age"
    return "ok", "Within range", False


def evaluate(sex, plot_days, weight_kg=None, height_cm=None, head_cm=None):
    """{chart key: result} for the charts these measurements can be placed on at this plotted age."""
    out = {}
    if sex not in SEX_KEY or plot_days is None or plot_days < 0:
        return out
    age = months(plot_days)
    if age > END_MONTHS + 0.5:
        return out

    def add(chart, value, key, x):
        if value is None or value <= 0:
            return
        lms = lms_at(CHARTS[chart]["table"], sex, key)
        if lms is None:
            return
        z = z_score(value, lms)
        p = percentile_of(z)
        status, label, flag = classify(chart, z, p)
        out[chart] = {"chart": chart, "x": x, "value": value, "z": z, "percentile": p, "percentile_label": percentile_label(p),
                      "status": status, "status_label": label, "flag": flag}

    if age < SWITCH_MONTHS:
        add("who_weight_for_age", weight_kg, plot_days, age)
        add("who_length_for_age", height_cm, plot_days, age)
        add("who_head_circumference", head_cm, plot_days, age)
        if weight_kg and height_cm:
            add("who_weight_for_length", weight_kg, round(height_cm, 1), height_cm)
    else:
        add("cdc_weight_for_age", weight_kg, age, age)
        add("cdc_stature_for_age", height_cm, age, age)
        if weight_kg and height_cm:
            add("cdc_bmi_for_age", weight_kg / (height_cm / 100) ** 2, age, age)
    return out


# ---- the chart payload -------------------------------------------------------------------------------------------

def nice_ticks(low, high, target=8):
    span = max(high - low, 1e-9)
    raw = span / target
    magnitude = 10 ** math.floor(math.log10(raw))
    step = next(m * magnitude for m in (1, 2, 2.5, 5, 10) if m * magnitude >= raw)
    start = math.floor(low / step) * step
    ticks, v = [], start
    while v <= high + step * 0.5:
        ticks.append(round(v, 6))
        v += step
    return ticks


def _curve_xs(chart):
    if chart.startswith("who_") and CHARTS[chart]["x"] == "age":
        return [i * 0.5 for i in range(0, 49)]
    if chart == "who_weight_for_length":
        return [45 + i for i in range(0, 66)]
    return [SWITCH_MONTHS + 3 * i for i in range(0, int((END_MONTHS - SWITCH_MONTHS) / 3) + 1)]


def _curve_lms(chart, sex, x):
    table = CHARTS[chart]["table"]
    if chart.startswith("who_") and CHARTS[chart]["x"] == "age":
        return lms_at(table, sex, x * DAYS_PER_MONTH)
    return lms_at(table, sex, x)


def curves_for(chart, sex):
    lines = []
    for label, z in CHARTS[chart]["lines"]:
        points = []
        for x in _curve_xs(chart):
            lms = _curve_lms(chart, sex, x)
            y = value_at_z(z, lms) if lms else None
            if y is not None:
                points.append([x, round(y, 3)])
        lines.append({"label": label, "z": round(z, 4), "points": points})
    return lines


def axes_for(chart, curves, points):
    ys = [p[1] for c in curves for p in c["points"]] + [p["value"] for p in points]
    ticks_y = nice_ticks(min(ys), max(ys))
    if CHARTS[chart]["x"] == "length":
        x = {"label": "Length (cm)", "unit": "cm", "min": 45, "max": 110, "ticks": [[v, str(v)] for v in range(45, 111, 5)]}
    elif chart.startswith("who_"):
        x = {"label": "Age in months", "unit": "months", "min": 0, "max": 24, "ticks": [[v, str(v)] for v in range(0, 25, 3)]}
    else:
        x = {"label": "Age in years", "unit": "years", "min": 24, "max": 240, "ticks": [[v, str(v // 12)] for v in range(24, 241, 24)]}
    unit = CHARTS[chart]["unit"]
    word = {"kg": "Weight (kg)", "cm": "Length (cm)" if chart == "who_length_for_age" else "Head circumference (cm)" if chart == "who_head_circumference" else "Stature (cm)", "kg/m²": "BMI (kg/m²)"}[unit]
    y = {"label": word, "unit": unit, "min": ticks_y[0], "max": ticks_y[-1], "ticks": [[v, f"{v:g}"] for v in ticks_y]}
    return x, y


def title_for(chart, sex):
    meta = CHARTS[chart]
    who = "boys" if sex == "male" else "girls"
    rng = {"who": "birth to 24 months", "cdc": "2 to 20 years"}[chart[:3]]
    if chart == "who_weight_for_length":
        return f"Weight-for-length, {who}, birth to 24 months"
    return f"{meta['label']}, {who}, {rng}"


def build_charts(sex, dob, as_of, measurements, gest_weeks=None, gest_days=None, corrected=True):
    """
    measurements: [{"date": date, "weight_kg": x or None, "height_cm": x or None, "head_cm": x or None}, ...]
    Returns (info, charts). info says what applies to this patient; charts are the set that fits the age on as_of.
    """
    corr = correction_days(gest_weeks, gest_days)
    chrono_now = (as_of - dob).days
    plot_now = plot_age_days(chrono_now, corr, corrected)
    set_keys = WHO_SET if months(plot_now) < SWITCH_MONTHS else CDC_SET
    info = {"correction_days": corr, "preterm": corr > 0, "corrected_applied": bool(corrected and corr and chrono_now < SWITCH_MONTHS * DAYS_PER_MONTH),
            "chrono_months": round(months(chrono_now), 1), "plot_months": round(months(plot_now), 1)}
    charts = {key: [] for key in set_keys}
    for m in sorted(measurements, key=lambda m: m["date"]):
        chrono = (m["date"] - dob).days
        if chrono < 0:
            continue
        plot = plot_age_days(chrono, corr, corrected)
        results = evaluate(sex, plot, m.get("weight_kg"), m.get("height_cm"), m.get("head_cm"))
        for key, res in results.items():
            if key in charts:
                res = dict(res)
                res.update({"date": m["date"].isoformat(), "chrono_months": round(months(chrono), 1), "plot_months": round(months(plot), 1),
                            "weight_kg": m.get("weight_kg"), "height_cm": m.get("height_cm")})
                charts[key].append(res)
    out = []
    for key in set_keys:
        points = charts[key]
        curves = curves_for(key, sex)
        x, y = axes_for(key, curves, points)
        out.append({
            "key": key, "label": CHARTS[key]["label"], "title": title_for(key, sex), "standard": CHARTS[key]["standard"],
            "x": x, "y": y, "curves": curves,
            "points": [{**p, "z": round(p["z"], 2), "percentile": round(p["percentile"], 1), "value": round(p["value"], 2)} for p in points],
            "latest": ({**points[-1], "z": round(points[-1]["z"], 2), "percentile": round(points[-1]["percentile"], 1), "value": round(points[-1]["value"], 2)} if points else None),
            "flagged": bool(points and points[-1]["flag"]),
        })
    return info, out
