"""
Location Manager: Location (hospital or clinic) > Unit > Room > Bed.

* Admins build the tree (Location Manager, next to the Order, Note and Flowsheet builders).
* The care type (Outpatient / Inpatient / Emergency) is set on each unit, so one hospital can
  have an ED, inpatient units and outpatient clinics.
* Registration picks where a visit is; Scheduling picks the clinic or unit for an appointment.
* A bed is occupied while a visit holds it with no discharge time. Admins can also block a bed
  or mark it as being cleaned.
"""

from django.db import IntegrityError, transaction
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Organization, Registration

from .models import Appointment, Bed, Facility, Room, Unit

READ_ROLES = ("doctor", "nurse", "registrar", "receptionist", "admin", "system_admin")
ADMIN_ROLES = ("admin", "system_admin")
MAX_BULK = 200


def _org(request, supplied=None):
    """The clinic a request is about: your own, or (system admins) the one named."""
    user = request.user
    if user.role == "system_admin":
        org_id = supplied or request.query_params.get("org")
        return Organization.objects.filter(pk=org_id).first() if org_id else user.organization
    return user.organization


# --------------------------------------------------------------------------
# occupancy and status
# --------------------------------------------------------------------------

def occupied_beds(org, exclude_registration=None):
    """{bed_id: registration} for every bed currently held by a visit with no discharge time."""
    qs = Registration.objects.filter(
        bed__room__unit__facility__organization=org, bed__isnull=False, discharge_datetime__isnull=True
    ).select_related("patient__user")
    if exclude_registration is not None:
        qs = qs.exclude(pk=exclude_registration)
    return {r.bed_id: r for r in qs}


def bed_status(bed, occupied):
    if not bed.is_active:
        return "inactive"
    if bed.hold:
        return bed.hold  # blocked or cleaning
    return "occupied" if bed.pk in occupied else "available"


def _patient_name(reg):
    user = reg.patient.user
    return f"{user.last_name}, {user.first_name}".strip(", ")


# --------------------------------------------------------------------------
# rules shared with Registration and Scheduling
# --------------------------------------------------------------------------

def check_location(org, *, facility=None, unit=None, room=None, bed=None, registration_pk=None, require_free_bed=True):
    """
    Returns an error message (str) if the chosen place is not usable for this clinic, else None.
    Picks the most specific place given; a bed or room also carries its parents.
    """
    chosen = bed or room or unit or facility
    if chosen is None:
        return None
    if bed is not None:
        unit_obj = bed.room.unit
        facility_obj = unit_obj.facility
        parts = [(bed, "bed"), (bed.room, "room"), (unit_obj, "unit"), (facility_obj, "location")]
    elif room is not None:
        parts = [(room, "room"), (room.unit, "unit"), (room.unit.facility, "location")]
    elif unit is not None:
        parts = [(unit, "unit"), (unit.facility, "location")]
    else:
        parts = [(facility, "location")]
    facility_obj = parts[-1][0]
    if org is not None and facility_obj.organization_id != org.id:
        return "That location belongs to a different clinic."
    for obj, label in parts:
        if not obj.is_active:
            return f"The {label} “{obj.name}” is inactive."
    # the separate pieces must agree with each other
    if room is not None and bed is not None and bed.room_id != room.id:
        return "That bed is not in the room you chose."
    if unit is not None and (room or bed) is not None:
        inner = room or bed.room
        if inner.unit_id != unit.id:
            return "That room is not in the unit you chose."
    if facility is not None and unit is not None and unit.facility_id != facility.id:
        return "That unit is not in the location you chose."
    if bed is not None:
        if bed.hold:
            return f"Bed {bed.name} is {bed.get_hold_display().lower()}."
        if require_free_bed:
            taken = occupied_beds(facility_obj.organization, exclude_registration=registration_pk)
            if bed.pk in taken:
                return f"Bed {bed.name} is already occupied by {_patient_name(taken[bed.pk])}."
    return None


def unit_check(org, unit):
    """Appointments point at a clinic or unit."""
    return check_location(org, unit=unit)


# --------------------------------------------------------------------------
# tree
# --------------------------------------------------------------------------

def build_tree(org, active_only=False):
    occupied = occupied_beds(org)
    facilities = Facility.objects.filter(organization=org)
    if active_only:
        facilities = facilities.filter(is_active=True)
    out = []
    for f in facilities.prefetch_related("units__rooms__beds"):
        units = []
        for u in f.units.all():
            if active_only and not u.is_active:
                continue
            rooms, total, busy = [], 0, 0
            for r in u.rooms.all():
                if active_only and not r.is_active:
                    continue
                beds = []
                for b in r.beds.all():
                    if active_only and not b.is_active:
                        continue
                    status = bed_status(b, occupied)
                    reg = occupied.get(b.pk)
                    beds.append(
                        {
                            "id": b.pk,
                            "name": b.name,
                            "is_active": b.is_active,
                            "hold": b.hold,
                            "hold_reason": b.hold_reason,
                            "status": status,
                            "occupant": _patient_name(reg) if reg else None,
                            "visit_number": reg.visit_number if reg else None,
                            "registration": reg.pk if reg else None,
                            "patient": reg.patient_id if reg else None,
                            "patient_user_id": reg.patient.user_id if reg else None,
                        }
                    )
                    if b.is_active:
                        total += 1
                        busy += 1 if status == "occupied" else 0
                rooms.append({"id": r.pk, "name": r.name, "is_active": r.is_active, "beds": beds})
            units.append(
                {
                    "id": u.pk,
                    "name": u.name,
                    "code": u.code,
                    "care_type": u.care_type,
                    "care_setting": u.care_setting,
                    "is_active": u.is_active,
                    "rooms": rooms,
                    "bed_count": total,
                    "occupied_count": busy,
                }
            )
        out.append(
            {"id": f.pk, "name": f.name, "code": f.code, "kind": f.kind, "is_active": f.is_active, "units": units}
        )
    return out


class LocationTreeView(APIView):
    """The whole tree for the clinic. Any staff may read it (the pickers use it)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in READ_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        org = _org(request)
        if org is None:
            return Response({"organization": None, "can_edit": False, "locations": []})
        active_only = request.query_params.get("active") in ("1", "true", "yes")
        return Response(
            {
                "organization": org.pk,
                "can_edit": request.user.role in ADMIN_ROLES,
                "care_types": [{"value": v, "label": l} for v, l in Unit.CARE_TYPE_CHOICES],
                "locations": build_tree(org, active_only=active_only),
            }
        )


# --------------------------------------------------------------------------
# create / edit / delete
# --------------------------------------------------------------------------

def _clean_name(value, label="Name", limit=120):
    name = str(value or "").strip()
    if not name:
        return None, f"Give the {label.lower()} a name."
    if len(name) > limit:
        return None, f"Keep the name to {limit} characters."
    return name, None


def _code(value):
    return str(value or "").strip()[:20]


class LocationItemView(APIView):
    """
    Create (POST /locations/<kind>/), rename or switch off (PATCH /locations/<kind>/<id>/) and
    delete (DELETE ...) a location, unit, room or bed. Admins only.
    kind: facilities | units | rooms | beds
    """

    permission_classes = [permissions.IsAuthenticated]

    KINDS = {"facilities": Facility, "units": Unit, "rooms": Room, "beds": Bed}
    LABELS = {"facilities": "location", "units": "unit", "rooms": "room", "beds": "bed"}

    def _admin_only(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change locations."}, status=403)
        return None

    @staticmethod
    def _org_of(obj):
        if isinstance(obj, Facility):
            return obj.organization
        if isinstance(obj, Unit):
            return obj.facility.organization
        if isinstance(obj, Room):
            return obj.unit.facility.organization
        return obj.room.unit.facility.organization

    def _mine(self, request, obj):
        """Admins work on their own clinic only; system admins on any."""
        return request.user.role == "system_admin" or self._org_of(obj).pk == getattr(request.user.organization, "pk", None)

    # ---- create
    def post(self, request, kind):
        blocked = self._admin_only(request)
        if blocked:
            return blocked
        if kind not in self.KINDS:
            return Response({"detail": "Unknown kind."}, status=404)
        data = request.data
        try:
            with transaction.atomic():
                return self._create(request, kind, data)
        except IntegrityError:
            return Response({"detail": f"There is already a {self.LABELS[kind]} with that name here."}, status=400)

    def _create(self, request, kind, data):
        if kind == "facilities":
            org = _org(request, data.get("organization"))
            if org is None:
                return Response({"detail": "Choose a clinic."}, status=400)
            name, err = _clean_name(data.get("name"), "location")
            if err:
                return Response({"detail": err}, status=400)
            fkind = data.get("kind", "hospital")
            if fkind not in dict(Facility.KIND_CHOICES):
                return Response({"detail": "Kind must be hospital, clinic or other."}, status=400)
            if Facility.objects.filter(organization=org, name__iexact=name).exists():
                return Response({"detail": "There is already a location with that name."}, status=400)
            obj = Facility.objects.create(organization=org, name=name, code=_code(data.get("code")), kind=fkind)
            return Response({"id": obj.pk}, status=201)

        if kind == "units":
            parent = Facility.objects.filter(pk=data.get("facility")).first()
            if parent is None or not self._mine(request, parent):
                return Response({"detail": "Choose a location for the unit."}, status=400)
            name, err = _clean_name(data.get("name"), "unit")
            if err:
                return Response({"detail": err}, status=400)
            care = data.get("care_type", "outpatient")
            if care not in dict(Unit.CARE_TYPE_CHOICES):
                return Response({"detail": "Type must be outpatient, inpatient or emergency."}, status=400)
            if Unit.objects.filter(facility=parent, name__iexact=name).exists():
                return Response({"detail": "There is already a unit with that name here."}, status=400)
            obj = Unit.objects.create(facility=parent, name=name, code=_code(data.get("code")), care_type=care)
            return Response({"id": obj.pk}, status=201)

        if kind == "rooms":
            parent = Unit.objects.filter(pk=data.get("unit")).select_related("facility").first()
            if parent is None or not self._mine(request, parent.facility):
                return Response({"detail": "Choose a unit for the room."}, status=400)
            names = data.get("names")
            if names is None:
                names = [data.get("name")]
            if not isinstance(names, list) or not names:
                return Response({"detail": "Give the room a name."}, status=400)
            if len(names) > MAX_BULK:
                return Response({"detail": f"Add up to {MAX_BULK} rooms at a time."}, status=400)
            bed_names = data.get("bed_names") or []
            if not isinstance(bed_names, list) or len(bed_names) > 20:
                return Response({"detail": "Add up to 20 beds per room."}, status=400)
            cleaned, seen = [], set()
            for raw in names:
                name, err = _clean_name(raw, "room", 60)
                if err:
                    return Response({"detail": err}, status=400)
                if name.lower() in seen:
                    return Response({"detail": f"Room “{name}” is listed twice."}, status=400)
                seen.add(name.lower())
                cleaned.append(name)
            existing = {n.lower() for n in Room.objects.filter(unit=parent).values_list("name", flat=True)}
            clash = [n for n in cleaned if n.lower() in existing]
            if clash:
                return Response({"detail": f"This unit already has room {', '.join(clash)}."}, status=400)
            bed_clean, seen_b = [], set()
            for raw in bed_names:
                bname, err = _clean_name(raw, "bed", 60)
                if err:
                    return Response({"detail": err}, status=400)
                if bname.lower() in seen_b:
                    return Response({"detail": f"Bed “{bname}” is listed twice."}, status=400)
                seen_b.add(bname.lower())
                bed_clean.append(bname)
            ids = []
            for name in cleaned:
                room = Room.objects.create(unit=parent, name=name)
                ids.append(room.pk)
                for bname in bed_clean:
                    Bed.objects.create(room=room, name=bname)
            return Response({"id": ids[0], "ids": ids}, status=201)

        # beds
        parent = Room.objects.filter(pk=data.get("room")).select_related("unit__facility").first()
        if parent is None or not self._mine(request, parent.unit.facility):
            return Response({"detail": "Choose a room for the bed."}, status=400)
        name, err = _clean_name(data.get("name"), "bed", 60)
        if err:
            return Response({"detail": err}, status=400)
        if Bed.objects.filter(room=parent, name__iexact=name).exists():
            return Response({"detail": "There is already a bed with that name in this room."}, status=400)
        obj = Bed.objects.create(room=parent, name=name)
        return Response({"id": obj.pk}, status=201)

    # ---- edit
    def patch(self, request, kind, pk):
        blocked = self._admin_only(request)
        if blocked:
            return blocked
        model = self.KINDS.get(kind)
        obj = model.objects.filter(pk=pk).first() if model else None
        if obj is None or not self._mine(request, obj):
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        label = self.LABELS[kind]
        if "name" in data:
            name, err = _clean_name(data["name"], label, 60 if kind in ("rooms", "beds") else 120)
            if err:
                return Response({"detail": err}, status=400)
            sibling = self._siblings(obj, kind).exclude(pk=obj.pk).filter(name__iexact=name)
            if sibling.exists():
                return Response({"detail": f"There is already a {label} with that name here."}, status=400)
            obj.name = name
        if "code" in data and hasattr(obj, "code"):
            obj.code = _code(data["code"])
        if kind == "facilities" and "kind" in data:
            if data["kind"] not in dict(Facility.KIND_CHOICES):
                return Response({"detail": "Kind must be hospital, clinic or other."}, status=400)
            obj.kind = data["kind"]
        if kind == "units" and "care_type" in data:
            if data["care_type"] not in dict(Unit.CARE_TYPE_CHOICES):
                return Response({"detail": "Type must be outpatient, inpatient or emergency."}, status=400)
            obj.care_type = data["care_type"]
        if kind == "beds":
            if "hold" in data:
                if data["hold"] not in dict(Bed.HOLD_CHOICES):
                    return Response({"detail": "A bed can be blocked, cleaning, or neither."}, status=400)
                obj.hold = data["hold"]
                if not obj.hold:
                    obj.hold_reason = ""
            if "hold_reason" in data and obj.hold:
                obj.hold_reason = str(data["hold_reason"] or "").strip()[:200]
        if "is_active" in data:
            want = bool(data["is_active"])
            if not want and obj.is_active:
                busy = self._occupied_below(obj, kind)
                if busy:
                    return Response(
                        {"detail": f"{busy} patient{'s are' if busy != 1 else ' is'} still admitted here. Discharge or move them first."},
                        status=400,
                    )
            obj.is_active = want
        if kind == "beds" and obj.hold and "hold" in data:
            if self._occupied_below(obj, kind):
                return Response({"detail": "A patient is in this bed. Move or discharge them before blocking it."}, status=400)
        obj.save()
        return Response({"id": obj.pk})

    # ---- delete
    def delete(self, request, kind, pk):
        blocked = self._admin_only(request)
        if blocked:
            return blocked
        model = self.KINDS.get(kind)
        obj = model.objects.filter(pk=pk).first() if model else None
        if obj is None or not self._mine(request, obj):
            return Response({"detail": "Not found."}, status=404)
        if self._children(obj, kind):
            return Response({"detail": f"This {self.LABELS[kind]} still has things inside it. Remove those first, or switch it off instead."}, status=400)
        if self._used(obj, kind):
            return Response(
                {"detail": f"This {self.LABELS[kind]} has been used for visits or appointments, so it cannot be deleted. Switch it off instead."},
                status=400,
            )
        obj.delete()
        return Response(status=204)

    # ---- helpers
    @staticmethod
    def _siblings(obj, kind):
        if kind == "facilities":
            return Facility.objects.filter(organization=obj.organization)
        if kind == "units":
            return Unit.objects.filter(facility=obj.facility)
        if kind == "rooms":
            return Room.objects.filter(unit=obj.unit)
        return Bed.objects.filter(room=obj.room)

    @staticmethod
    def _children(obj, kind):
        if kind == "facilities":
            return obj.units.exists()
        if kind == "units":
            return obj.rooms.exists()
        if kind == "rooms":
            return obj.beds.exists()
        return False

    @staticmethod
    def _used(obj, kind):
        if kind == "facilities":
            return obj.registrations.exists()
        if kind == "units":
            # Appointment.objects is tenant-scoped and empty outside a request; check the plain manager
            return obj.registrations.exists() or Appointment.all_objects.filter(unit=obj).exists()
        if kind == "rooms":
            return obj.registrations.exists()
        return obj.registrations.exists()

    @staticmethod
    def _occupied_below(obj, kind):
        base = Registration.objects.filter(bed__isnull=False, discharge_datetime__isnull=True)
        field = {"facilities": "bed__room__unit__facility", "units": "bed__room__unit", "rooms": "bed__room", "beds": "bed"}[kind]
        return base.filter(**{field: obj}).count()


# --------------------------------------------------------------------------
# bed hold: block a bed or mark it for cleaning (nursing and front office do this, not just admins)
# --------------------------------------------------------------------------

HOLD_ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")


class BedHoldView(APIView):
    """POST {hold: "" | "blocked" | "cleaning", hold_reason?}"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in HOLD_ROLES:
            return Response({"detail": "You do not have permission to change a bed's status."}, status=403)
        org = _org(request, request.data.get("organization"))
        bed = Bed.objects.filter(pk=pk, room__unit__facility__organization=org).select_related("room__unit__facility").first() if org else None
        if bed is None:
            return Response({"detail": "Bed not found."}, status=404)
        hold = request.data.get("hold", "")
        if hold not in dict(Bed.HOLD_CHOICES):
            return Response({"detail": "A bed can be blocked, cleaning, or neither."}, status=400)
        if hold and bed.pk in occupied_beds(org):
            return Response({"detail": "A patient is in this bed. Move or discharge them before blocking it."}, status=400)
        bed.hold = hold
        bed.hold_reason = "" if not hold else str(request.data.get("hold_reason") or "").strip()[:200]
        bed.save()
        return Response({"id": bed.pk, "hold": bed.hold, "hold_reason": bed.hold_reason})
