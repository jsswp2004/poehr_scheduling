"""Rx writer API: prescriptions, pharmacies, the patient's pharmacy, prescriber details, drug search."""

from django.db.models import Q
from django.http import HttpResponse
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import CustomUser

from . import allergies
from . import prescriptions as rxs
from . import rx_transport
from .models import PatientPharmacy, Pharmacy, PrescriberProfile, Prescription, PrescriptionFavorite
from .order_tasks import FREQUENCY_LABELS, ROUTES
from .patient_header import _patient_for, _target_org
from .prescription_pdf import build_pdf

PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
RELATED = ("patient", "prescriber", "pharmacy", "signed_by", "replaces", "renews")


def _name(user):
    return rxs._name(user)


def _iso(value):
    return value.isoformat() if value else None


def _need_staff(request):
    if request.user.role not in rxs.DRAFT_ROLES:
        return Response({"detail": "Not allowed."}, status=403)
    return None


def _scope(request):
    org = _target_org(request, request.query_params.get("org"))
    qs = Prescription.objects.select_related(*RELATED)
    if org is not None:
        return qs.filter(organization=org), org
    if request.user.role == "system_admin":
        return qs, None
    return qs.none(), None


QUEUES = [
    ("needs_signing", "Needs signing"),
    ("to_send", "To print or fax"),
    ("renewals", "Due for renewal"),
    ("sent", "Sent"),
    ("cancelled", "Cancelled"),
    ("all", "All"),
]
QUEUE_STATUS = {"needs_signing": "draft", "to_send": "signed", "sent": "sent", "cancelled": "cancelled"}


def _narrow(request, qs):
    """The filters the list and the queue counts share: patient, prescriber, search text."""
    p = request.query_params
    if p.get("patient"):
        qs = qs.filter(patient_id=p["patient"])
    if p.get("prescriber") == "me":
        qs = qs.filter(prescriber=request.user)
    elif p.get("prescriber"):
        qs = qs.filter(prescriber_id=p["prescriber"])
    if p.get("q"):
        term = p["q"].strip()
        qs = qs.filter(Q(drug_name__icontains=term) | Q(patient__first_name__icontains=term) | Q(patient__last_name__icontains=term))
    return qs


def serialize(rx, user, detail=False):
    data = {
        "id": rx.pk,
        "patient": rx.patient_id,
        "patient_name": _name(rx.patient),
        "prescriber": rx.prescriber_id,
        "prescriber_name": _name(rx.prescriber),
        "drug_name": rx.drug_name, "code_system": rx.code_system, "code": rx.code,
        "strength": rx.strength, "form": rx.form,
        "dose": rx.dose, "route": rx.route, "frequency": rx.frequency,
        "frequency_label": FREQUENCY_LABELS.get(rx.frequency, ""),
        "duration_days": rx.duration_days, "prn": rx.prn, "prn_reason": rx.prn_reason, "sig_extra": rx.sig_extra,
        "sig": rx.sig or rxs.build_sig(rx),
        "quantity": format(rx.quantity.normalize(), "f") if rx.quantity is not None else None,
        "quantity_unit": rx.quantity_unit, "days_supply": rx.days_supply, "refills": rx.refills,
        "dispense_as_written": rx.dispense_as_written,
        "indication_code": rx.indication_code, "indication_text": rx.indication_text,
        "note_to_pharmacist": rx.note_to_pharmacist,
        "pharmacy": rx.pharmacy_id,
        "pharmacy_name": (rx.pharmacy_snapshot or {}).get("name") or (rx.pharmacy.name if rx.pharmacy_id else ""),
        "status": rx.status, "status_label": rxs.STATUS_LABELS.get(rx.status, rx.status),
        "delivery_method": rx.delivery_method,
        "created_at": _iso(rx.created_at), "signed_at": _iso(rx.signed_at), "sent_at": _iso(rx.sent_at),
        "cancelled_at": _iso(rx.cancelled_at), "cancel_reason": rx.cancel_reason,
        "print_count": rx.print_count,
        "replaces": rx.replaces_id,
        "renews": rx.renews_id,
        "runs_out_on": rxs.runs_out_at(rx).date().isoformat() if rxs.runs_out_at(rx) else None,
        "renewal_due": rxs.renewal_due(rx) if rx.status in ("signed", "sent") else False,
        "controlled": rxs.is_controlled(rx.drug_name),
        "actions": rxs.allowed_actions(user, rx),
    }
    if detail:
        data.update({
            "signed_by_name": _name(rx.signed_by),
            "pharmacy_detail": rx.pharmacy_snapshot or (rxs.pharmacy_json(rx.pharmacy) if rx.pharmacy_id else None),
            "delivery_detail": rx.delivery_detail or {},
            "missing_for_sign": rxs.missing_for_sign(rx) if rx.status == "draft" else [],
            "allergy_alerts": allergies.check_order(rx.patient, rx.drug_name, rx.code_system, rx.code) if rx.status == "draft" and rx.drug_name else [],
            "duplicates": rxs.duplicates_for(rx) if rx.status == "draft" and rx.drug_name else [],
            "clinical_snapshot": rx.clinical_snapshot or {},
            "replaced_by": [r.pk for r in rx.replaced_by.all()],
            "events": [
                {"id": e.pk, "type": e.event_type, "from_status": e.from_status, "to_status": e.to_status,
                 "user": _name(e.user), "detail": e.detail, "at": _iso(e.created_at)}
                for e in rx.events.select_related("user")
            ],
        })
    return data


def _error(exc):
    body = {"detail": exc.message}
    if exc.errors:
        body["errors"] = exc.errors
    return Response(body, status=exc.status_code)


def _doctors(org):
    qs = CustomUser.objects.filter(role="doctor", is_active=True)
    return qs.filter(organization=org) if org is not None else qs


TEXT_FIELDS = (
    ("drug_name", 200), ("code_system", 10), ("code", 20), ("strength", 60), ("form", 40), ("dose", 60),
    ("prn_reason", 120), ("sig_extra", 300), ("quantity_unit", 30), ("indication_code", 20),
    ("indication_text", 255), ("note_to_pharmacist", 500),
)


def _whole(data, key, low, high, label):
    value = data.get(key)
    if value in (None, ""):
        return None, None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None, Response({"detail": f"{label} must be a whole number."}, status=400)
    if number < low or number > high:
        return None, Response({"detail": f"{label} must be between {low} and {high}."}, status=400)
    return number, None


def _clean_fields(request, org, data, creating, rx=None):
    """Validate the editable fields. Returns (values dict, error response)."""
    values = {}
    for key, limit in TEXT_FIELDS:
        if key in data:
            values[key] = str(data.get(key) or "").strip()[:limit]
    if "drug_name" in values:
        if creating and not values["drug_name"]:
            return None, Response({"detail": "Choose the drug."}, status=400)
        if rxs.is_controlled(values["drug_name"]):
            return None, Response({"detail": rxs.CONTROLLED_MESSAGE}, status=400)
    elif creating:
        return None, Response({"detail": "Choose the drug."}, status=400)
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
    for key, low, high, label in (("duration_days", 1, 365, "Duration"), ("days_supply", 1, 365, "Days' supply"), ("refills", 0, rxs.MAX_REFILLS, "Refills")):
        if key in data:
            number, err = _whole(data, key, low, high, label)
            if err:
                return None, err
            values[key] = number if key != "refills" else (number or 0)
    if "quantity" in data:
        qty = rxs._decimal(data.get("quantity"))
        if data.get("quantity") not in (None, "") and (qty is None or qty <= 0 or qty > 100000):
            return None, Response({"detail": "Quantity must be a number greater than 0."}, status=400)
        values["quantity"] = qty
    for key in ("prn", "dispense_as_written"):
        if key in data:
            values[key] = bool(data.get(key))
    if "pharmacy" in data:
        pid = data.get("pharmacy")
        if pid in (None, "", 0):
            values["pharmacy"] = None
        else:
            ph = Pharmacy.objects.filter(pk=pid, organization=org, is_active=True).first()
            if ph is None:
                return None, Response({"detail": "That pharmacy was not found."}, status=400)
            values["pharmacy"] = ph
    if "prescriber" in data or creating:
        pid = data.get("prescriber")
        if pid in (None, ""):
            if request.user.role == "doctor":
                prescriber = request.user
            elif creating:
                return None, Response({"detail": "Choose the prescribing doctor."}, status=400)
            else:
                prescriber = None
        else:
            prescriber = _doctors(org).filter(pk=pid).first()
            if prescriber is None:
                return None, Response({"detail": "The prescriber must be a doctor in this clinic."}, status=400)
        if prescriber is not None:
            values["prescriber"] = prescriber
    return values, None


class PrescriptionListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        qs, _org = _scope(request)
        p = request.query_params
        qs = _narrow(request, qs)
        due_order = None
        if p.get("queue") == "renewals":
            due_order = rxs.renewals_due(qs)
            qs = qs.filter(pk__in=due_order)
        elif p.get("queue") in QUEUE_STATUS:
            qs = qs.filter(status=QUEUE_STATUS[p["queue"]])
        elif p.get("status") in rxs.STATUS_LABELS:
            qs = qs.filter(status=p["status"])
        elif p.get("status") == "active":
            qs = qs.filter(status__in=["signed", "sent"])
        qs = qs.order_by("-created_at", "-id")
        if due_order is not None:
            position = {pk: i for i, pk in enumerate(due_order)}
            ordered = sorted(qs, key=lambda r: position[r.pk])
            qs = None
        try:
            size = max(1, min(int(p.get("page_size", PAGE_SIZE)), MAX_PAGE_SIZE))
            page = max(1, int(p.get("page", 1)))
        except (TypeError, ValueError):
            size, page = PAGE_SIZE, 1
        if qs is None:  # the renewal queue is ordered by when the supply runs out
            count, rows = len(ordered), ordered[(page - 1) * size: page * size]
        else:
            count = qs.count()
            rows = list(qs[(page - 1) * size: page * size])
        return Response({"count": count, "page": page, "page_size": size, "results": [serialize(r, request.user) for r in rows]})

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
        data = request.data
        if "pharmacy" not in data:
            preferred = rxs.preferred_pharmacy(patient)
            if preferred is not None and preferred.organization_id == org.pk:
                data = {**data, "pharmacy": preferred.pk}
        values, err = _clean_fields(request, org, data, creating=True)
        if err:
            return err
        rx = Prescription.objects.create(organization=org, patient=patient, created_by=request.user, **values)
        rxs.log_event(rx, "created", request.user, to_status="draft")
        rx = Prescription.objects.select_related(*RELATED).get(pk=rx.pk)
        return Response(serialize(rx, request.user, detail=True), status=201)


class PrescriptionQueuesView(APIView):
    """GET -- how many prescriptions sit in each queue (same patient / prescriber / search filters as the list)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        qs, _org = _scope(request)
        qs = _narrow(request, qs)
        counts = {key: qs.filter(status=status).count() for key, status in QUEUE_STATUS.items()}
        counts["renewals"] = len(rxs.renewals_due(qs))
        counts["all"] = qs.count()
        return Response({"counts": counts})


class PrescriptionDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return None, denied
        qs, _org = _scope(request)
        rx = qs.filter(pk=pk).first()
        if rx is None:
            return None, Response({"detail": "Prescription not found."}, status=404)
        return rx, None

    def get(self, request, pk):
        rx, err = self._get(request, pk)
        return err or Response(serialize(rx, request.user, detail=True))

    def patch(self, request, pk):
        rx, err = self._get(request, pk)
        if err:
            return err
        if rx.status != "draft":
            return Response({"detail": "A signed prescription can't be edited. Use 'revise' to write a replacement."}, status=409)
        values, err = _clean_fields(request, rx.organization, request.data, creating=False, rx=rx)
        if err:
            return err
        for key, value in values.items():
            setattr(rx, key, value)
        rx.save()
        rxs.log_event(rx, "edited", request.user, from_status="draft", to_status="draft", detail={"fields": sorted(values)})
        return Response(serialize(rx, request.user, detail=True))

    def delete(self, request, pk):
        rx, err = self._get(request, pk)
        if err:
            return err
        if rx.status != "draft":
            return Response({"detail": "Only a draft can be deleted. Cancel a signed prescription instead."}, status=409)
        rx.delete()
        return Response(status=204)


class PrescriptionActionView(APIView):
    """POST {action: sign | fax | cancel | revise | renew, ...}  (printing has its own endpoint)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return denied
        qs, _org = _scope(request)
        rx = qs.filter(pk=pk).first()
        if rx is None:
            return Response({"detail": "Prescription not found."}, status=404)
        action = request.data.get("action")
        d = request.data
        try:
            if action == "sign":
                rxs.sign(rx, request.user, d.get("allergy_override_reason", ""), d.get("duplicate_reason", ""))
            elif action == "fax":
                rxs.record_fax(rx, request.user, d.get("fax_number", ""), d.get("confirmation", ""), d.get("note", ""))
            elif action == "cancel":
                rxs.cancel(rx, request.user, d.get("reason", ""))
            elif action == "revise":
                new = rxs.revise(rx, request.user)
                return Response(serialize(qs.get(pk=new.pk), request.user, detail=True), status=201)
            elif action == "renew":
                new = rxs.renew(rx, request.user)
                return Response(serialize(qs.get(pk=new.pk), request.user, detail=True), status=201)
            else:
                return Response({"detail": "Unknown action."}, status=400)
        except rxs.RxError as exc:
            return _error(exc)
        return Response(serialize(qs.get(pk=pk), request.user, detail=True))


def _pdf_response(rx, data, filename):
    resp = HttpResponse(data, content_type="application/pdf")
    resp["Content-Disposition"] = f'inline; filename="{filename}"'
    resp["Cache-Control"] = "no-store"
    return resp


class PrescriptionPdfView(APIView):
    """GET: a preview of the PDF (not logged). POST: the PDF for printing -- logged on the prescription."""

    permission_classes = [permissions.IsAuthenticated]

    def _rx(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return None, denied
        qs, _org = _scope(request)
        rx = qs.filter(pk=pk).first()
        if rx is None:
            return None, Response({"detail": "Prescription not found."}, status=404)
        return rx, None

    def get(self, request, pk):
        rx, err = self._rx(request, pk)
        if err:
            return err
        return _pdf_response(rx, build_pdf(rx, reprint=rx.status == "sent"), f"prescription-{rx.pk}.pdf")

    def post(self, request, pk):
        rx, err = self._rx(request, pk)
        if err:
            return err
        try:
            rx = rxs.record_print(rx, request.user)
        except rxs.RxError as exc:
            return _error(exc)
        rx = Prescription.objects.select_related(*RELATED).get(pk=rx.pk)
        return _pdf_response(rx, build_pdf(rx, reprint=rx.print_count > 1), f"prescription-{rx.pk}.pdf")


class PrescriptionMetaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        org = _target_org(request)
        doctors = []
        for d in _doctors(org).select_related("prescriber_profile").order_by("last_name", "first_name"):
            prof = getattr(d, "prescriber_profile", None)
            doctors.append({
                "id": d.pk, "name": _name(d), "npi": d.npi,
                "ready": bool(rxs.npi_valid(d.npi) and prof and prof.license_number.strip()),
            })
        return Response({
            "frequencies": [{"value": k, "label": v} for k, v in FREQUENCY_LABELS.items()],
            "routes": ROUTES,
            "forms": rxs.FORMS,
            "doctors": doctors,
            "max_refills": rxs.MAX_REFILLS,
            "capabilities": rx_transport.capabilities(),
            "controlled_message": rxs.CONTROLLED_MESSAGE,
            "can_sign": request.user.role in rxs.SIGN_ROLES,
            "queues": [{"value": k, "label": v} for k, v in QUEUES],
        })


class DrugSearchView(APIView):
    """GET ?q=amox -- drug ingredient suggestions (controlled drugs are flagged)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        found = allergies.search_substances(request.query_params.get("q", ""), "medication")
        results = []
        for r in found["results"]:
            if r["display"].endswith("(class)"):
                continue
            results.append({**r, "controlled": rxs.is_controlled(r["display"])})
        return Response({"results": results, "rxnorm": found["rxnorm"], "rxnorm_detail": found["rxnorm_detail"]})


# ---------------------------------------------------------------- pharmacies


def _pharmacy_values(data, partial):
    values = {}
    for key, limit in (("name", 200), ("address", 255), ("city", 80), ("state", 2), ("zip_code", 10), ("phone", 30), ("fax", 30), ("ncpdp_id", 7), ("npi", 10)):
        if key in data:
            values[key] = str(data.get(key) or "").strip()[:limit]
    if "state" in values:
        values["state"] = values["state"].upper()
    if not partial and not values.get("name"):
        return None, Response({"detail": "The pharmacy needs a name."}, status=400)
    if "name" in values and not values["name"]:
        return None, Response({"detail": "The pharmacy needs a name."}, status=400)
    if values.get("ncpdp_id") and not values["ncpdp_id"].isdigit():
        return None, Response({"detail": "The NCPDP ID is 7 digits."}, status=400)
    if "is_active" in data:
        values["is_active"] = bool(data.get("is_active"))
    return values, None


class PharmacyListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        org = _target_org(request, request.query_params.get("org"))
        if org is None:
            return Response({"results": []})
        qs = Pharmacy.objects.filter(organization=org)
        if request.query_params.get("all") != "1":
            qs = qs.filter(is_active=True)
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(Q(name__icontains=term) | Q(city__icontains=term) | Q(zip_code__icontains=term) | Q(address__icontains=term))
        return Response({"results": [rxs.pharmacy_json(p) for p in qs[:100]]})

    def post(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        org = _target_org(request, request.data.get("org"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        values, err = _pharmacy_values(request.data, partial=False)
        if err:
            return err
        values.pop("is_active", None)
        p = Pharmacy.objects.create(organization=org, **values)
        return Response(rxs.pharmacy_json(p), status=201)


class PharmacyDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return None, denied
        org = _target_org(request)
        p = Pharmacy.objects.filter(pk=pk, organization=org).first() if org is not None else None
        if p is None:
            return None, Response({"detail": "Pharmacy not found."}, status=404)
        return p, None

    def get(self, request, pk):
        p, err = self._get(request, pk)
        return err or Response(rxs.pharmacy_json(p))

    def patch(self, request, pk):
        p, err = self._get(request, pk)
        if err:
            return err
        values, err = _pharmacy_values(request.data, partial=True)
        if err:
            return err
        for k, v in values.items():
            setattr(p, k, v)
        p.save()
        return Response(rxs.pharmacy_json(p))

    def delete(self, request, pk):
        p, err = self._get(request, pk)
        if err:
            return err
        if request.user.role not in rxs.ADMIN_ROLES and request.user.role != "doctor":
            return Response({"detail": "Not allowed."}, status=403)
        if p.prescriptions.exists() or PatientPharmacy.objects.filter(pharmacy=p).exists():
            p.is_active = False  # in use: keep the history, just stop offering it
            p.save()
            return Response({"deactivated": True, **rxs.pharmacy_json(p)})
        p.delete()
        return Response(status=204)


class PatientPharmacyView(APIView):
    """GET / PUT {pharmacy: id | null} -- the patient's preferred pharmacy."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        patient, err = _patient_for(request, patient_id)
        if err:
            return err
        if request.user.role not in rxs.DRAFT_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        ph = rxs.preferred_pharmacy(patient)
        return Response({"pharmacy": rxs.pharmacy_json(ph) if ph else None})

    def put(self, request, patient_id):
        patient, err = _patient_for(request, patient_id)
        if err:
            return err
        if request.user.role not in rxs.DRAFT_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        pid = request.data.get("pharmacy")
        if pid in (None, ""):
            PatientPharmacy.objects.filter(patient=patient).delete()
            return Response({"pharmacy": None})
        ph = Pharmacy.objects.filter(pk=pid, organization=patient.organization, is_active=True).first()
        if ph is None:
            return Response({"detail": "That pharmacy was not found."}, status=400)
        PatientPharmacy.objects.update_or_create(patient=patient, defaults={"pharmacy": ph, "updated_by": request.user})
        return Response({"pharmacy": rxs.pharmacy_json(ph)})


# ---------------------------------------------------------------- prescriber details


def _profile_json(user):
    prof = getattr(user, "prescriber_profile", None)
    return {
        "user": user.pk, "name": _name(user), "npi": user.npi,
        "license_number": getattr(prof, "license_number", ""), "license_state": getattr(prof, "license_state", ""),
        "dea_number": getattr(prof, "dea_number", ""), "practice_name": getattr(prof, "practice_name", ""),
        "address": getattr(prof, "address", ""), "phone": getattr(prof, "phone", ""), "fax": getattr(prof, "fax", ""),
        "ready": bool(rxs.npi_valid(user.npi) and prof and prof.license_number.strip()),
    }


class PrescriberProfileView(APIView):
    """GET / PUT ?user=<id> (default: yourself). Doctors edit their own; admins edit any doctor in the clinic."""

    permission_classes = [permissions.IsAuthenticated]

    def _target(self, request):
        denied = _need_staff(request)
        if denied:
            return None, denied
        uid = request.query_params.get("user") or request.user.pk
        target = CustomUser.objects.filter(pk=uid, role="doctor").first()
        if target is None:
            return None, Response({"detail": "Doctor not found."}, status=404)
        if request.user.role != "system_admin" and target.organization_id != request.user.organization_id:
            return None, Response({"detail": "Doctor not found."}, status=404)
        return target, None

    def get(self, request):
        target, err = self._target(request)
        return err or Response(_profile_json(target))

    def put(self, request):
        target, err = self._target(request)
        if err:
            return err
        if request.user.pk != target.pk and request.user.role not in rxs.ADMIN_ROLES:
            return Response({"detail": "Only the doctor or an administrator can change this."}, status=403)
        d = request.data
        if "npi" in d:
            npi = str(d.get("npi") or "").strip()
            if npi and not rxs.npi_valid(npi):
                return Response({"detail": "That NPI isn't valid (10 digits with a correct check digit)."}, status=400)
            target.npi = npi
            target.save(update_fields=["npi"])
        prof, _ = PrescriberProfile.objects.get_or_create(user=target)
        if "dea_number" in d:
            dea = str(d.get("dea_number") or "").strip().upper()
            if dea and not rxs.dea_valid(dea):
                return Response({"detail": "That DEA number isn't valid."}, status=400)
            prof.dea_number = dea
        for key, limit in (("license_number", 40), ("license_state", 2), ("practice_name", 200), ("address", 255), ("phone", 30), ("fax", 30)):
            if key in d:
                value = str(d.get(key) or "").strip()[:limit]
                setattr(prof, key, value.upper() if key == "license_state" else value)
        prof.save()
        target = CustomUser.objects.get(pk=target.pk)
        return Response(_profile_json(target))


# ---------------------------------------------------------------- favorites

FAVORITE_FIELDS = (
    "drug_name", "code_system", "code", "strength", "form", "dose", "route", "frequency", "duration_days", "prn", "prn_reason",
    "sig_extra", "quantity", "quantity_unit", "days_supply", "refills", "dispense_as_written", "indication_code",
    "indication_text", "note_to_pharmacist",
)


def serialize_favorite(fav):
    data = {key: getattr(fav, key) for key in FAVORITE_FIELDS}
    data["quantity"] = format(fav.quantity.normalize(), "f") if fav.quantity is not None else None
    data.update({
        "id": fav.pk,
        "label": fav.label or " ".join(x for x in (fav.drug_name, fav.strength) if x),
        "frequency_label": FREQUENCY_LABELS.get(fav.frequency, ""),
        "sig": rxs.build_sig(fav),
        "controlled": rxs.is_controlled(fav.drug_name),
    })
    return data


def _favorite_values(request, org, data):
    """Validated favorite fields from a request body, or from an existing prescription when {from_prescription} is given."""
    if data.get("from_prescription"):
        qs, _org = _scope(request)
        rx = qs.filter(pk=data["from_prescription"]).first()
        if rx is None:
            return None, Response({"detail": "Prescription not found."}, status=404)
        if rxs.is_controlled(rx.drug_name):
            return None, Response({"detail": rxs.CONTROLLED_MESSAGE}, status=400)
        values = {key: getattr(rx, key) for key in FAVORITE_FIELDS}
    else:
        body = {k: v for k, v in data.items() if k in FAVORITE_FIELDS}
        values, err = _clean_fields(request, org, body, creating=False)
        if err:
            return None, err
        if not values.get("drug_name"):
            return None, Response({"detail": "Choose the drug."}, status=400)
        values.pop("pharmacy", None)
        values.pop("prescriber", None)
    values["label"] = str(data.get("label") or "").strip()[:80]
    return values, None


def _favorite_org(request):
    org = _target_org(request) or getattr(request.user, "organization", None)
    if org is None:
        return None, Response({"detail": "Favorites belong to a clinic."}, status=400)
    return org, None


class PrescriptionFavoriteListCreateView(APIView):
    """Favorites are private to the person who saved them."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        qs = PrescriptionFavorite.objects.filter(owner=request.user)
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(Q(drug_name__icontains=term) | Q(label__icontains=term))
        return Response({"results": [serialize_favorite(f) for f in qs]})

    def post(self, request):
        denied = _need_staff(request)
        if denied:
            return denied
        org, err = _favorite_org(request)
        if err:
            return err
        values, err = _favorite_values(request, org, request.data)
        if err:
            return err
        same = {k: v for k, v in values.items() if k not in ("label", "indication_code", "indication_text", "note_to_pharmacist", "sig_extra")}
        for existing in PrescriptionFavorite.objects.filter(owner=request.user, drug_name__iexact=values["drug_name"]):
            if all(getattr(existing, k) == v for k, v in same.items()):
                return Response({"detail": "That is already one of your favorites."}, status=409)
        fav = PrescriptionFavorite.objects.create(organization=org, owner=request.user, **values)
        return Response(serialize_favorite(fav), status=201)


class PrescriptionFavoriteDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        denied = _need_staff(request)
        if denied:
            return None, denied
        fav = PrescriptionFavorite.objects.filter(pk=pk, owner=request.user).first()
        if fav is None:
            return None, Response({"detail": "Favorite not found."}, status=404)
        return fav, None

    def patch(self, request, pk):
        fav, err = self._get(request, pk)
        if err:
            return err
        if "label" in request.data:
            fav.label = str(request.data.get("label") or "").strip()[:80]
            fav.save(update_fields=["label"])
        return Response(serialize_favorite(fav))

    def delete(self, request, pk):
        fav, err = self._get(request, pk)
        if err:
            return err
        fav.delete()
        return Response(status=204)
