"""Home medications API: the patient's list of what they take at home, and medication reconciliation."""

from datetime import date

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from . import allergies
from . import home_meds
from . import prescriptions as rxs
from .models import HomeMedication, MedReview
from .order_tasks import FREQUENCY_LABELS, ROUTES
from .patient_header import _patient_for, _target_org
from .prescription_views import _iso, _name, _need_staff

TEXT_FIELDS = (
    ("drug_name", 200), ("code_system", 10), ("code", 20), ("strength", 60), ("form", 40), ("dose", 60),
    ("prn_reason", 120), ("sig_extra", 300), ("indication_text", 255), ("outside_prescriber", 120),
)
SOURCES = dict(HomeMedication.SOURCE_CHOICES)


def serialize(med, detail=True):
    alerts = []
    if detail and med.status == "active" and med.drug_name:
        alerts = [a["message"] for a in allergies.check_order(med.patient, med.drug_name, med.code_system, med.code)]
    return {
        "id": med.pk, "patient": med.patient_id,
        "drug_name": med.drug_name, "code_system": med.code_system, "code": med.code,
        "strength": med.strength, "form": med.form, "dose": med.dose, "route": med.route, "frequency": med.frequency,
        "frequency_label": FREQUENCY_LABELS.get(med.frequency, ""),
        "prn": med.prn, "prn_reason": med.prn_reason, "sig_extra": med.sig_extra, "sig": home_meds.sig_of(med),
        "indication_text": med.indication_text,
        "source": med.source, "source_label": SOURCES.get(med.source, med.source), "outside_prescriber": med.outside_prescriber,
        "last_taken": med.last_taken.isoformat() if med.last_taken else None,
        "status": med.status, "stopped_at": _iso(med.stopped_at), "stopped_by_name": _name(med.stopped_by) if med.stopped_by_id else "",
        "stop_reason": med.stop_reason,
        "from_prescription": med.from_prescription_id,
        "reviewed_at": _iso(med.reviewed_at), "reviewed_by_name": _name(med.reviewed_by) if med.reviewed_by_id else "",
        "created_at": _iso(med.created_at), "created_by_name": _name(med.created_by) if med.created_by_id else "",
        "controlled": rxs.is_controlled(med.drug_name),
        "allergy_alerts": alerts,
    }


def serialize_review(rev):
    return {
        "id": rev.pk, "at": _iso(rev.reviewed_at), "by": _name(rev.reviewed_by) if rev.reviewed_by_id else "",
        "note": rev.note, "count": len(rev.snapshot or []), "medications": rev.snapshot or [],
    }


def _clean(data, creating):
    values = {}
    for key, limit in TEXT_FIELDS:
        if key in data:
            values[key] = str(data.get(key) or "").strip()[:limit]
    if creating and not values.get("drug_name"):
        return None, Response({"detail": "Choose the medicine."}, status=400)
    if "drug_name" in values and not values["drug_name"]:
        return None, Response({"detail": "The medicine needs a name."}, status=400)
    if values.get("form") and values["form"] not in rxs.FORMS:
        return None, Response({"detail": "Unknown dosage form."}, status=400)
    if "route" in data:
        route = str(data.get("route") or "")
        if route and route not in ROUTES:
            return None, Response({"detail": "Unknown route."}, status=400)
        values["route"] = route
    if "frequency" in data:
        freq = str(data.get("frequency") or "")
        if freq and freq not in FREQUENCY_LABELS:
            return None, Response({"detail": "Unknown frequency."}, status=400)
        values["frequency"] = freq
    if "source" in data:
        source = str(data.get("source") or "")
        if source not in SOURCES:
            return None, Response({"detail": "Unknown source."}, status=400)
        values["source"] = source
    if "prn" in data:
        values["prn"] = bool(data.get("prn"))
    if "last_taken" in data:
        raw = data.get("last_taken")
        if raw in (None, ""):
            values["last_taken"] = None
        else:
            try:
                taken = date.fromisoformat(str(raw)[:10])
            except ValueError:
                return None, Response({"detail": "Last taken must be a date."}, status=400)
            if taken > date.today():
                return None, Response({"detail": "Last taken can't be in the future."}, status=400)
            values["last_taken"] = taken
    return values, None


def _patient_arg(request, raw):
    if raw in (None, ""):
        return None, Response({"detail": "Choose the patient."}, status=400)
    return _patient_for(request, raw)


class HomeMedicationListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        patient, err = _patient_arg(request, request.query_params.get("patient"))
        if err:
            return err
        qs = HomeMedication.objects.filter(patient=patient, organization=patient.organization).select_related(
            "patient", "stopped_by", "reviewed_by", "created_by"
        )
        want = request.query_params.get("status", "active")
        counts = {"active": qs.filter(status="active").count(), "stopped": qs.filter(status="stopped").count()}
        if want in ("active", "stopped"):
            qs = qs.filter(status=want)
        last = MedReview.objects.filter(patient=patient).select_related("reviewed_by").first()
        return Response({
            "results": [serialize(m) for m in qs],
            "counts": counts,
            "last_review": serialize_review(last) if last else None,
            "options": {
                "frequencies": [{"value": k, "label": v} for k, v in FREQUENCY_LABELS.items()],
                "routes": ROUTES, "forms": rxs.FORMS,
                "sources": [{"value": k, "label": v} for k, v in SOURCES.items()],
            },
        })

    def post(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        patient, err = _patient_arg(request, request.data.get("patient"))
        if err:
            return err
        org = patient.organization
        if org is None:
            return Response({"detail": "This patient has no clinic."}, status=400)
        values, err = _clean(request.data, creating=True)
        if err:
            return err
        if home_meds.same_drug(patient, values["drug_name"]) is not None:
            return Response({"detail": f"{values['drug_name']} is already on this patient's home list. Edit that entry instead."}, status=409)
        med = HomeMedication.objects.create(organization=org, patient=patient, created_by=request.user, **values)
        return Response(serialize(med), status=201)


class HomeMedicationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return None, denied
        org = _target_org(request, request.query_params.get("org"))
        qs = HomeMedication.objects.select_related("patient", "stopped_by", "reviewed_by", "created_by")
        if org is not None:
            qs = qs.filter(organization=org)
        elif request.user.role != "system_admin":
            qs = qs.none()
        med = qs.filter(pk=pk).first()
        if med is None:
            return None, Response({"detail": "Home medication not found."}, status=404)
        return med, None

    def get(self, request, pk):
        med, err = self._get(request, pk)
        return err or Response(serialize(med))

    def patch(self, request, pk):
        med, err = self._get(request, pk)
        if err:
            return err
        if med.status != "active":
            return Response({"detail": "Resume this medicine before editing it."}, status=409)
        values, err = _clean(request.data, creating=False)
        if err:
            return err
        name = values.get("drug_name")
        if name and home_meds.same_drug(med.patient, name, exclude_pk=med.pk) is not None:
            return Response({"detail": f"{name} is already on this patient's home list."}, status=409)
        for key, value in values.items():
            setattr(med, key, value)
        med.save()
        return Response(serialize(med))


class HomeMedicationActionView(APIView):
    """POST {action: stop | resume | confirm, reason}."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        med, err = HomeMedicationDetailView()._get(request, pk)
        if err:
            return err
        action = request.data.get("action")
        if action == "stop":
            if med.status != "active":
                return Response({"detail": "This medicine is already stopped."}, status=409)
            reason = str(request.data.get("reason") or "").strip()[:255]
            if not reason:
                return Response({"detail": "Give the reason it was stopped."}, status=400)
            home_meds.stop(med, request.user, reason)
        elif action == "resume":
            if med.status != "stopped":
                return Response({"detail": "This medicine is already on the list."}, status=409)
            if home_meds.same_drug(med.patient, med.drug_name, exclude_pk=med.pk) is not None:
                return Response({"detail": "The same medicine is already on the list."}, status=409)
            home_meds.resume(med)
        elif action == "confirm":
            if med.status != "active":
                return Response({"detail": "Only a medicine the patient is taking can be confirmed."}, status=409)
            med.reviewed_at = timezone.now()
            med.reviewed_by = request.user
            med.save(update_fields=["reviewed_at", "reviewed_by", "updated_at"])
        else:
            return Response({"detail": "Unknown action."}, status=400)
        return Response(serialize(med))


class MedReviewView(APIView):
    """GET ?patient= -- past reconciliations.  POST {patient, note} -- confirm the whole home list."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        patient, err = _patient_arg(request, request.query_params.get("patient"))
        if err:
            return err
        revs = MedReview.objects.filter(patient=patient).select_related("reviewed_by")[:20]
        return Response({"results": [serialize_review(r) for r in revs]})

    def post(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        patient, err = _patient_arg(request, request.data.get("patient"))
        if err:
            return err
        org = patient.organization
        if org is None:
            return Response({"detail": "This patient has no clinic."}, status=400)
        note = str(request.data.get("note") or "").strip()[:500]
        rev = home_meds.confirm_review(patient, org, request.user, note)
        return Response(serialize_review(rev), status=201)
