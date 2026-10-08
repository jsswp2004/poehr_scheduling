"""Referral Manager API: referrals, their worklist queues, the destination directory and clinic timers."""

from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import CustomUser

from . import referrals as rf
from .models import Referral, ReferralDestination, ReferralSettings
from .patient_header import _patient_for, _target_org

PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


def _name(user):
    if user is None:
        return ""
    return (f"{user.first_name} {user.last_name}".strip()) or user.username


def _iso(value):
    return value.isoformat() if value else None


def _need_staff(request):
    if request.user.role not in rf.STAFF_ROLES:
        return Response({"detail": "Not allowed."}, status=403)
    return None


def _scope(request):
    """The referrals this user may see: their clinic's (system admins with no clinic chosen see all)."""
    org = _target_org(request, request.query_params.get("org"))
    qs = Referral.objects.select_related("patient", "referring_provider", "assigned_to", "destination", "signed_by")
    if org is not None:
        return qs.filter(organization=org), org
    if request.user.role == "system_admin":
        return qs, None
    return qs.none(), None


def _destination_json(d):
    return {
        "id": d.pk, "name": d.name, "specialty": d.specialty, "kind": d.kind, "kind_label": d.get_kind_display(),
        "provider": d.provider_id, "npi": d.npi, "phone": d.phone, "fax": d.fax, "address": d.address,
        "direct_address": d.direct_address, "notes": d.notes, "is_active": d.is_active,
    }


def serialize(ref, user, detail=False, now=None):
    now = now or timezone.now()
    reason = rf.overdue_reason(ref, now)
    data = {
        "id": ref.pk,
        "patient": ref.patient_id,
        "patient_name": _name(ref.patient),
        "referring_provider": ref.referring_provider_id,
        "referring_provider_name": _name(ref.referring_provider),
        "destination": ref.destination_id,
        "destination_name": ref.destination_name or (ref.destination.name if ref.destination_id else ""),
        "specialty": ref.specialty,
        "urgency": ref.urgency,
        "urgency_label": rf.URGENCY_LABELS.get(ref.urgency, ref.urgency),
        "reason": ref.reason,
        "diagnosis_code": ref.diagnosis_code,
        "diagnosis_text": ref.diagnosis_text,
        "clinical_question": ref.clinical_question,
        "status": ref.status,
        "status_label": rf.STATUS_LABELS.get(ref.status, ref.status),
        "status_note": ref.status_note,
        "assigned_to": ref.assigned_to_id,
        "assigned_to_name": _name(ref.assigned_to),
        "created_at": _iso(ref.created_at),
        "sent_at": _iso(ref.sent_at),
        "scheduled_for": _iso(ref.scheduled_for),
        "appointment_location": ref.appointment_location,
        "seen_at": _iso(ref.seen_at),
        "report_received_at": _iso(ref.report_received_at),
        "closed_at": _iso(ref.closed_at),
        "schedule_due": _iso(ref.schedule_due),
        "report_due": _iso(ref.report_due),
        "overdue": bool(reason),
        "overdue_reason": reason,
        "has_report": bool(ref.report_text),
        "actions": rf.allowed_actions(user, ref),
    }
    if detail:
        profile = getattr(ref.patient, "patient_profile", None)
        data.update(
            {
                "patient_dob": _iso(getattr(profile, "date_of_birth", None)),
                "report_text": ref.report_text,
                "signed_by_name": _name(ref.signed_by),
                "signed_at": _iso(ref.signed_at),
                "clinical_snapshot": ref.clinical_snapshot or {},
                "destination_detail": _destination_json(ref.destination) if ref.destination_id else None,
                "events": [
                    {
                        "id": e.pk, "type": e.event_type, "from_status": e.from_status, "to_status": e.to_status,
                        "user": _name(e.user), "detail": e.detail, "at": _iso(e.created_at),
                    }
                    for e in ref.events.select_related("user")
                ],
            }
        )
    return data


def _doctors(org):
    qs = CustomUser.objects.filter(role="doctor", is_active=True)
    return qs.filter(organization=org) if org is not None else qs


def _clean_fields(request, org, data, creating, ref=None):
    """Validate the editable fields. Returns (values dict, error response)."""
    values = {}
    for key, limit in (("reason", 4000), ("clinical_question", 4000), ("specialty", 80), ("diagnosis_code", 20), ("diagnosis_text", 255), ("destination_name", 200)):
        if key in data:
            values[key] = str(data.get(key) or "").strip()[:limit]
    if "urgency" in data:
        if data["urgency"] not in rf.URGENCY_LABELS:
            return None, Response({"detail": "Urgency must be routine, urgent or emergent."}, status=400)
        values["urgency"] = data["urgency"]
    if "destination" in data:
        dest_id = data.get("destination")
        if dest_id in (None, "", 0):
            values["destination"] = None
        else:
            dest = ReferralDestination.objects.filter(pk=dest_id, organization=org, is_active=True).first()
            if dest is None:
                return None, Response({"detail": "That destination was not found."}, status=400)
            values["destination"] = dest
            values["destination_name"] = dest.name
            if not values.get("specialty") and not (ref and ref.specialty):
                values["specialty"] = dest.specialty
    if "referring_provider" in data or creating:
        prov_id = data.get("referring_provider")
        if prov_id in (None, ""):
            if request.user.role == "doctor":
                prov = request.user
            elif creating:
                return None, Response({"detail": "Choose the referring physician."}, status=400)
            else:
                prov = None
        else:
            prov = _doctors(org).filter(pk=prov_id).first()
            if prov is None:
                return None, Response({"detail": "The referring physician must be a doctor in this clinic."}, status=400)
        if prov is not None:
            values["referring_provider"] = prov
    return values, None


class ReferralListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        qs, _org = _scope(request)
        p = request.query_params
        if p.get("patient"):
            qs = qs.filter(patient_id=p["patient"])
        if p.get("status") in rf.STATUS_LABELS:
            qs = qs.filter(status=p["status"])
        if p.get("urgency") in rf.URGENCY_LABELS:
            qs = qs.filter(urgency=p["urgency"])
        if p.get("specialty"):
            qs = qs.filter(specialty__icontains=p["specialty"])
        if p.get("destination"):
            qs = qs.filter(destination_id=p["destination"])
        if p.get("referring_provider"):
            qs = qs.filter(referring_provider_id=p["referring_provider"])
        if p.get("assigned_to") == "me":
            qs = qs.filter(assigned_to=request.user)
        elif p.get("assigned_to") == "none":
            qs = qs.filter(assigned_to__isnull=True)
        elif p.get("assigned_to"):
            qs = qs.filter(assigned_to_id=p["assigned_to"])
        if p.get("queue"):
            qs = qs.filter(rf.queue_q(p["queue"], request.user))
        if p.get("q"):
            term = p["q"].strip()
            qs = qs.filter(
                Q(patient__first_name__icontains=term) | Q(patient__last_name__icontains=term)
                | Q(destination_name__icontains=term) | Q(specialty__icontains=term) | Q(reason__icontains=term)
            )
        ordering = p.get("ordering", "newest")
        if ordering == "oldest":
            qs = qs.order_by("created_at", "id")
        elif ordering == "urgency":
            rank = Case(When(urgency="emergent", then=Value(0)), When(urgency="urgent", then=Value(1)), default=Value(2), output_field=IntegerField())
            qs = qs.annotate(_rank=rank).order_by("_rank", "created_at", "id")
        else:
            qs = qs.order_by("-created_at", "-id")

        try:
            size = max(1, min(int(p.get("page_size", PAGE_SIZE)), MAX_PAGE_SIZE))
            page = max(1, int(p.get("page", 1)))
        except (TypeError, ValueError):
            size, page = PAGE_SIZE, 1
        count = qs.count()
        rows = list(qs[(page - 1) * size: page * size])
        now = timezone.now()
        return Response({"count": count, "page": page, "page_size": size, "results": [serialize(r, request.user, now=now) for r in rows]})

    def post(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        patient, err = _patient_for(request, request.data.get("patient"))
        if err:
            return err
        org = patient.organization
        if org is None:
            return Response({"detail": "This patient has no clinic."}, status=400)
        values, err = _clean_fields(request, org, request.data, creating=True)
        if err:
            return err
        ref = Referral.objects.create(organization=org, patient=patient, created_by=request.user, **values)
        rf.log_event(ref, "created", request.user, to_status="draft")
        ref = Referral.objects.select_related("patient", "referring_provider", "assigned_to", "destination", "signed_by").get(pk=ref.pk)
        return Response(serialize(ref, request.user, detail=True), status=201)


class ReferralDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return None, denied
        qs, _org = _scope(request)
        ref = qs.filter(pk=pk).first()
        if ref is None:
            return None, Response({"detail": "Referral not found."}, status=404)
        return ref, None

    def get(self, request, pk):
        ref, err = self._get(request, pk)
        return err or Response(serialize(ref, request.user, detail=True))

    def patch(self, request, pk):
        ref, err = self._get(request, pk)
        if err:
            return err
        if ref.status != "draft":
            return Response({"detail": "Only a draft can be edited. Use the steps on the referral instead."}, status=409)
        values, err = _clean_fields(request, ref.organization, request.data, creating=False, ref=ref)
        if err:
            return err
        for key, value in values.items():
            setattr(ref, key, value)
        ref.save()
        rf.log_event(ref, "edited", request.user, from_status="draft", to_status="draft", detail={"fields": sorted(values)})
        return Response(serialize(ref, request.user, detail=True))

    def delete(self, request, pk):
        ref, err = self._get(request, pk)
        if err:
            return err
        if ref.status != "draft":
            return Response({"detail": "Only a draft can be deleted. Cancel a sent referral instead."}, status=409)
        ref.delete()
        return Response(status=204)


class ReferralActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return denied
        qs, _org = _scope(request)
        ref = qs.filter(pk=pk).first()
        if ref is None:
            return Response({"detail": "Referral not found."}, status=404)
        try:
            rf.apply_action(ref, request.user, request.data.get("action"), request.data)
        except rf.ReferralError as exc:
            return Response({"detail": exc.message}, status=exc.status_code)
        ref = qs.get(pk=pk)
        return Response(serialize(ref, request.user, detail=True))


class ReferralQueuesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        qs, _org = _scope(request)
        if request.query_params.get("patient"):
            qs = qs.filter(patient_id=request.query_params["patient"])
        now = timezone.now()
        counts = {key: qs.filter(rf.queue_q(key, request.user, now)).count() for key, _label in rf.QUEUES}
        counts["mine"] = qs.filter(rf.queue_q("mine", request.user, now)).count()
        return Response({"counts": counts})


class ReferralMetaView(APIView):
    """Everything the screens need to build their pick lists."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        org = _target_org(request)
        staff = CustomUser.objects.filter(role__in=rf.STAFF_ROLES, is_active=True)
        if org is not None:
            staff = staff.filter(organization=org)
        return Response(
            {
                "specialties": rf.SPECIALTIES,
                "urgencies": [{"value": v, "label": l} for v, l in Referral.URGENCY_CHOICES],
                "statuses": [{"value": v, "label": l} for v, l in Referral.STATUS_CHOICES],
                "queues": [{"value": v, "label": l} for v, l in rf.QUEUES] + [{"value": "mine", "label": "Assigned to me"}],
                "action_labels": rf.ACTION_LABELS,
                "staff": [{"id": u.pk, "name": _name(u), "role": u.role} for u in staff.order_by("last_name", "first_name", "id")],
                "doctors": [{"id": u.pk, "name": _name(u)} for u in _doctors(org).order_by("last_name", "first_name", "id")],
                "can_manage": request.user.role in rf.ADMIN_ROLES,
            }
        )


# ---------------------------------------------------------------- directory + timers

DEST_FIELDS = {
    "name": 200, "specialty": 80, "npi": 10, "phone": 30, "fax": 30, "address": 300, "direct_address": 120, "notes": 2000,
}


def _dest_values(data, org, partial):
    values = {}
    for key, limit in DEST_FIELDS.items():
        if key in data:
            values[key] = str(data.get(key) or "").strip()[:limit]
    if "kind" in data:
        if data["kind"] not in dict(ReferralDestination.KIND_CHOICES):
            return None, "Kind must be internal or external."
        values["kind"] = data["kind"]
    if "is_active" in data:
        values["is_active"] = bool(data["is_active"])
    if "provider" in data:
        pid = data.get("provider")
        if pid in (None, "", 0):
            values["provider"] = None
        else:
            prov = _doctors(org).filter(pk=pid).first()
            if prov is None:
                return None, "The provider must be a doctor in this clinic."
            values["provider"] = prov
    if not partial and not values.get("name"):
        return None, "Give the destination a name."
    if "name" in values and not values["name"]:
        return None, "Give the destination a name."
    if values.get("npi") and (not values["npi"].isdigit() or len(values["npi"]) != 10):
        return None, "An NPI is 10 digits."
    return values, None


class DestinationListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic (?org=ID)."}, status=400)
        qs = ReferralDestination.objects.filter(organization=org)
        p = request.query_params
        if p.get("active", "1") == "1":
            qs = qs.filter(is_active=True)
        if p.get("kind") in dict(ReferralDestination.KIND_CHOICES):
            qs = qs.filter(kind=p["kind"])
        if p.get("specialty"):
            qs = qs.filter(specialty__icontains=p["specialty"])
        if p.get("q"):
            qs = qs.filter(Q(name__icontains=p["q"]) | Q(specialty__icontains=p["q"]))
        return Response([_destination_json(d) for d in qs])

    def post(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        # any staff member can add an outside practice while writing a referral; our own providers are set up by an administrator
        if request.data.get("kind") == "internal" and request.user.role not in rf.ADMIN_ROLES:
            return Response({"detail": "Only an administrator can add a destination inside the facility."}, status=403)
        values, error = _dest_values(request.data, org, partial=False)
        if error:
            return Response({"detail": error}, status=400)
        if ReferralDestination.objects.filter(organization=org, name=values["name"], specialty=values.get("specialty", "")).exists():
            return Response({"detail": "That destination is already in the directory."}, status=400)
        dest = ReferralDestination.objects.create(organization=org, **values)
        return Response(_destination_json(dest), status=201)


class DestinationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return None, denied
        org = _target_org(request)
        qs = ReferralDestination.objects.all() if (org is None and request.user.role == "system_admin") else ReferralDestination.objects.filter(organization=org)
        dest = qs.filter(pk=pk).first()
        if dest is None:
            return None, Response({"detail": "Destination not found."}, status=404)
        return dest, None

    def get(self, request, pk):
        dest, err = self._get(request, pk)
        return err or Response(_destination_json(dest))

    def patch(self, request, pk):
        dest, err = self._get(request, pk)
        if err:
            return err
        if request.user.role not in rf.ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change the directory."}, status=403)
        values, error = _dest_values(request.data, dest.organization, partial=True)
        if error:
            return Response({"detail": error}, status=400)
        for key, value in values.items():
            setattr(dest, key, value)
        try:
            dest.save()
        except Exception:  # duplicate name + specialty
            return Response({"detail": "That destination is already in the directory."}, status=400)
        return Response(_destination_json(dest))

    def delete(self, request, pk):
        dest, err = self._get(request, pk)
        if err:
            return err
        if request.user.role not in rf.ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change the directory."}, status=403)
        if Referral.objects.filter(destination=dest).exists():
            dest.is_active = False  # keep it for the referrals already sent there
            dest.save(update_fields=["is_active"])
            return Response({"deactivated": True, **_destination_json(dest)})
        dest.delete()
        return Response(status=204)


class ReferralSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _json(org):
        days, report = rf.settings_for(org)
        return {"organization": org.pk, "schedule_days": days, "report_days": report}

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic (?org=ID)."}, status=400)
        return Response({**self._json(org), "can_edit": request.user.role in rf.ADMIN_ROLES})

    def put(self, request):
        if request.user.role not in rf.ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change the referral timers."}, status=403)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        days = request.data.get("schedule_days")
        report = request.data.get("report_days")
        current, current_report = rf.settings_for(org)
        if days is not None:
            if not isinstance(days, dict):
                return Response({"detail": "schedule_days must list routine, urgent and emergent."}, status=400)
            for key, value in days.items():
                if key not in current:
                    return Response({"detail": f"Unknown urgency: {key}"}, status=400)
                if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 365:
                    return Response({"detail": "Days must be a whole number from 1 to 365."}, status=400)
                current[key] = value
        if report is not None:
            if not isinstance(report, int) or isinstance(report, bool) or not 1 <= report <= 365:
                return Response({"detail": "Days must be a whole number from 1 to 365."}, status=400)
            current_report = report
        ReferralSettings.objects.update_or_create(
            organization=org, defaults={"schedule_days": current, "report_days": current_report, "updated_by": request.user}
        )
        return Response({**self._json(org), "can_edit": True})
