"""
Growth chart API.

    GET /api/growth-charts/patient/<id>/?corrected=1   the chart set for the patient's age, with curves and plotted points

Needs the flowsheets.chart right (the measurements come from the flowsheets) and a patient in the staff member's own
organization. Read only: measurements are entered in the flowsheet, birth details in Patient Info.
"""
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.rights import user_has_right

from . import growth_engine as engine
from . import growth_service as service
from . import immunization_service as vaccine_service
from .patient_header import _patient_for

PROBLEM_TEXT = {
    "no_dob": "This patient has no date of birth on file, so a growth chart cannot be drawn.",
    "future_dob": "The date of birth is in the future. Correct it in the registration.",
    "no_sex": "Sex is not recorded on the registration. Growth charts are different for boys and girls, so it is needed.",
    "too_old": "Growth charts cover birth to 20 years.",
}


def _name(user):
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    return f"{last}, {first}" if first and last else (first or last or user.username)


class GrowthChartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        if not user_has_right(request.user, "flowsheets.chart"):
            return Response({"detail": "Not allowed."}, status=403)
        patient, err = _patient_for(request, patient_id)
        if err is not None:
            return err
        corrected = str(request.query_params.get("corrected", "1")).lower() not in ("0", "false", "no")
        dob, sex = vaccine_service.patient_facts(patient)
        profile = getattr(patient, "patient_profile", None)
        weeks = getattr(profile, "gestational_age_weeks", None)
        days = getattr(profile, "gestational_age_days", None)
        birth_g = getattr(profile, "birth_weight_g", None)
        as_of = timezone.localdate()
        body = {
            "patient": {"id": patient.pk, "name": _name(patient), "date_of_birth": dob.isoformat() if dob else None, "sex": sex,
                        "age_months": None, "gestational_age_weeks": weeks, "gestational_age_days": days, "birth_weight_g": birth_g},
            "as_of": as_of.isoformat(), "problem": "", "problem_text": "", "info": None, "charts": [], "skipped": 0,
        }
        problem = ""
        if dob is None:
            problem = "no_dob"
        elif dob > as_of:
            problem = "future_dob"
        else:
            age_days = (as_of - dob).days
            body["patient"]["age_months"] = round(engine.months(age_days), 1)
            if engine.months(age_days) > engine.END_MONTHS + 0.5:
                problem = "too_old"
            elif not sex:
                problem = "no_sex"
        if problem:
            body["problem"], body["problem_text"] = problem, PROBLEM_TEXT[problem]
            return Response(body)
        rows, skipped = service.measurements_for(patient)
        info, charts = engine.build_charts(sex, dob, as_of, rows, weeks, days, corrected)
        info["correction_weeks"] = round(info["correction_days"] / 7, 1)
        info["gestational_age_known"] = weeks not in (None, "")
        body.update({"info": info, "charts": charts, "skipped": skipped, "corrected_requested": corrected})
        return Response(body)
