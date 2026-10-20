"""Triage note: what the nurse sees (vitals, allergies, medicines, the clinic's numbers) and the checks made when the note is signed."""
import json
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path

from django.db.models import Count, Max
from django.utils import timezone

from . import clinical_summary
from . import immunization_service as vaccine_service
from . import triage_engine as engine
from .models import ClinicalNote, HomeMedication, PatientAllergy, PatientAllergyStatus, TriageReassessment, TriageSettings
from .patient_header import allergy_summary

DATA = Path(__file__).resolve().parent / "triage_data"
KG_PER_LB = 0.45359237
ADULT_AGE_YEARS = 18
TRIAGE_CODE = "triage_note"
_cssrs = None


def cssrs_screener():
    global _cssrs
    if _cssrs is None:
        _cssrs = json.loads((DATA / "cssrs_screener.json").read_text(encoding="utf-8"))
    return deepcopy(_cssrs)


def age_days(dob, as_of=None):
    return ((as_of or timezone.localdate()) - dob).days


def is_child(days):
    return days < ADULT_AGE_YEARS * 365.25


def clinic_settings(org):
    """The built-in defaults with the clinic's own values laid over them, plus where each came from."""
    base = engine.default_settings()
    row = TriageSettings.objects.filter(organization=org).select_related("approved_by").first() if org else None
    base["clinic"] = {"danger_zone": False, "fever": False, "approved_by": None, "approved_at": None, "suicide_screen_min_age_years": None}
    if row:
        if row.danger_zone:
            base["danger_zone"], base["clinic"]["danger_zone"] = row.danger_zone, True
        if row.fever:
            base["fever"], base["clinic"]["fever"] = {**base["fever"], **row.fever}, True
        base["reassess_minutes"] = row.reassess_minutes or {}
        base["clinic"]["suicide_screen_min_age_years"] = row.suicide_screen_min_age_years
        if row.approved_by_id:
            user = row.approved_by
            base["clinic"]["approved_by"] = f"{user.first_name} {user.last_name}".strip() or user.username
            base["clinic"]["approved_at"] = row.approved_at.isoformat() if row.approved_at else None
    return base


def latest_vitals(patient):
    """{hr, rr, spo2, temp_f, sbp, dbp, weight_kg, pain, at} from the Vital Signs flowsheet (latest value of each)."""
    latest = clinical_summary._vitals(patient)["latest"]
    out = {key: latest[key]["value"] for key in ("hr", "rr", "spo2", "sbp", "dbp", "pain") if key in latest}
    if "temp" in latest:
        out["temp_f"] = latest["temp"]["value"]
    if "weight" in latest:
        out["weight_kg"] = round(latest["weight"]["value"] * KG_PER_LB, 1)
    stamps = [v["at"] for v in latest.values() if v.get("at")]
    out["at"] = max(stamps) if stamps else None
    return out


def allergies_for(patient):
    text, emphasis, rows = allergy_summary(patient)
    return {"text": text, "emphasis": emphasis,
            "records": [{"substance": a.substance, "reaction": a.reaction, "severity": a.severity} for a in rows]}


def medicines_for(patient):
    meds = HomeMedication.objects.filter(patient=patient, status="active")
    return [{"name": m.drug_name, "strength": m.strength, "dose": m.dose, "frequency": m.frequency, "prn": m.prn} for m in meds[:30]]


def _truthy(value):
    return value is True or str(value).strip().lower() in ("true", "yes", "1", "on")


def answers_from(data):
    """The ESI answers the nurse gave, from either a note's saved fields or a request body."""
    resources = data.get("esi_resources", data.get("resources"))
    return {
        "a_life_saving": _truthy(data.get("esi_a_life_saving", data.get("a_life_saving"))),
        "b_high_risk": _truthy(data.get("esi_b_high_risk", data.get("b_high_risk"))),
        "b_confused": _truthy(data.get("esi_b_confused", data.get("b_confused"))),
        "b_severe_pain": _truthy(data.get("esi_b_severe_pain", data.get("b_severe_pain"))),
        "resources": resources if str(resources).strip() != "" else None,
        "immunization_incomplete": data.get("child_immunizations", data.get("immunization_incomplete")) in ("incomplete", True),
    }


def suggestion(patient, org, answers, vitals=None):
    dob, _sex = vaccine_service.patient_facts(patient)
    days = age_days(dob) if dob else None
    if days is None or days < 0:
        return None
    cfg = clinic_settings(org)
    vit = vitals if vitals is not None else latest_vitals(patient)
    result = engine.suggest(answers, days, vit, cfg["danger_zone"], cfg["fever"])
    result["age_days"] = days
    return result


def cssrs_action(data):
    """'none', 'referral' or 'immediate' from the saved screener answers."""
    yes = lambda key: str(data.get(key, "")).lower() == "yes"  # noqa: E731
    if yes("cssrs_4") or yes("cssrs_5") or (yes("cssrs_6") and yes("cssrs_6_recent")):
        return "immediate"
    if yes("cssrs_1") or yes("cssrs_2") or yes("cssrs_3") or yes("cssrs_6"):
        return "referral"
    return "none"


def _number(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def prepare_signing(note):
    """
    Checks before a triage note is signed. Returns (problems, snapshot): problems stop the signing; the snapshot is stored in the
    signed note (what was suggested, the vitals it used, the screener result), so the record shows what the nurse saw.
    """
    data = note.structured_data or {}
    problems = []
    patient = note.patient
    dob, _sex = vaccine_service.patient_facts(patient)
    if dob is None:
        return ["The patient has no date of birth, so the triage level cannot be checked."], {}
    days = age_days(dob)
    vitals = latest_vitals(patient)
    if not str(data.get("chief_complaint", "")).strip():
        problems.append("Choose the chief complaint.")
    if not any(k in vitals for k in ("hr", "rr", "spo2", "temp_f", "sbp")):
        problems.append("No vital signs are recorded for this patient. Enter them in the Vital Signs flowsheet first.")
    if is_child(days):
        weight = _number(data.get("child_weight_kg")) or vitals.get("weight_kg")
        if not weight or weight <= 0:
            problems.append("Enter the child's weight in kg.")
    result = suggestion(patient, note.organization, answers_from(data), vitals)
    if result and result["level"] is None:
        problems.extend(result["needs"])
    problems.extend(engine.check_level(data.get("esi_level"), result or {}, data.get("esi_override_reason")))
    snapshot = {
        "vitals": vitals, "age_days": days,
        "suggested_level": result["level"] if result else None, "suggested_label": result["label"] if result else None,
        "consider": result["consider"] if result else None, "reasons": result["reasons"] if result else [],
        "suicide_screen_action": cssrs_action(data), "screener_verified": bool(cssrs_screener().get("verified")),
    }
    return problems, snapshot


def finish_signing(note):
    """After signing: the chosen level goes onto the visit, where the ED board shows it. Returns the visit or None."""
    from users.models import Registration

    level = int((note.structured_data or {}).get("esi_level"))
    visit = Registration.objects.filter(appointment_id=note.appointment_id).order_by("-created_at", "-pk").first()
    if visit is not None and visit.esi != level:
        visit.esi = level
        visit.save(update_fields=["esi"])
    return visit


# ---- reassessment log and the ED board ------------------------------------------------------------------------------

VITAL_LIMITS = {"hr": (0, 300), "rr": (0, 100), "spo2": (0, 100), "temp_f": (80, 115), "sbp": (30, 300), "dbp": (10, 200), "pain": (0, 10)}
VITAL_NAMES = {"hr": "Heart rate", "rr": "Respiratory rate", "spo2": "Oxygen saturation", "temp_f": "Temperature", "sbp": "Systolic pressure", "dbp": "Diastolic pressure", "pain": "Pain"}


def signed_triage_note(appointment_id):
    """The latest signed triage note of a visit, or None."""
    if not appointment_id:
        return None
    return (ClinicalNote.objects.filter(appointment_id=appointment_id, documentation_type=TRIAGE_CODE, status="signed")
            .select_related("author").order_by("-signed_at", "-pk").first())


def clean_vitals(raw):
    """(vitals, problem): only the known vital signs, as numbers inside sensible limits; blank ones are left out."""
    if raw in (None, ""):
        return {}, None
    if not isinstance(raw, dict):
        return None, "Vital signs must be sent as an object."
    out = {}
    for key, value in raw.items():
        if key not in VITAL_LIMITS:
            return None, f"'{key}' is not a vital sign the log records."
        if value in (None, ""):
            continue
        number = _number(value)
        low, high = VITAL_LIMITS[key]
        if number is None or not low <= number <= high:
            return None, f"{VITAL_NAMES[key]} must be a number from {low} to {high}."
        out[key] = int(number) if float(number).is_integer() and key != "temp_f" else round(number, 1)
    return out, None


def due_at(level, signed_at, last_at, gaps):
    """(due time, gap minutes): when the next recheck is due, from the clinic's gap for this level. (None, None) when no gap is set."""
    gap = engine.reassessment_gap_minutes(level, gaps)
    if gap is None or signed_at is None or not level:
        return None, gap
    return (last_at or signed_at) + timedelta(minutes=gap), gap


def clinic_gaps(org):
    row = TriageSettings.objects.filter(organization=org).values_list("reassess_minutes", flat=True).first() if org else None
    return row or {}


def _person(user):
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    return f"{last}, {first}" if first and last else (first or last or user.username)


def reassessment_log(patient, visit, org):
    """Everything the reassessment panel shows: the initial triage row, each recheck, and when the next one is due."""
    note = signed_triage_note(visit.appointment_id) if visit else None
    if note is None:
        return {"triage": None, "rows": [], "gap_minutes": None, "due_at": None, "visit": ({"id": visit.pk, "esi": visit.esi} if visit else None)}
    dob, _sex = vaccine_service.patient_facts(patient)
    cfg = clinic_settings(org)
    days = age_days(dob) if dob else None

    def flags(vitals):
        return engine.vital_flags(days, vitals, cfg["danger_zone"], cfg["fever"]) if days is not None else {}

    snap = (note.structured_data or {}).get("triage_snapshot", {})
    first = {k: v for k, v in (snap.get("vitals") or {}).items() if k in VITAL_LIMITS}
    rows = [{"id": None, "at": note.signed_at.isoformat() if note.signed_at else None, "vitals": first, "flags": flags(first), "change": "Initial triage",
             "level_before": None, "level_after": (note.structured_data or {}).get("esi_level"), "nurse": _person(note.author)}]
    logged = list(TriageReassessment.objects.filter(appointment_id=visit.appointment_id).select_related("recorded_by"))
    for r in logged:
        rows.append({"id": r.pk, "at": r.recorded_at.isoformat(), "vitals": r.vitals, "flags": flags(r.vitals), "change": r.change,
                     "level_before": r.level_before, "level_after": r.level_after, "nurse": _person(r.recorded_by)})
    last_at = logged[-1].recorded_at if logged else None
    due, gap = due_at(visit.esi, note.signed_at, last_at, cfg["reassess_minutes"])
    return {"triage": {"note_id": note.pk, "signed_at": note.signed_at.isoformat() if note.signed_at else None, "nurse": _person(note.author)},
            "rows": rows, "gap_minutes": gap, "due_at": due.isoformat() if due else None, "visit": {"id": visit.pk, "esi": visit.esi}}


def record_reassessment(patient, visit, user, data):
    """(None, problem) or (saved row, None). The log only grows; a changed level goes onto the visit so the ED board follows it."""
    if visit is None or visit.discharge_datetime is not None:
        return None, "There is no open visit to reassess."
    if signed_triage_note(visit.appointment_id) is None:
        return None, "Sign the triage note first. Rechecks are added after triage."
    vitals, problem = clean_vitals(data.get("vitals"))
    if problem:
        return None, problem
    change = str(data.get("change") or "").strip()[:2000]
    if not vitals and not change:
        return None, "Enter at least one vital sign or say what changed."
    level = data.get("level")
    if level in (None, ""):
        level = visit.esi
    else:
        try:
            level = int(level)
        except (TypeError, ValueError):
            return None, "The level must be a number from 1 to 5."
        if not 1 <= level <= 5:
            return None, "The level must be a number from 1 to 5."
    if level != visit.esi and not change:
        return None, "Say what changed, because the level is different now."
    row = TriageReassessment.objects.create(
        organization=visit.organization or patient.organization, appointment_id=visit.appointment_id, patient=patient, recorded_by=user,
        vitals=vitals, change=change, level_before=visit.esi, level_after=level)
    if level != visit.esi:
        visit.esi = level
        visit.save(update_fields=["esi"])
    return row, None


def board_info(visits, gaps):
    """{registration id: {note, signed_at, level, reassessments, last_at, due_at, gap_minutes}} for the ED board, in two queries."""
    by_appt = {v.appointment_id: v for v in visits if v.appointment_id}
    out = {v.pk: {"note": "none", "signed_at": None, "reassessments": 0, "last_at": None, "due_at": None, "gap_minutes": None} for v in visits}
    if not by_appt:
        return out
    notes = {}
    for appt_id, status, signed_at in (ClinicalNote.objects.filter(appointment_id__in=by_appt, documentation_type=TRIAGE_CODE)
                                       .order_by("created_at", "pk").values_list("appointment_id", "status", "signed_at")):
        current = notes.get(appt_id)
        if status == "signed":
            if current is None or current[0] != "signed" or (signed_at and (current[1] is None or signed_at >= current[1])):
                notes[appt_id] = (status, signed_at)
        elif current is None:
            notes[appt_id] = (status, signed_at)
    counts = {r["appointment_id"]: r for r in TriageReassessment.objects.filter(appointment_id__in=by_appt).values("appointment_id").annotate(last=Max("recorded_at"), n=Count("id"))}
    for appt_id, visit in by_appt.items():
        item = out[visit.pk]
        status, signed_at = notes.get(appt_id, (None, None))
        item["note"] = status if status in ("draft", "signed") else "none"
        if status == "signed":
            item["signed_at"] = signed_at.isoformat() if signed_at else None
            last = counts.get(appt_id)
            last_at = last["last"] if last else None
            item["reassessments"] = last["n"] if last else 0
            item["last_at"] = last_at.isoformat() if last_at else None
            due, gap = due_at(visit.esi, signed_at, last_at, gaps)
            item["due_at"], item["gap_minutes"] = (due.isoformat() if due else None), gap
    return out
