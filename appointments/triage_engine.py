"""
Triage (ESI) logic. Pure functions, no database: the suggestion a nurse sees while triaging, and the checks made when the note is signed.

The Emergency Severity Index asks four questions in order:
  A  Does the patient need a life-saving intervention right now?            yes = level 1
  B  Should the patient wait? (high-risk situation, new confusion, severe pain)  yes = level 2
  C  How many resources will be needed?  none = 5, one = 4, two or more = 3
  D  For a level 3 only: are the vital signs in the "danger zone" for the age? Consider level 2.
The engine suggests a level and says why. The nurse always chooses the level; a different level needs a reason.

Age bands, fever limits and recheck gaps are data, and a clinic can replace them (TriageSettings):
the defaults below are the ones written in the ESI handbook text that was read when this was built (see SOURCES).
"""
from copy import deepcopy

DAYS_PER_MONTH = 30.4375
CHILD_UNDER_YEARS = 18
LEVEL_NAMES = {1: "Resuscitation", 2: "Emergent", 3: "Urgent", 4: "Less urgent", 5: "Non-urgent"}

SOURCES = {
    "danger_zone": "ESI Implementation Handbook, chapter 3 (AHRQ edition): danger-zone vital signs by age, SpO2 below 92%. "
                   "A later handbook edition prints a different, finer table (Figure 6-1) that could not be read cleanly; a clinic should confirm this table.",
    "fever": "ESI Implementation Handbook, chapter 2, figure 2-2: 1 to 28 days over 38.0 C (100.4 F) is at least level 2; "
             "1 to 3 months over 38.0 C consider level 2; 3 months and older over 39.0 C (102.2 F) or under 36.0 C (96.8 F) consider level 2 or 3. "
             "Chapter 6 table 6-2 gives 38.5 C for the older group; a clinic should confirm which it follows.",
}

DEFAULT_DANGER_ZONE = {
    "bands": [
        {"label": "Under 3 months", "min_months": 0, "max_months": 3, "hr_over": 180, "rr_over": 50},
        {"label": "3 months to under 3 years", "min_months": 3, "max_months": 36, "hr_over": 160, "rr_over": 40},
        {"label": "3 to under 8 years", "min_months": 36, "max_months": 96, "hr_over": 140, "rr_over": 30},
        {"label": "8 years and older", "min_months": 96, "max_months": None, "hr_over": 100, "rr_over": 20},
    ],
    "spo2_below": 92,
}
DEFAULT_FEVER = {"neonate_days": 28, "fever_c": 38.0, "infant_months": 3, "older_high_c": 39.0, "older_low_c": 36.0}


def f_to_c(f):
    return round((float(f) - 32.0) * 5.0 / 9.0, 2)


def age_months(age_days):
    return age_days / DAYS_PER_MONTH


def band_for(age_days, danger_zone=None):
    zone = danger_zone or DEFAULT_DANGER_ZONE
    months = age_months(age_days)
    for band in zone["bands"]:
        top = band.get("max_months")
        if months >= band["min_months"] and (top is None or months < top):
            return band
    return zone["bands"][-1]


def _num(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def vital_flags(age_days, vitals, danger_zone=None, fever=None):
    """
    Only what a source backs: heart rate and respiratory rate over the age limit, SpO2 under the limit, and fever by age.
    Blood pressure and everything else is shown without a flag. -> {"hr": {...}, "rr": {...}, "spo2": {...}, "temp": {...}}
    """
    zone, fv = danger_zone or DEFAULT_DANGER_ZONE, fever or DEFAULT_FEVER
    band = band_for(age_days, zone)
    out = {}
    hr, rr, spo2, temp = (_num(vitals.get(k)) for k in ("hr", "rr", "spo2", "temp_f"))
    if hr is not None:
        out["hr"] = {"status": "high" if hr > band["hr_over"] else "ok", "limit": band["hr_over"],
                     "text": f"High (over {band['hr_over']} for age)" if hr > band["hr_over"] else "Within range"}
    if rr is not None:
        out["rr"] = {"status": "high" if rr > band["rr_over"] else "ok", "limit": band["rr_over"],
                     "text": f"High (over {band['rr_over']} for age)" if rr > band["rr_over"] else "Within range"}
    if spo2 is not None:
        low = spo2 < zone["spo2_below"]
        out["spo2"] = {"status": "low" if low else "ok", "limit": zone["spo2_below"],
                       "text": f"Low (under {zone['spo2_below']}%)" if low else "Within range"}
    if temp is not None:
        kind = fever_kind(age_days, temp, fv)
        out["temp"] = {"status": "ok" if kind is None else "fever", "kind": kind,
                       "text": "Within range" if kind is None else {"neonate": "Fever in a baby under 29 days", "infant": "Fever (over 100.4 F)",
                                                                    "older_high": "Fever (over 102.2 F)" if abs(fv["older_high_c"] - 39.0) < 0.01 else f"Fever (over {fv['older_high_c']} C)",
                                                                    "older_low": "Low temperature"}[kind]}
    return out


def fever_kind(age_days, temp_f, fever=None):
    """None, or 'neonate' (1 to 28 days), 'infant' (to 3 months), 'older_high' or 'older_low' (3 months and older)."""
    fv = fever or DEFAULT_FEVER
    if age_days >= CHILD_UNDER_YEARS * 365.25:
        return None  # the handbook's fever rules are for children
    t = f_to_c(temp_f)
    if age_days <= fv["neonate_days"]:
        return "neonate" if t > fv["fever_c"] else None
    if age_months(age_days) < fv["infant_months"]:
        return "infant" if t > fv["fever_c"] else None
    if t > fv["older_high_c"]:
        return "older_high"
    if t < fv["older_low_c"]:
        return "older_low"
    return None


def _label(level):
    return f"ESI {level}: {LEVEL_NAMES[level]}"


def suggest(answers, age_days, vitals, danger_zone=None, fever=None):
    """
    answers: a_life_saving (bool), b_high_risk, b_confused, b_severe_pain (bool), resources (int or None), immunization_incomplete (bool)
    vitals:  hr, rr, spo2, temp_f
    -> {level, label, consider, reasons, prompts, needs, steps, vital_flags}
    """
    a = bool(answers.get("a_life_saving"))
    b_items = [text for key, text in (("b_high_risk", "a high-risk situation"), ("b_confused", "new confusion, lethargy or disorientation"),
                                      ("b_severe_pain", "severe pain or distress")) if answers.get(key)]
    resources = answers.get("resources")
    resources = int(resources) if _num(resources) is not None else None
    flags = vital_flags(age_days, vitals, danger_zone, fever)
    fv = fever or DEFAULT_FEVER
    temp = _num(vitals.get("temp_f"))
    kind = fever_kind(age_days, temp, fv) if temp is not None else None

    level, reasons, prompts, needs = None, [], [], []
    steps = {"A": {"answer": "yes" if a else "no", "text": "Needs a life-saving intervention right now." if a else "Needs no life-saving intervention."},
             "B": {"answer": "yes" if b_items else "no", "text": ("Yes: " + "; ".join(b_items) + ".") if b_items else "No high-risk situation, confusion or severe pain."},
             "C": {"answer": None, "text": ""}, "D": {"answer": None, "text": ""}}

    if a:
        level = 1
        reasons.append("needs a life-saving intervention")
    elif b_items:
        level = 2
        reasons.append(" and ".join(b_items))
    elif kind == "neonate":
        level = 2
        reasons.append("fever in a baby 28 days old or younger (always at least level 2)")
    if level is not None and level <= 2:
        steps["C"]["text"] = "Not needed. The level was already decided."
        steps["D"]["text"] = "Only checked for a level 3."
    else:
        if resources is None:
            needs.append("Answer question C: how many resources will this patient need?")
            steps["C"]["text"] = "Not answered yet."
        else:
            level = 5 if resources == 0 else 4 if resources == 1 else 3
            steps["C"].update(answer=str(resources), text=f"{resources} resource{'s' if resources != 1 else ''}: level {level}.")
            reasons.append("no resources expected" if resources == 0 else "one resource expected" if resources == 1 else "two or more resources expected")

    consider = []
    if level == 3:
        zone = []
        if flags.get("hr", {}).get("status") == "high":
            zone.append(f"heart rate over {flags['hr']['limit']} for age")
        if flags.get("rr", {}).get("status") == "high":
            zone.append(f"respiratory rate over {flags['rr']['limit']} for age")
        if flags.get("spo2", {}).get("status") == "low":
            zone.append(f"oxygen saturation under {flags['spo2']['limit']}%")
        if zone:
            consider.append(2)
            steps["D"].update(answer="yes", text="Danger zone: " + "; ".join(zone) + ". Consider level 2.")
            reasons.append("vital signs in the danger zone for age (" + "; ".join(zone) + ")")
        else:
            steps["D"].update(answer="no", text="Vital signs are not in the danger zone.")
    if kind == "infant":
        prompts.append("Fever in a child under 3 months. The ESI handbook says consider level 2.")
        consider.append(2)
    elif kind in ("older_high", "older_low"):
        why = "temperature over 102.2 F" if kind == "older_high" else "low temperature"
        extra = " with incomplete immunizations" if answers.get("immunization_incomplete") else ""
        prompts.append(f"Child 3 months or older with {why}{extra}. The ESI handbook says consider level 2 or 3.")
        consider.append(2 if level == 3 else 3)
        if extra:
            reasons.append("fever with incomplete immunizations")
    elif kind == "neonate" and level == 2 and not b_items and not a:
        prompts.append("Fever in a baby 28 days old or younger.")
    consider = [c for c in consider if level is not None and c < level]
    consider_level = min(consider) if consider else None
    if level == 3 and consider_level == 3:
        consider_level = None

    label = _label(level) if level else None
    if label and consider_level:
        label = f"{_label(level).split(':')[0]}, consider {consider_level}"
    return {"level": level, "label": label, "name": LEVEL_NAMES.get(level), "consider": consider_level, "reasons": reasons,
            "prompts": prompts, "needs": needs, "steps": steps, "vital_flags": flags}


def check_level(chosen, suggestion, reason):
    """Problems with the level the nurse picked (empty list = fine)."""
    problems = []
    try:
        chosen = int(chosen)
    except (TypeError, ValueError):
        return ["Choose a triage level from 1 to 5."]
    if chosen not in LEVEL_NAMES:
        return ["The triage level must be 1 to 5."]
    if suggestion.get("level") and chosen != suggestion["level"] and not str(reason or "").strip():
        problems.append("The level you chose differs from the suggestion. Add a short reason.")
    return problems


def reassessment_gap_minutes(level, settings_minutes):
    """Minutes between rechecks for this level, from the clinic's settings; None when the clinic has not set one."""
    value = (settings_minutes or {}).get(str(level))
    try:
        value = int(value)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def default_settings():
    return {"danger_zone": deepcopy(DEFAULT_DANGER_ZONE), "fever": deepcopy(DEFAULT_FEVER), "reassess_minutes": {}, "sources": SOURCES}
