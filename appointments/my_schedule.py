"""
My Schedule: the patients who have an appointment on a given day, as rows for the Patients page.

* A doctor sees only appointments where they are the provider.
* Admins see every provider's appointments in their clinic, and system admins see every
  clinic's. Nurses and registrars see their clinic's, as they do in the Patient List.
  Anyone who sees more than their own can narrow to one provider with `provider`.
* The day is sent as `start` and `end` (ISO times, so the browser's own day is used), or as
  `date` (YYYY-MM-DD in the server's time zone).
* Cancelled and rescheduled appointments are left out, and so are the chart records the
  system makes for a visit (they are not appointments anyone booked).
"""

from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Patient
from users.serializers import PatientSerializer

from .models import Appointment

ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")
HIDDEN_STATUSES = ("cancelled", "rescheduled")
# Titles the system gives the chart record of a visit ("ED visit VN-000123", "Visit VN-000124")
CHART_RECORD_TITLE = r"^(ED visit|Visit)( VN-[0-9]+)?$"
MAX_ROWS = 300


def _window(request):
    """The [start, end) moment range being asked for, or None when it cannot be read."""
    start = parse_datetime(request.query_params.get("start") or "")
    end = parse_datetime(request.query_params.get("end") or "")
    if start and end:
        if timezone.is_naive(start):
            start = timezone.make_aware(start)
        if timezone.is_naive(end):
            end = timezone.make_aware(end)
        # never more than a week, so this stays a schedule and not a data export
        if end > start and end - start <= timedelta(days=7):
            return start, end
        return None
    day = parse_date(request.query_params.get("date") or "") or timezone.localdate()
    start = timezone.make_aware(datetime.combine(day, time.min))
    return start, start + timedelta(days=1)


class MyScheduleView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role not in ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        window = _window(request)
        if window is None:
            return Response({"detail": "Give a start and end within one week, or a date."}, status=400)
        start, end = window

        # Filtered to the person's own clinic explicitly (system admins see every clinic).
        queryset = Appointment.all_objects.all()
        if user.role != "system_admin":
            queryset = queryset.filter(organization=user.organization)
        queryset = (
            queryset.filter(appointment_datetime__gte=start, appointment_datetime__lt=end)
            .exclude(status__in=HIDDEN_STATUSES)
            .exclude(Q(registration__isnull=False) & Q(title__regex=CHART_RECORD_TITLE))
            .select_related("provider", "unit", "patient")
            .distinct()
        )

        if user.role == "doctor":
            queryset = queryset.filter(provider=user)  # a doctor's schedule is their own
        else:
            provider = request.query_params.get("provider")
            if provider:
                if not str(provider).isdigit():
                    return Response({"detail": "provider must be a user id."}, status=400)
                queryset = queryset.filter(provider_id=int(provider))

        search = (request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(patient__first_name__icontains=search)
                | Q(patient__last_name__icontains=search)
                | Q(patient__patient_profile__mrn__icontains=search)
                | Q(title__icontains=search)
            )

        appointments = list(queryset.order_by("appointment_datetime", "pk")[: MAX_ROWS + 1])
        truncated = len(appointments) > MAX_ROWS
        appointments = appointments[:MAX_ROWS]

        profiles = {
            p.user_id: p
            for p in Patient.objects.select_related("user", "user__provider", "organization").filter(
                user_id__in={a.patient_id for a in appointments}
            )
        }
        results = []
        for appt in appointments:
            profile = profiles.get(appt.patient_id)
            if profile is None:
                continue  # a user with no patient profile has no chart to open
            patient = PatientSerializer(profile).data
            patient = dict(patient, full_name=f"{profile.user.first_name} {profile.user.last_name}".strip())
            results.append(
                {
                    "appointment": {
                        "id": appt.pk,
                        "start": appt.appointment_datetime,
                        "end": appt.appointment_datetime + timedelta(minutes=appt.duration_minutes or 0),
                        "duration_minutes": appt.duration_minutes,
                        "title": appt.title,
                        "description": appt.description,
                        "status": appt.status,
                        "arrived": appt.arrived,
                        "no_show": appt.no_show,
                        "unit_name": appt.unit.name if appt.unit else "",
                        "provider_id": appt.provider_id,
                        "provider_name": f"{appt.provider.first_name} {appt.provider.last_name}".strip() if appt.provider else "",
                    },
                    "patient": patient,
                }
            )
        return Response({"start": start, "end": end, "count": len(results), "truncated": truncated, "results": results})
