"""
Intake & Output endpoints.

    POST /api/intake-output/summary/   {patient, columns, data}  -> totals, per-column sums, alerts
    GET  /api/intake-output/settings/                           -> the clinic's alert limits
    PUT  /api/intake-output/settings/  (admin)                  -> change them

The summary works on what the screen sends (so totals update before the nurse saves), reads only the
patient's weight from the chart, and never writes anything.
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.rights import user_has_right

from . import intake_output as io
from .clinical_summary import _vitals
from .models import IntakeOutputSettings
from .patient_header import _patient_for

SETTING_FIELDS = ("shift_starts", "low_urine_ml_kg_h", "no_urine_hours", "low_urine_24h_ml", "positive_balance_24h_ml")
MAX_COLUMNS = 400


def settings_for(user):
    row = IntakeOutputSettings.objects.filter(organization_id=user.organization_id).first() if user.organization_id else None
    if row is None:
        return dict(io.DEFAULTS)
    values = {name: getattr(row, name) for name in SETTING_FIELDS}
    values["shift_starts"] = values["shift_starts"] or io.DEFAULTS["shift_starts"]
    return values


def weight_kg(patient):
    latest = (_vitals(patient).get("latest") or {}).get("weight")
    return round(latest["value"] / io.LB_PER_KG, 1) if latest and latest.get("value") else None


def clean_settings(body):
    """(values, errors) from a PUT body. A blank limit switches that alert off."""
    values, errors = {}, {}
    starts = body.get("shift_starts", io.DEFAULTS["shift_starts"])
    if not isinstance(starts, list) or not 1 <= len(starts) <= 4 or any(io.minutes_of(s) is None for s in starts):
        errors["shift_starts"] = "Give one to four times as HH:MM, for example 07:00."
    else:
        values["shift_starts"] = sorted({f"{io.minutes_of(s) // 60:02d}:{io.minutes_of(s) % 60:02d}" for s in starts})
    for name, low, high in (("low_urine_ml_kg_h", 0.1, 5), ("no_urine_hours", 1, 24),
                            ("low_urine_24h_ml", 50, 5000), ("positive_balance_24h_ml", 100, 20000)):
        raw = body.get(name)
        if raw in (None, ""):
            values[name] = None
            continue
        number = io.number(raw)
        if number is None or not low <= number <= high:
            errors[name] = f"Enter a number from {low} to {high}, or leave blank to turn this alert off."
        else:
            values[name] = number if name == "low_urine_ml_kg_h" else int(number)
    return values, errors


class IntakeOutputSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not user_has_right(request.user, "flowsheets.chart"):
            return Response({"detail": "Not allowed."}, status=403)
        patient, error = _patient_for(request, request.data.get("patient"))
        if error:
            return error
        columns, data = request.data.get("columns"), request.data.get("data")
        if not isinstance(columns, list) or not isinstance(data, dict) or len(columns) > MAX_COLUMNS:
            return Response({"detail": "columns (a list) and data (an object) are required."}, status=400)
        columns = [c for c in columns if isinstance(c, dict) and c.get("id")]
        body = io.summarize(columns, data, timezone.localtime(), settings_for(request.user), weight_kg(patient))
        body["settings"] = settings_for(request.user)
        return Response(body)


class IntakeOutputSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not user_has_right(request.user, "flowsheets.chart"):
            return Response({"detail": "Not allowed."}, status=403)
        return Response(settings_for(request.user))

    def put(self, request):
        if request.user.role not in ("admin", "system_admin") or not request.user.organization_id:
            return Response({"detail": "Only a clinic administrator can change these."}, status=403)
        values, errors = clean_settings(request.data if isinstance(request.data, dict) else {})
        if errors:
            return Response(errors, status=400)
        IntakeOutputSettings.objects.update_or_create(organization_id=request.user.organization_id, defaults=values)
        return Response(settings_for(request.user))
