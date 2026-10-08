"""
Admit, transfer and discharge a visit.

A visit (Registration) holds a bed from the moment it is placed there until it is discharged.
Admitting puts an inpatient in an inpatient unit (their care setting becomes Acute Care, so
they show on the Acute Care list); a transfer moves them to another place; a discharge frees the
bed and the patient goes back to the Ambulatory list. The care setting itself always follows the
unit (see Registration.save), so these views only choose the place.
"""
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.locations import check_location
from appointments.models import Bed, Facility, Room, Unit

from .models import CustomUser, Patient, Registration
from .serializers import RegistrationSerializer

ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")


def _org(request):
    user = request.user
    if user.role == "system_admin":
        org_id = request.data.get("organization") or request.query_params.get("org")
        if org_id:
            from .models import Organization

            return Organization.objects.filter(pk=org_id).first()
    return user.organization


def _bad(message, code=400):
    return Response({"detail": message}, status=code)


def latest_visit(patient):
    """The visit that says where the patient is now: an open inpatient visit, else an open ED visit,
    else the most recent one. (A newer blank visit must not hide a patient who is still in a bed.)"""
    visits = patient.registrations.order_by("-created_at", "-pk")
    for setting in ("acute", "emergency"):
        open_visit = visits.filter(care_setting=setting, discharge_datetime__isnull=True).first()
        if open_visit is not None:
            return open_visit
    return visits.first()


def is_open(visit):
    return visit is not None and visit.discharge_datetime is None


def current_setting(visit):
    """The care setting a patient is in right now: a discharged visit is back to Ambulatory."""
    if visit is None or visit.discharge_datetime is not None:
        return "ambulatory"
    return visit.care_setting or "ambulatory"


def visit_summary(patient):
    """What the patient list shows about where the patient is now."""
    visit = latest_visit(patient)
    if visit is None:
        return None
    return {
        "id": visit.pk,
        "visit_number": visit.visit_number,
        "care_setting": current_setting(visit),
        "admission_type": visit.admission_type,
        "unit": visit.unit_id,
        "unit_name": visit.unit.name if visit.unit_id else "",
        "room_name": visit.room.name if visit.room_id else "",
        "bed_name": visit.bed.name if visit.bed_id else "",
        "location": visit.location_path() or visit.assigned_location,
        "arrival_time": visit.arrival_time,
        "discharge_datetime": visit.discharge_datetime,
        "attending_provider": visit.attending_provider_id,
        "attending_provider_name": (
            f"Dr. {visit.attending_provider.first_name} {visit.attending_provider.last_name}".strip()
            if visit.attending_provider_id
            else ""
        ),
    }


def _place(request, org):
    """Read unit/room/bed from the request. Returns (unit, room, bed, error_response)."""
    data = request.data
    scope = {"facility__organization": org} if org else {}

    def one(model, key, **flt):
        raw = data.get(key)
        if raw in (None, ""):
            return None, None
        obj = model.objects.filter(pk=raw, **flt).first()
        if obj is None:
            return None, _bad(f"That {key} was not found.")
        return obj, None

    unit, err = one(Unit, "unit", **scope)
    if err:
        return None, None, None, err
    room, err = one(Room, "room", **({"unit__facility__organization": org} if org else {}))
    if err:
        return None, None, None, err
    bed, err = one(Bed, "bed", **({"room__unit__facility__organization": org} if org else {}))
    if err:
        return None, None, None, err
    # a bed or room carries its parents; if only they are given, take the unit from them
    if bed is not None and room is None:
        room = bed.room
    if room is not None and unit is None:
        unit = room.unit
    return unit, room, bed, None


def _move(visit, org, unit, room, bed):
    """Validate and place the visit. Returns an error Response or None."""
    message = check_location(org, unit=unit, room=room, bed=bed, registration_pk=visit.pk)
    if message:
        return _bad(message)
    visit.unit, visit.room, visit.bed = unit, room, bed
    visit.facility = None  # filled from the unit in save()
    return None


class AdmitView(APIView):
    """
    POST {patient, unit, room?, bed?, attending_provider?, registration?, reason_for_visit?}

    Admits to an inpatient unit. Pass `registration` to admit an existing visit (an ED patient
    being admitted, say); otherwise a new visit is started for the patient.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role not in ROLES:
            return _bad("You do not have permission to admit patients.", 403)
        org = _org(request)
        if org is None:
            return _bad("No clinic is selected.")
        patient = Patient.objects.filter(pk=request.data.get("patient"), user__organization=org).first()
        if patient is None:
            return _bad("Patient not found.", 404)

        unit, room, bed, err = _place(request, org)
        if err:
            return err
        if unit is None:
            return _bad("Choose the unit to admit to.")
        if unit.care_type != "inpatient":
            return _bad(f"{unit.name} is not an inpatient unit. Use a transfer to move a patient there.")

        attending = None
        raw_attending = request.data.get("attending_provider")
        if raw_attending not in (None, ""):
            attending = CustomUser.objects.filter(pk=raw_attending, role="doctor", organization=org).first()
            if attending is None:
                return _bad("That attending provider was not found.")

        open_visits = patient.registrations.filter(discharge_datetime__isnull=True, care_setting="acute")
        reg_id = request.data.get("registration")
        if reg_id not in (None, ""):
            visit = patient.registrations.filter(pk=reg_id).first()
            if visit is None:
                return _bad("That visit was not found for this patient.", 404)
            if visit.discharge_datetime is not None:
                return _bad("That visit has already been discharged. Start a new admission instead.")
            if visit.care_setting == "acute" and visit.bed_id and visit.unit_id:
                return _bad("This patient is already admitted. Use a transfer to move them.")
        else:
            if open_visits.exists():
                return _bad("This patient is already admitted. Use a transfer to move them.")
            visit = Registration(
                patient=patient,
                organization=org,
                admission_type="direct",
                registered_by=request.user,
                arrival_time=timezone.now(),
                reason_for_visit=(request.data.get("reason_for_visit") or "")[:5000],
            )

        error = _move(visit, org, unit, room, bed)
        if error:
            return error
        if attending is not None:
            visit.attending_provider = attending
        if visit.arrival_time is None:
            visit.arrival_time = timezone.now()
        visit.save()
        return Response(RegistrationSerializer(visit).data, status=201 if not reg_id else 200)


def _visit_for(request, pk):
    org = _org(request)
    if request.user.role not in ROLES or org is None:
        return None, None, _bad("You do not have permission for this.", 403)
    visit = Registration.objects.filter(pk=pk, patient__user__organization=org).first()
    if visit is None:
        return None, None, _bad("Visit not found.", 404)
    return visit, org, None


class TransferView(APIView):
    """POST {unit, room?, bed?}: move an admitted visit to another unit, room or bed."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        visit, org, err = _visit_for(request, pk)
        if err:
            return err
        if visit.discharge_datetime is not None:
            return _bad("This visit has been discharged, so it cannot be moved.")
        unit, room, bed, err = _place(request, org)
        if err:
            return err
        if unit is None:
            return _bad("Choose where to move the patient.")
        error = _move(visit, org, unit, room, bed)
        if error:
            return error
        visit.save()
        return Response(RegistrationSerializer(visit).data)


class AttendingView(APIView):
    """POST {attending_provider}: set (or clear, with null) the attending doctor of an open visit."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        visit, org, err = _visit_for(request, pk)
        if err:
            return err
        if visit.discharge_datetime is not None:
            return _bad("This visit has been discharged, so the attending cannot be changed.")
        raw = request.data.get("attending_provider")
        attending = None
        if raw not in (None, ""):
            attending = CustomUser.objects.filter(pk=raw, role="doctor", organization=org).first()
            if attending is None:
                return _bad("That attending provider was not found.")
        visit.attending_provider = attending
        visit.save()
        # the visit's chart appointment follows the attending, so orders and notes stay with them
        if visit.appointment_id:
            visit.appointment.provider = attending
            visit.appointment.save(update_fields=["provider"])
        return Response(RegistrationSerializer(visit).data)


class DischargeView(APIView):
    """POST {discharge_datetime?, bed_needs_cleaning?}: end the visit and free the bed."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        visit, org, err = _visit_for(request, pk)
        if err:
            return err
        if visit.discharge_datetime is not None:
            return _bad("This visit has already been discharged.")
        when = timezone.now()
        raw = request.data.get("discharge_datetime")
        if raw:
            when = parse_datetime(str(raw))
            if when is None:
                return _bad("That discharge time is not valid.")
            if timezone.is_naive(when):
                when = timezone.make_aware(when)
            if when > timezone.now() + timezone.timedelta(minutes=5):
                return _bad("The discharge time cannot be in the future.")
        if visit.arrival_time and when < visit.arrival_time:
            return _bad("The discharge time is before the patient arrived.")
        visit.discharge_datetime = when
        visit.save()
        # housekeeping: the bed they leave can be marked for cleaning in the same step
        if request.data.get("bed_needs_cleaning") in (True, "true", "1", 1) and visit.bed_id:
            bed = visit.bed
            if not bed.hold and bed.is_active:
                bed.hold = "cleaning"
                bed.save(update_fields=["hold"])
        return Response(RegistrationSerializer(visit).data)
