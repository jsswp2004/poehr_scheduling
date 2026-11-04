"""Surgery API (mounted at /api/surgery/): rooms, the Case List, one case, its status, history and the Day Planner."""
from datetime import timedelta

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import permissions, status as http
from django.http import FileResponse
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import Facility, Room as LocationRoom
from staffing.org_scope import acting_org
from users.facility_scope import assigned_facility_ids, limit_to_facilities

from users.models import CustomUser, Registration

from .models import (
    ANESTHESIA_TYPES,
    CLOSED_EDITABLE,
    DELAY_REASONS,
    PARTICIPANT_ROLE_LABELS,
    PARTICIPANT_ROLES,
    PHYSICAL_STATUSES,
    STATUS_FLOW,
    STATUS_LABELS,
    USAGE_CATEGORIES,
    CaseCard,
    CaseCharge,
    CaseParticipant,
    CaseProcedure,
    CaseUsageItem,
    ChargePolicy,
    ChargePrice,
    CaseDocument,
    DOCUMENT_CATEGORIES,
    DOCUMENT_TYPES,
    PreferenceCard,
    PreferenceCardItem,
    SurgeryCase,
    SurgeryRoom,
)
from .serializers import (
    CardWriteSerializer,
    DocumentUploadSerializer,
    CaseWriteSerializer,
    ChargeWriteSerializer,
    ParticipantWriteSerializer,
    PolicyWriteSerializer,
    PriceWriteSerializer,
    UsageWriteSerializer,
)
from .services import (
    TransitionError,
    build_planner,
    card_row,
    case_card_row,
    case_row,
    room_row,
    surgical_unit,
    charge_row,
    charge_status,
    generate_charges,
    code_key,
    policy_row,
    price_for,
    price_row,
    day_bounds,
    document_row,
    log,
    participant_row,
    staff_title,
    usage_row,
    overlap_warnings,
    person_name,
    record,
    snapshot,
    status_counts_from_list,
    transition,
    with_related,
)

ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")
ROOM_ADMIN_ROLES = ("admin", "system_admin")


class SurgeryAccess(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "role", "") in ROLES)


def _bad(message, code=http.HTTP_400_BAD_REQUEST, **extra):
    return Response({"detail": message, **extra}, status=code)


class SurgeryView(APIView):
    permission_classes = [SurgeryAccess]

    def org(self):
        return acting_org(self.request)

    def facilities(self):
        """Facilities this person may use: their organization's, narrowed to their assignment."""
        qs = Facility.objects.filter(organization=self.org(), is_active=True)
        return limit_to_facilities(qs, self.request.user, "pk")

    def cases(self):
        qs = SurgeryCase.objects.filter(organization=self.org())
        return limit_to_facilities(qs, self.request.user, "facility")

    def get_case(self, pk):
        return with_related(self.cases()).filter(pk=pk).first()

    def parse_day(self, raw):
        if not raw:
            return timezone.localdate()
        return parse_date(raw)

    def writer(self, instance=None, data=None, partial=False):
        return CaseWriteSerializer(
            instance, data=data, partial=partial, org=self.org(),
            allowed_facilities=assigned_facility_ids(self.request.user),
        )


class RoomList(SurgeryView):
    def get(self, request):
        rooms = SurgeryRoom.objects.filter(facility__in=self.facilities()).select_related("facility", "location_room__unit")
        if request.query_params.get("facility"):
            rooms = rooms.filter(facility_id=request.query_params["facility"])
        if request.query_params.get("all") != "1":
            rooms = rooms.filter(is_active=True)
        return Response([room_row(r) for r in rooms])

    def post(self, request):
        """Add an operating room: link a Location Manager room (`location_room`), or give a `facility` and
        `name` and the room is built in that facility's operating-room unit."""
        if request.user.role not in ROOM_ADMIN_ROLES:
            return _bad("Only an administrator can add rooms.", http.HTTP_403_FORBIDDEN)
        linked_id = request.data.get("location_room")
        loc = None
        if linked_id not in (None, ""):
            loc = LocationRoom.objects.filter(pk=linked_id, unit__facility__in=self.facilities()).select_related("unit__facility").first()
            if loc is None:
                return _bad("Pick a room from Location Manager.")
            if not loc.unit.is_surgical:
                return _bad("That room is not in an operating-room unit.")
            if not (loc.is_active and loc.unit.is_active):
                return _bad("That room is switched off in Location Manager.")
            if getattr(loc, "surgery_room", None) is not None:
                return _bad(f"{loc.name} is already an operating room.", http.HTTP_409_CONFLICT)
            facility, name = loc.unit.facility, loc.name
        else:
            facility = self.facilities().filter(pk=request.data.get("facility")).first()
            name = str(request.data.get("name", "")).strip()
            if facility is None:
                return _bad("Pick a facility.")
            if not name:
                return _bad("Room name is required.")
            if len(name) > 60:
                return _bad("Room name can be up to 60 characters.")
        if SurgeryRoom.objects.filter(facility=facility, name__iexact=name).exists():
            return _bad(f"{name} already exists at {facility.name}.", http.HTTP_409_CONFLICT)
        if request.data.get("sort_order") not in (None, ""):
            order = int(request.data["sort_order"])
        else:  # a new room goes to the bottom of the planner
            order = (SurgeryRoom.objects.filter(facility=facility).aggregate(m=Max("sort_order"))["m"] or 0) + 1
        with transaction.atomic():
            if loc is None:  # build it in Location Manager, in the facility's operating-room unit
                unit = surgical_unit(facility)
                loc = LocationRoom.objects.filter(unit=unit, name__iexact=name).first()
                if loc is not None and getattr(loc, "surgery_room", None) is not None:
                    return _bad(f"{name} already exists at {facility.name}.", http.HTTP_409_CONFLICT)
                if loc is None:
                    loc = LocationRoom.objects.create(unit=unit, name=name)
            room = SurgeryRoom.objects.create(
                facility=facility, name=loc.name, sort_order=order, is_active=loc.is_active, location_room=loc
            )
        return Response(room_row(room), status=http.HTTP_201_CREATED)


class RoomOptions(SurgeryView):
    """Location Manager rooms an operating room can still be built on: active rooms in operating-room units."""

    def get(self, request):
        qs = LocationRoom.objects.filter(
            unit__facility__in=self.facilities(), unit__is_surgical=True, unit__is_active=True,
            is_active=True, surgery_room__isnull=True,
        ).select_related("unit__facility")
        if request.query_params.get("facility"):
            qs = qs.filter(unit__facility_id=request.query_params["facility"])
        return Response([
            {"id": r.pk, "name": r.name, "unit": r.unit.name, "facility": r.unit.facility_id,
             "path": f"{r.unit.facility.name} › {r.unit.name} › {r.name}"}
            for r in qs.order_by("unit__facility__name", "unit__name", "name")
        ])


class RoomDetail(SurgeryView):
    def patch(self, request, pk):
        if request.user.role not in ROOM_ADMIN_ROLES:
            return _bad("Only an administrator can change rooms.", http.HTTP_403_FORBIDDEN)
        room = SurgeryRoom.objects.filter(pk=pk, facility__in=self.facilities()).select_related("facility", "location_room__unit").first()
        if room is None:
            return _bad("Room not found.", http.HTTP_404_NOT_FOUND)
        loc = room.location_room  # the Location Manager room: renames and on/off are written to it too
        if "name" in request.data:
            name = str(request.data["name"]).strip()
            if not name:
                return _bad("Room name is required.")
            if len(name) > 60:
                return _bad("Room name can be up to 60 characters.")
            if SurgeryRoom.objects.filter(facility=room.facility, name__iexact=name).exclude(pk=room.pk).exists():
                return _bad(f"{name} already exists at {room.facility.name}.", http.HTTP_409_CONFLICT)
            if loc is not None and LocationRoom.objects.filter(unit=loc.unit, name__iexact=name).exclude(pk=loc.pk).exists():
                return _bad(f"{name} already exists in {loc.unit.name}.", http.HTTP_409_CONFLICT)
            room.name = name
        if "sort_order" in request.data:
            room.sort_order = int(request.data["sort_order"] or 0)
        if "is_active" in request.data:
            room.is_active = bool(request.data["is_active"])
        with transaction.atomic():
            room.save()
            if loc is not None:
                loc.name, loc.is_active = room.name, room.is_active
                loc.save(update_fields=["name", "is_active"])
        return Response(room_row(room))


class CaseList(SurgeryView):
    def get(self, request):
        q = request.query_params
        day = self.parse_day(q.get("date"))
        day_to = self.parse_day(q.get("date_to")) if q.get("date_to") else day
        if day is None or day_to is None:
            return _bad("Dates must look like 2026-11-03.")
        start, _ = day_bounds(day)
        _, end = day_bounds(day_to)
        qs = with_related(self.cases()).filter(scheduled_start__gte=start, scheduled_start__lt=end)
        if q.get("facility"):
            qs = qs.filter(facility_id=q["facility"])
        if q.get("status"):
            qs = qs.filter(status__in=[s for s in q["status"].split(",") if s])
        if q.get("room"):
            qs = qs.filter(room_id=q["room"])
        if q.get("surgeon"):
            qs = qs.filter(surgeon_id=q["surgeon"])
        if q.get("service"):
            qs = qs.filter(service__iexact=q["service"])
        if q.get("case_type"):
            qs = qs.filter(case_type=q["case_type"])
        if q.get("q"):
            term = q["q"].strip()
            cond = (
                Q(patient__user__last_name__icontains=term) | Q(patient__user__first_name__icontains=term)
                | Q(patient__mrn__icontains=term) | Q(procedures__name__icontains=term)
            )
            if term.isdigit():
                cond |= Q(case_number=int(term))
            qs = qs.filter(cond).distinct()
        rows = list(qs)
        return Response({
            "date": day.isoformat(),
            "date_to": day_to.isoformat(),
            "count": len(rows),
            "results": [case_row(c) for c in rows],
            "legend": status_counts_from_list(rows),
        })

    @transaction.atomic
    def post(self, request):
        if self.org() is None:
            return _bad("No organization.")
        ser = self.writer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        procedures = data.pop("procedures", [])
        case = SurgeryCase.objects.create(organization=self.org(), created_by=request.user, **data)
        self.replace_procedures(case, procedures)
        record(case, request.user, "created", {}, snapshot(case))
        case = self.get_case(case.pk)
        return Response({**case_row(case), "warnings": overlap_warnings(case)}, status=http.HTTP_201_CREATED)

    @staticmethod
    def replace_procedures(case, procedures):
        case.procedures.all().delete()
        has_primary = any(p.get("is_primary") for p in procedures)
        for i, p in enumerate(procedures):
            CaseProcedure.objects.create(
                case=case, name=p["name"], laterality=p.get("laterality", ""), cpt_code=p.get("cpt_code", ""),
                is_primary=p.get("is_primary", False) or (not has_primary and i == 0), sort_order=i,
            )


class CaseDetail(SurgeryView):
    def get(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        return Response(case_row(case, detail=True))

    @transaction.atomic
    def patch(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        ser = self.writer(case, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        if case.is_closed and set(data) - set(CLOSED_EDITABLE):
            return _bad(f"A case that is {STATUS_LABELS[case.status]} is closed; only the comments and notes can change.",
                        http.HTTP_409_CONFLICT)
        procedures = data.pop("procedures", None)
        before = snapshot(case)
        for field, value in data.items():
            setattr(case, field, value)
        case.save()
        if procedures is not None:
            CaseList.replace_procedures(case, procedures)
            before["procedures"] = "changed"
        after = snapshot(case)
        if procedures is not None:
            after["procedures"] = "; ".join(p["name"] for p in procedures)
            before["procedures"] = ""
        record(case, request.user, "updated", before, after)
        case = self.get_case(case.pk)
        return Response({**case_row(case, detail=True), "warnings": overlap_warnings(case)})


class CaseStatus(SurgeryView):
    def post(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        try:
            transition(case, str(request.data.get("status", "")), request.user, str(request.data.get("reason", "")))
        except TransitionError as exc:
            unknown = str(exc).startswith("Unknown")
            return _bad(str(exc), http.HTTP_400_BAD_REQUEST if unknown else http.HTTP_409_CONFLICT,
                        allowed=list(STATUS_FLOW[case.status]))
        return Response(case_row(self.get_case(pk), detail=True))


class CaseHistoryView(SurgeryView):
    def get(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        return Response([
            {
                "id": h.pk,
                "action": h.action,
                "user": person_name(h.user),
                "at": timezone.localtime(h.created_at).isoformat(timespec="seconds"),
                "changes": [{"field": k, "previous": v[0], "new": v[1]} for k, v in h.changes.items()],
            }
            for h in case.history.select_related("user")
        ])


class Planner(SurgeryView):
    def get(self, request):
        day = self.parse_day(request.query_params.get("date"))
        if day is None:
            return _bad("Date must look like 2026-11-03.")
        facilities = list(self.facilities())
        wanted = request.query_params.get("facility")
        facility = next((f for f in facilities if str(f.pk) == str(wanted)), None) if wanted else None
        if facility is None and facilities:
            # default to the first facility that has operating rooms
            with_rooms = set(SurgeryRoom.objects.filter(facility__in=facilities, is_active=True).values_list("facility_id", flat=True))
            facility = next((f for f in facilities if f.pk in with_rooms), facilities[0])
        if facility is None:
            return _bad("No facility available.", http.HTTP_404_NOT_FOUND)
        start, end = day_bounds(day)
        cases = with_related(self.cases()).filter(facility=facility, scheduled_start__gte=start, scheduled_start__lt=end)
        rooms = SurgeryRoom.objects.filter(facility=facility, is_active=True)
        payload = build_planner(cases, rooms, day)
        payload["facilities"] = [{"id": f.pk, "name": f.name} for f in facilities]
        payload["facility"] = facility.pk
        return Response(payload)


class StatusCounts(SurgeryView):
    def get(self, request):
        day = self.parse_day(request.query_params.get("date"))
        if day is None:
            return _bad("Date must look like 2026-11-03.")
        start, end = day_bounds(day)
        qs = self.cases().filter(scheduled_start__gte=start, scheduled_start__lt=end)
        if request.query_params.get("facility"):
            qs = qs.filter(facility_id=request.query_params["facility"])
        return Response({"date": day.isoformat(), "legend": status_counts_from_list(qs)})


class Lookups(SurgeryView):
    """Pick-lists for the case screens, plus who is asking (for the Add Me button)."""

    def get(self, request):
        user = request.user
        return Response({
            "delay_reasons": DELAY_REASONS,
            "physical_statuses": PHYSICAL_STATUSES,
            "anesthesia_types": ANESTHESIA_TYPES,
            "document_categories": [{"value": v, "label": l} for v, l in DOCUMENT_CATEGORIES],
            "usage_categories": [{"value": v, "label": l} for v, l in USAGE_CATEGORIES],
            "participant_roles": [{"value": v, "label": label} for v, label in PARTICIPANT_ROLES],
            "me": {"id": user.pk, "name": person_name(user), "title": staff_title(user)},
        })


class StaffSearch(SurgeryView):
    """People who can be added to a case: the organization's staff, narrowed by name."""

    def get(self, request):
        qs = CustomUser.objects.filter(organization=self.org(), is_active=True).exclude(role__in=["patient", "staff"])
        term = request.query_params.get("q", "").strip()
        for word in term.split():
            qs = qs.filter(Q(last_name__icontains=word) | Q(first_name__icontains=word))
        if request.query_params.get("role"):
            qs = qs.filter(role=request.query_params["role"])
        qs = qs.order_by("last_name", "first_name")[:25]
        return Response([{"id": u.pk, "name": person_name(u), "title": staff_title(u), "role": u.role} for u in qs])


class CaseParticipants(SurgeryView):
    def _case_or_404(self, pk):
        case = self.get_case(pk)
        return case, (None if case else _bad("Case not found.", http.HTTP_404_NOT_FOUND))

    def get(self, request, pk):
        case, err = self._case_or_404(pk)
        if err:
            return err
        return Response([participant_row(p) for p in case.participants.select_related("user")])

    @transaction.atomic
    def post(self, request, pk):
        case, err = self._case_or_404(pk)
        if err:
            return err
        if case.is_closed:
            return _bad(f"A case that is {STATUS_LABELS[case.status]} is closed; participants cannot change.",
                        http.HTTP_409_CONFLICT)
        ser = ParticipantWriteSerializer(data=request.data, org=self.org())
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        row = CaseParticipant.objects.create(
            case=case, sort_order=case.participants.count(), **data
        )
        row = case.participants.select_related("user").get(pk=row.pk)
        log(case, request.user, "participant", {f"{PARTICIPANT_ROLE_LABELS[row.role]}": ["", participant_row(row)["display"]]})
        return Response(participant_row(row), status=http.HTTP_201_CREATED)


class CaseParticipantDetail(SurgeryView):
    def _find(self, pk, participant_id):
        case = self.get_case(pk)
        if case is None:
            return None, None, _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        row = case.participants.select_related("user").filter(pk=participant_id).first()
        if row is None:
            return case, None, _bad("Participant not found.", http.HTTP_404_NOT_FOUND)
        if case.is_closed:
            return case, row, _bad(f"A case that is {STATUS_LABELS[case.status]} is closed; participants cannot change.",
                                   http.HTTP_409_CONFLICT)
        return case, row, None

    @transaction.atomic
    def patch(self, request, pk, participant_id):
        case, row, err = self._find(pk, participant_id)
        if err:
            return err
        ser = ParticipantWriteSerializer(row, data=request.data, partial=True, org=self.org())
        ser.is_valid(raise_exception=True)
        before = participant_row(row)
        for field, value in ser.validated_data.items():
            setattr(row, field, value)
        row.save()
        row = case.participants.select_related("user").get(pk=row.pk)
        after = participant_row(row)
        label = after["role_label"]
        changes = {}
        for key, title in (("display", label), ("time_in", f"{label} time in"), ("time_out", f"{label} time out"),
                           ("comments", f"{label} comments")):
            if before[key] != after[key]:
                changes[title] = [before[key] or "", after[key] or ""]
        if changes:
            log(case, request.user, "participant", changes)
        return Response(after)

    @transaction.atomic
    def delete(self, request, pk, participant_id):
        case, row, err = self._find(pk, participant_id)
        if err:
            return err
        before = participant_row(row)
        row.delete()
        log(case, request.user, "participant", {before["role_label"]: [before["display"], ""]})
        return Response(status=http.HTTP_204_NO_CONTENT)


class PreferenceCardList(SurgeryView):
    """Preference cards: anyone on the team can search them; administrators maintain them."""

    def get(self, request):
        qs = PreferenceCard.objects.filter(organization=self.org()).select_related("surgeon")
        if request.query_params.get("all") != "1":
            qs = qs.filter(is_active=True)
        term = request.query_params.get("q", "").strip()
        if term:
            qs = qs.filter(Q(name__icontains=term) | Q(procedure_name__icontains=term))
        return Response([card_row(c) for c in qs[:50]])

    @transaction.atomic
    def post(self, request):
        if request.user.role not in ROOM_ADMIN_ROLES:
            return _bad("Only an administrator can create preference cards.", http.HTTP_403_FORBIDDEN)
        ser = CardWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        items = data.pop("items", [])
        if PreferenceCard.objects.filter(organization=self.org(), name__iexact=data["name"]).exists():
            return _bad(f"A card named {data['name']} already exists.", http.HTTP_409_CONFLICT)
        card = PreferenceCard.objects.create(organization=self.org(), **data)
        for i in items:
            PreferenceCardItem.objects.create(card=card, **i)
        return Response(card_row(card, detail=True), status=http.HTTP_201_CREATED)


class PreferenceCardDetail(SurgeryView):
    def _card(self, pk):
        return PreferenceCard.objects.filter(organization=self.org(), pk=pk).first()

    def get(self, request, pk):
        card = self._card(pk)
        return Response(card_row(card, detail=True)) if card else _bad("Card not found.", http.HTTP_404_NOT_FOUND)

    @transaction.atomic
    def patch(self, request, pk):
        if request.user.role not in ROOM_ADMIN_ROLES:
            return _bad("Only an administrator can change preference cards.", http.HTTP_403_FORBIDDEN)
        card = self._card(pk)
        if card is None:
            return _bad("Card not found.", http.HTTP_404_NOT_FOUND)
        ser = CardWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        items = data.pop("items", None)
        for f, v in data.items():
            setattr(card, f, v)
        card.save()
        if items is not None:  # cases that already used the card keep their own copy of the items
            card.items.all().delete()
            for i in items:
                PreferenceCardItem.objects.create(card=card, **i)
        return Response(card_row(card, detail=True))


def _closed(case, what):
    return _bad(f"A case that is {STATUS_LABELS[case.status]} is closed; {what} cannot change.", http.HTTP_409_CONFLICT)


class CaseCards(SurgeryView):
    """Merge Management: the preference cards on a case. The first card added is Primary."""

    def get(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        links = case.cards.select_related("card")
        primary = next((l for l in links if l.is_primary), None)
        return Response({
            "cards": [case_card_row(l) for l in links],
            "pre_op_notes": primary.card.pre_op_notes if primary else "",
            "post_op_notes": primary.card.post_op_notes if primary else "",
            "primary": primary.card.name if primary else "",
        })

    @transaction.atomic
    def post(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        if case.is_closed:
            return _closed(case, "preference cards")
        card = PreferenceCard.objects.filter(organization=self.org(), is_active=True, pk=request.data.get("card")).first()
        if card is None:
            return _bad("Pick a preference card.")
        if case.cards.filter(card=card).exists():
            return _bad(f"{card.name} is already on this case.", http.HTTP_409_CONFLICT)
        link = CaseCard.objects.create(case=case, card=card, is_primary=not case.cards.exists())
        # copy the card's supplies onto the case; a supply already listed just gains the card's quantity
        for item in card.items.all():
            existing = case.usage.filter(name__iexact=item.name, catalog_number=item.catalog_number).first()
            if existing:
                existing.total += item.quantity
                existing.save(update_fields=["total"])
            else:
                CaseUsageItem.objects.create(
                    case=case, category=item.category, name=item.name, catalog_number=item.catalog_number,
                    total=item.quantity, charge_code=item.charge_code, department=item.department, source_card=card,
                )
        log(case, request.user, "usage", {"Preference card": ["", card.name]})
        return Response(case_card_row(link), status=http.HTTP_201_CREATED)


class CaseCardDetail(SurgeryView):
    def _find(self, pk, link_id):
        case = self.get_case(pk)
        if case is None:
            return None, None, _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        link = case.cards.select_related("card").filter(pk=link_id).first()
        if link is None:
            return case, None, _bad("Card not found on this case.", http.HTTP_404_NOT_FOUND)
        if case.is_closed:
            return case, link, _closed(case, "preference cards")
        return case, link, None

    @transaction.atomic
    def post(self, request, pk, link_id):  # make Primary
        case, link, err = self._find(pk, link_id)
        if err:
            return err
        case.cards.update(is_primary=False)
        link.is_primary = True
        link.save(update_fields=["is_primary"])
        log(case, request.user, "usage", {"Primary preference card": ["", link.card.name]})
        return Response([case_card_row(l) for l in case.cards.select_related("card")])

    @transaction.atomic
    def delete(self, request, pk, link_id):
        case, link, err = self._find(pk, link_id)
        if err:
            return err
        was_primary = link.is_primary
        link.delete()
        if was_primary:  # the next card takes over as Primary
            nxt = case.cards.first()
            if nxt:
                nxt.is_primary = True
                nxt.save(update_fields=["is_primary"])
        log(case, request.user, "usage", {"Preference card": [link.card.name, ""]})
        return Response(status=http.HTTP_204_NO_CONTENT)


class CaseUsage(SurgeryView):
    def get(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        return Response([usage_row(u) for u in case.usage.all()])

    @transaction.atomic
    def post(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        if case.is_closed:
            return _closed(case, "supplies")
        ser = UsageWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        row = CaseUsageItem.objects.create(case=case, **ser.validated_data)
        log(case, request.user, "usage", {f"Supply {row.name}": ["", f"qty {row.total}"]})
        return Response(usage_row(row), status=http.HTTP_201_CREATED)


class CaseUsageDetail(SurgeryView):
    def _find(self, pk, usage_id):
        case = self.get_case(pk)
        if case is None:
            return None, None, _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        row = case.usage.filter(pk=usage_id).first()
        if row is None:
            return case, None, _bad("Supply not found.", http.HTTP_404_NOT_FOUND)
        if case.is_closed:
            return case, row, _closed(case, "supplies")
        return case, row, None

    @transaction.atomic
    def patch(self, request, pk, usage_id):
        case, row, err = self._find(pk, usage_id)
        if err:
            return err
        ser = UsageWriteSerializer(row, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        before = usage_row(row)
        for f, v in ser.validated_data.items():
            setattr(row, f, v)
        row.save()
        after = usage_row(row)
        changes = {f"Supply {row.name} {k}": [str(before[k]), str(after[k])]
                   for k in ("total", "hold", "wasted", "notes", "charge_code", "department") if before[k] != after[k]}
        if changes:
            log(case, request.user, "usage", changes)
        return Response(after)

    @transaction.atomic
    def delete(self, request, pk, usage_id):
        case, row, err = self._find(pk, usage_id)
        if err:
            return err
        log(case, request.user, "usage", {f"Supply {row.name}": [f"qty {row.total}", ""]})
        row.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)


class ChargePolicies(SurgeryView):
    """Time-based charge policies. Anyone on the team can read them; administrators maintain them."""

    def get(self, request):
        return Response([policy_row(p) for p in ChargePolicy.objects.filter(organization=self.org())])

    def post(self, request):
        if request.user.role not in ROOM_ADMIN_ROLES:
            return _bad("Only an administrator can create charge policies.", http.HTTP_403_FORBIDDEN)
        ser = PolicyWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if ChargePolicy.objects.filter(organization=self.org(), name__iexact=ser.validated_data["name"]).exists():
            return _bad("A policy with that name already exists.", http.HTTP_409_CONFLICT)
        return Response(policy_row(ChargePolicy.objects.create(organization=self.org(), **ser.validated_data)),
                        status=http.HTTP_201_CREATED)


class ChargePolicyDetail(SurgeryView):
    def patch(self, request, pk):
        if request.user.role not in ROOM_ADMIN_ROLES:
            return _bad("Only an administrator can change charge policies.", http.HTTP_403_FORBIDDEN)
        policy = ChargePolicy.objects.filter(organization=self.org(), pk=pk).first()
        if policy is None:
            return _bad("Policy not found.", http.HTTP_404_NOT_FOUND)
        ser = PolicyWriteSerializer(policy, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for f, v in ser.validated_data.items():
            setattr(policy, f, v)
        policy.save()
        return Response(policy_row(policy))


class CaseCharges(SurgeryView):
    def _payload(self, case, warnings=None):
        charges = list(case.charges.all())
        return {"charge_status": charge_status(charges), "charges": [charge_row(c) for c in charges],
                "warnings": warnings or []}

    def get(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        return Response(self._payload(case))

    @transaction.atomic
    def post(self, request, pk):  # add a manual charge
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        ser = ChargeWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        if data.get("item_charge") is None:
            data["item_charge"] = price_for(case.organization_id, data["charge_code"])
        c = CaseCharge.objects.create(case=case, is_auto=False, policy_type="manual", charge_date=timezone.localdate(), **data)
        log(case, request.user, "charge", {f"Charge {c.charge_code}": ["", f"qty {c.quantity}"]})
        return Response(charge_row(c), status=http.HTTP_201_CREATED)


class CaseChargeGenerate(SurgeryView):
    @transaction.atomic
    def post(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        if case.status == "cancelled":
            return _bad("A cancelled case has no charges.", http.HTTP_409_CONFLICT)
        if case.status == "pending":
            return _bad("Charges can be generated once the case has started.", http.HTTP_409_CONFLICT)
        made, warnings = generate_charges(case)
        log(case, request.user, "charge", {"Charges generated": ["", str(made)]})
        return Response(CaseCharges()._payload(case, warnings))


class CaseChargePost(SurgeryView):
    @transaction.atomic
    def post(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        if case.status in ("pending", "preop", "or", "cancelled"):
            return _bad("Charges can be posted once the patient is out of the OR.", http.HTTP_409_CONFLICT)
        pending = case.charges.filter(status="pending")
        ids = request.data.get("ids")
        if ids is not None:
            pending = pending.filter(pk__in=ids)
        count = pending.update(status="posted")
        if count == 0:
            return _bad("No pending charges to post.", http.HTTP_409_CONFLICT)
        log(case, request.user, "charge", {"Charges posted": ["", str(count)]})
        return Response(CaseCharges()._payload(case))


class CaseChargeDetail(SurgeryView):
    def _find(self, pk, charge_id):
        case = self.get_case(pk)
        if case is None:
            return None, None, _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        charge = case.charges.filter(pk=charge_id).first()
        if charge is None:
            return case, None, _bad("Charge not found.", http.HTTP_404_NOT_FOUND)
        if charge.status == "posted":
            return case, charge, _bad("A posted charge cannot be changed.", http.HTTP_409_CONFLICT)
        return case, charge, None

    @transaction.atomic
    def patch(self, request, pk, charge_id):
        case, charge, err = self._find(pk, charge_id)
        if err:
            return err
        ser = ChargeWriteSerializer(charge, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        before = charge_row(charge)
        for f, v in ser.validated_data.items():
            setattr(charge, f, v)
        charge.save()
        after = charge_row(charge)
        changes = {f"Charge {charge.charge_code} {k}": [str(before[k] or ""), str(after[k] or "")]
                   for k in ("quantity", "item_charge", "charge_code", "description") if before[k] != after[k]}
        if changes:
            log(case, request.user, "charge", changes)
        return Response(after)

    @transaction.atomic
    def delete(self, request, pk, charge_id):
        case, charge, err = self._find(pk, charge_id)
        if err:
            return err
        log(case, request.user, "charge", {f"Charge {charge.charge_code}": [f"qty {charge.quantity}", ""]})
        charge.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)


class ChargePrices(SurgeryView):
    def get(self, request):
        return Response([price_row(p) for p in ChargePrice.objects.filter(organization=self.org())])

    def post(self, request):
        """Add a price, or change the price of a code that is already listed."""
        if request.user.role not in ROOM_ADMIN_ROLES:
            return _bad("Only an administrator can change the price list.", http.HTTP_403_FORBIDDEN)
        ser = PriceWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        key = code_key(data.pop("charge_code"))
        if not key:
            return _bad("Charge code is required.")
        row, created = ChargePrice.objects.update_or_create(organization=self.org(), charge_code=key, defaults=data)
        return Response(price_row(row), status=http.HTTP_201_CREATED if created else http.HTTP_200_OK)


class ChargePriceDetail(SurgeryView):
    def delete(self, request, pk):
        if request.user.role not in ROOM_ADMIN_ROLES:
            return _bad("Only an administrator can change the price list.", http.HTTP_403_FORBIDDEN)
        deleted, _ = ChargePrice.objects.filter(organization=self.org(), pk=pk).delete()
        if not deleted:
            return _bad("Price not found.", http.HTTP_404_NOT_FOUND)
        return Response(status=http.HTTP_204_NO_CONTENT)


class CaseVisits(SurgeryView):
    """Case/Visit Link: the case's patient's visits, filtered by date range and status. Linking itself is a
    normal case update (PATCH visit), so it is checked and recorded in the history like any other change."""

    def get(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        q = request.query_params
        visits = Registration.objects.filter(patient=case.patient).select_related("facility")
        if q.get("status") == "open":
            visits = visits.filter(discharge_datetime__isnull=True)
        elif q.get("status") == "discharged":
            visits = visits.filter(discharge_datetime__isnull=False)
        start = parse_date(q.get("date_from") or "")
        end = parse_date(q.get("date_to") or "")
        if q.get("date_from") and start is None or q.get("date_to") and end is None:
            return _bad("Dates must look like 2026-11-03.")
        if start:
            visits = visits.filter(created_at__gte=day_bounds(start)[0])
        if end:
            visits = visits.filter(created_at__lt=day_bounds(end)[1])
        other = {
            c.visit_id: c.case_number
            for c in SurgeryCase.objects.filter(visit__in=visits).exclude(pk=case.pk).only("visit_id", "case_number")
        }
        rows = []
        for v in visits.order_by("-created_at")[:50]:
            when = v.arrival_time or v.created_at
            rows.append({
                "id": v.pk,
                "visit_number": v.visit_number,
                "date": timezone.localtime(when).isoformat(timespec="minutes"),
                "care_setting": v.get_care_setting_display() if v.care_setting else "",
                "reason": v.scheduled_procedure or v.reason_for_visit,
                "location": v.assigned_location or (v.facility.name if v.facility_id else ""),
                "status": "discharged" if v.discharge_datetime else "open",
                "linked": v.pk == case.visit_id,
                "other_case": other.get(v.pk),
            })
        return Response(rows)


class CaseDocuments(SurgeryView):
    """Documents on a case. Adding is allowed on a closed case too (scans arrive after the fact)."""

    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        return Response([document_row(d, request.user) for d in case.documents.select_related("uploaded_by")])

    @transaction.atomic
    def post(self, request, pk):
        case = self.get_case(pk)
        if case is None:
            return _bad("Case not found.", http.HTTP_404_NOT_FOUND)
        ser = DocumentUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        f = ser.validated_data["file"]
        name = f.name.replace("\\", "/").rsplit("/", 1)[-1][:200]
        ext = "." + name.lower().rsplit(".", 1)[-1]
        doc = CaseDocument(
            case=case, title=(ser.validated_data.get("title") or name.rsplit(".", 1)[0])[:160],
            category=ser.validated_data["category"], original_name=name, content_type=DOCUMENT_TYPES[ext][0],
            size=f.size, uploaded_by=request.user,
        )
        doc.file.save(name, f, save=False)
        doc.save()
        log(case, request.user, "document", {"Document": ["", doc.title]})
        return Response(document_row(doc, request.user), status=http.HTTP_201_CREATED)


class CaseDocumentDetail(SurgeryView):
    def _find(self, pk, doc_id):
        case = self.get_case(pk)
        if case is None:
            return None, None
        return case, case.documents.select_related("uploaded_by").filter(pk=doc_id).first()

    def get(self, request, pk, doc_id):
        """The file itself, sent as a download (never inline, so a hostile file cannot run in the page)."""
        case, doc = self._find(pk, doc_id)
        if doc is None:
            return _bad("Document not found.", http.HTTP_404_NOT_FOUND)
        try:
            handle = doc.file.open("rb")
        except FileNotFoundError:
            return _bad("The file is missing from storage.", http.HTTP_404_NOT_FOUND)
        response = FileResponse(handle, content_type=doc.content_type, as_attachment=True, filename=doc.original_name)
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @transaction.atomic
    def delete(self, request, pk, doc_id):
        case, doc = self._find(pk, doc_id)
        if doc is None:
            return _bad("Document not found.", http.HTTP_404_NOT_FOUND)
        if request.user.role not in ROOM_ADMIN_ROLES and doc.uploaded_by_id != request.user.pk:
            return _bad("Only the person who uploaded a document, or an administrator, can remove it.",
                        http.HTTP_403_FORBIDDEN)
        title, storage, name = doc.title, doc.file.storage, doc.file.name
        doc.delete()
        transaction.on_commit(lambda: storage.delete(name))
        log(case, request.user, "document", {"Document": [title, ""]})
        return Response(status=http.HTTP_204_NO_CONTENT)
