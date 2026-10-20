"""
Triage note API.

    GET  /api/triage/patient/<id>/context/    what the triage form shows: vitals with flags, allergies, medicines, the clinic's numbers
    POST /api/triage/patient/<id>/suggest/    the ESI suggestion for the answers given so far
    GET  /api/triage/settings/                the clinic's age tables, fever limits and recheck gaps (and where each came from)
    PUT  /api/triage/settings/                admin only; saving the age tables or fever limits records who approved them
    GET  /api/triage/patient/<id>/reassessments/   the log of rechecks while the patient waits, and when the next is due
    POST /api/triage/patient/<id>/reassessments/   add a recheck (vital signs, what changed, the level now); the log only grows

The triage note itself is a normal ClinicalNote (template "triage_note"); signing it is checked and its level is
written to the visit in ClinicalNoteViewSet.sign.
"""
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Registration

from . import immunization_service as vaccine_service
from . import triage_engine as engine
from . import triage_service as service
from .chart_tabs import CLINICAL_ROLES
from .models import TriageSettings
from .patient_header import _patient_for

DEFAULT_SUICIDE_SCREEN_MIN_AGE = 18


def _name(user):
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    return f"{last}, {first}" if first and last else (first or last or user.username)


def _clinical(request):
    if getattr(request.user, "role", None) not in CLINICAL_ROLES:
        return Response({"detail": "Not allowed."}, status=403)
    return None


class TriageContextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        denied = _clinical(request)
        if denied:
            return denied
        patient, err = _patient_for(request, patient_id)
        if err is not None:
            return err
        dob, sex = vaccine_service.patient_facts(patient)
        body = {"problem": "", "problem_text": ""}
        if dob is None or dob > timezone.localdate():
            body.update(problem="no_dob", problem_text="This patient has no valid date of birth on file. The triage level cannot be checked without it.")
            return Response(body)
        days = service.age_days(dob)
        cfg = service.clinic_settings(patient.organization)
        vitals = service.latest_vitals(patient)
        flags = engine.vital_flags(days, vitals, cfg["danger_zone"], cfg["fever"])
        band = engine.band_for(days, cfg["danger_zone"])
        visits = Registration.objects.filter(patient__user=patient).order_by("-created_at", "-pk")
        visit = visits.filter(pk=request.query_params["visit"]).first() if request.query_params.get("visit", "").isdigit() else visits.first()
        min_age = cfg["clinic"]["suicide_screen_min_age_years"]
        min_age = DEFAULT_SUICIDE_SCREEN_MIN_AGE if min_age is None else min_age
        body.update({
            "patient": {"id": patient.pk, "name": _name(patient), "date_of_birth": dob.isoformat(), "sex": sex, "age_days": days,
                        "age_months": round(engine.age_months(days), 1), "is_child": service.is_child(days),
                        "show_suicide_screen": days >= min_age * 365.25},
            "visit": ({"id": visit.pk, "appointment_id": visit.appointment_id, "esi": visit.esi, "reason_for_visit": visit.reason_for_visit,
                       "arrival_time": (visit.arrival_time or visit.created_at).isoformat()} if visit else None),
            "vitals": vitals, "vital_flags": flags,
            "band": {"label": band["label"], "hr_over": band["hr_over"], "rr_over": band["rr_over"]},
            "allergies": service.allergies_for(patient), "medicines": service.medicines_for(patient),
            "settings": {"reassess_minutes": cfg["reassess_minutes"], "sources": cfg["sources"], "clinic": cfg["clinic"]},
            "screener": service.cssrs_screener(),
        })
        return Response(body)


class TriageSuggestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, patient_id):
        denied = _clinical(request)
        if denied:
            return denied
        patient, err = _patient_for(request, patient_id)
        if err is not None:
            return err
        result = service.suggestion(patient, patient.organization, service.answers_from(request.data))
        if result is None:
            return Response({"detail": "This patient has no valid date of birth."}, status=400)
        return Response(result)


# ---- clinic settings -------------------------------------------------------------------------------------------------

def _is_num(value, low=None, high=None):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and (low is None or value >= low) and (high is None or value <= high)


def _check_danger_zone(zone):
    if not isinstance(zone, dict) or not isinstance(zone.get("bands"), list) or not zone["bands"]:
        return "Age table: add at least one age band."
    expected_start = 0
    for i, band in enumerate(zone["bands"]):
        if not isinstance(band, dict) or not _is_num(band.get("hr_over"), 20, 400) or not _is_num(band.get("rr_over"), 5, 150):
            return "Age table: heart rate and respiratory rate limits must be numbers (heart rate 20 to 400, respiratory rate 5 to 150)."
        if band.get("min_months") != expected_start:
            return "Age table: each age band must start where the one before it ends, and the first must start at 0 months."
        top = band.get("max_months")
        last = i == len(zone["bands"]) - 1
        if last and top is not None:
            return "Age table: the last age band must have no upper age."
        if not last and not (_is_num(top) and top > expected_start):
            return "Age table: each band except the last needs an upper age greater than its start."
        expected_start = top
    if not _is_num(zone.get("spo2_below"), 50, 100):
        return "Oxygen saturation limit must be a number from 50 to 100."
    return ""


def _check_fever(fever):
    if not isinstance(fever, dict):
        return "Fever limits must be a set of numbers."
    for key in ("neonate_days", "fever_c", "infant_months", "older_high_c", "older_low_c"):
        if key in fever and not _is_num(fever[key], 0, 120):
            return f"Fever limit {key} must be a number."
    return ""


class TriageSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _org(self, request):
        return request.user.organization

    def get(self, request):
        denied = _clinical(request)
        if denied:
            return denied
        cfg = service.clinic_settings(self._org(request))
        return Response({**cfg, "defaults": engine.default_settings()})

    def put(self, request):
        if getattr(request.user, "role", None) not in ("admin", "system_admin"):
            return Response({"detail": "Only an administrator can change triage settings."}, status=403)
        org = self._org(request)
        if org is None:
            return Response({"detail": "This account has no organization."}, status=400)
        row, _ = TriageSettings.objects.get_or_create(organization=org)
        data, changed_numbers = request.data, False
        if "danger_zone" in data:
            if data["danger_zone"] in (None, ""):
                row.danger_zone, changed_numbers = None, True
            else:
                problem = _check_danger_zone(data["danger_zone"])
                if problem:
                    return Response({"detail": problem}, status=400)
                row.danger_zone, changed_numbers = data["danger_zone"], True
        if "fever" in data:
            if data["fever"] in (None, ""):
                row.fever, changed_numbers = None, True
            else:
                problem = _check_fever(data["fever"])
                if problem:
                    return Response({"detail": problem}, status=400)
                row.fever, changed_numbers = data["fever"], True
        if "reassess_minutes" in data:
            raw, clean = data["reassess_minutes"], {}
            if not isinstance(raw, dict):
                return Response({"detail": "Recheck gaps must be minutes for each level 1 to 5."}, status=400)
            for key, value in raw.items():
                if str(key) not in ("1", "2", "3", "4", "5"):
                    return Response({"detail": "Recheck gaps are for levels 1 to 5."}, status=400)
                if value in (None, ""):
                    continue
                if not _is_num(value, 1, 1440):
                    return Response({"detail": "Each recheck gap is a number of minutes from 1 to 1440, or blank."}, status=400)
                clean[str(key)] = int(value)
            row.reassess_minutes = clean
        if "suicide_screen_min_age_years" in data:
            value = data["suicide_screen_min_age_years"]
            if value in (None, ""):
                row.suicide_screen_min_age_years = None
            elif _is_num(value, 0, 18):
                row.suicide_screen_min_age_years = int(value)
            else:
                return Response({"detail": "The suicide screen starting age is a number of years from 0 to 18."}, status=400)
        if changed_numbers:
            row.approved_by, row.approved_at = request.user, timezone.now()
        row.save()
        return Response({**service.clinic_settings(org), "defaults": engine.default_settings()})


# ---- reassessment log ------------------------------------------------------------------------------------------------

def _open_visit(patient, request):
    visits = Registration.objects.filter(patient__user=patient, discharge_datetime__isnull=True).order_by("-created_at", "-pk")
    raw = request.query_params.get("visit", "")
    return visits.filter(pk=raw).first() if raw.isdigit() else visits.first()


class TriageReassessmentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        denied = _clinical(request)
        if denied:
            return denied
        patient, err = _patient_for(request, patient_id)
        if err is not None:
            return err
        return Response(service.reassessment_log(patient, _open_visit(patient, request), patient.organization))

    def post(self, request, patient_id):
        denied = _clinical(request)
        if denied:
            return denied
        patient, err = _patient_for(request, patient_id)
        if err is not None:
            return err
        visit = _open_visit(patient, request)
        row, problem = service.record_reassessment(patient, visit, request.user, request.data)
        if problem:
            return Response({"detail": problem}, status=400)
        return Response(service.reassessment_log(patient, visit, patient.organization), status=201)
