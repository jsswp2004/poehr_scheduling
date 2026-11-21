"""
POWER Pharmacy API (mounted at /api/pharmacy/, gated by the "pharmacy" module):

    GET  patients/                    patients with medication orders to verify or verified, or open prescriptions
    GET  queue/?status=&care=&q=      the verification queue (STAT first, then oldest), with counts per status
    GET  orders/<id>/                 one medication order with its alerts and interventions (the Verify dialog)
    POST orders/<id>/action/          {action: verify|modify|clarify|reject, reason, new_value, note, acknowledged_alerts}
    GET  med-profile/<patient_id>/    the patient's medication profile

Read: pharmacist, pharmacy assistant, admin, system admin. Act: pharmacist, admin, system admin.
"""

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.inbox import _care
from appointments.models import HomeMedication, Order, PatientAllergy, PatientAllergyStatus, Prescription
from appointments.patient_header import _target_org
from appointments.prescriptions import STATUS_LABELS as RX_STATUS_LABELS
from poehr_scheduling_backend.tenancy import sees_all_orgs
from users.facility_scope import visit_facility_q
from users.models import CustomUser, Registration

from . import services as svc
from .dangerous_drugs import is_dangerous_drug
from .models import PharmacyIntervention

ORDER_RELATED = ("patient", "orderable", "ordering_provider", "verified_by")
CARE_LABELS = dict(Registration.CARE_SETTING_CHOICES)
QUEUE_TABS = ("pending_verification", "on_hold_clarify", "verified", "rejected")
MAX_ROWS = 300


def _denied(request):
    if getattr(request.user, "role", None) not in svc.READ_ROLES:
        return Response({"detail": "Not allowed."}, status=403)
    return None


def _org_or_error(request):
    org = _target_org(request, request.query_params.get("org"))
    if org is None and not sees_all_orgs(request.user):
        return None, Response({"detail": "Choose a clinic."}, status=400)
    return org, None


def _orders(request, org, include_rejected=False):
    """Open medication orders; with include_rejected, also the ones pharmacy rejected (they are cancelled)."""
    open_orders = Q(status__in=svc.ACTIVE_ORDER_STATUSES)
    if include_rejected:
        open_orders |= Q(status="cancelled", pharmacy_status="rejected")
    qs = Order.objects.filter(open_orders, orderable_category="medication")
    if org is not None:
        qs = qs.filter(organization=org)
    q = visit_facility_q(request.user, "patient__patient_profile__registrations__")
    if q is not None:
        qs = qs.filter(q).distinct()
    return qs.select_related(*ORDER_RELATED)


def _rank(order):
    return (svc.PRIORITY_RANK.get(order.priority, 9), svc.waiting_since(order))


def _visits(patient_ids):
    """{patient user id: latest open (else latest) visit}."""
    out, open_seen = {}, set()
    rows = (
        Registration.objects.filter(patient__user_id__in=patient_ids)
        .select_related("facility", "unit", "room", "bed", "patient")
        .order_by("-id")
    )
    for r in rows:
        uid = r.patient.user_id
        if uid not in out:
            out[uid] = r
        if r.discharge_datetime is None and uid not in open_seen:
            open_seen.add(uid)
            out[uid] = r
    return out


def _location(visit, org):
    if visit is None:
        return org.name if org else ""
    return visit.location_path() or visit.assigned_location or (org.name if org else "")


def _allergies(patient_ids):
    out = {}
    for a in PatientAllergy.objects.filter(patient_id__in=patient_ids, status="active").order_by("substance", "id"):
        out.setdefault(a.patient_id, []).append({"substance": a.substance, "reaction": a.reaction, "severity": a.severity})
    return out


def _nka(patient_ids):
    return set(PatientAllergyStatus.objects.filter(patient_id__in=patient_ids, no_known_allergies=True).values_list("patient_id", flat=True))


class PharmacyPatientListView(APIView):
    """GET -> {results: [...]}: one row per patient with pharmacy work."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        org, err = _org_or_error(request)
        if err:
            return err
        now = timezone.now()
        orders = list(_orders(request, org).exclude(pharmacy_status__in=("", "rejected")))
        rx_qs = Prescription.objects.exclude(status="cancelled")
        if org is not None:
            rx_qs = rx_qs.filter(organization=org)
        rx_counts = dict(rx_qs.values_list("patient_id").annotate(n=Count("id")).values_list("patient_id", "n"))
        ids = {o.patient_id for o in orders} | set(rx_counts)
        patients = {u.pk: u for u in CustomUser.objects.filter(pk__in=ids, role="patient").select_related("patient_profile")}
        visits, allergy_map, nka = _visits(list(patients)), _allergies(list(patients)), _nka(list(patients))
        care_filter = request.query_params.get("care") or ""
        term = (request.query_params.get("q") or "").strip().lower()
        by_patient = {}
        for o in orders:
            by_patient.setdefault(o.patient_id, []).append(o)

        rows = []
        for pid, patient in patients.items():
            visit = visits.get(pid)
            care = (visit.care_setting if visit else "") or "ambulatory"
            if care_filter and care != care_filter:
                continue
            name = svc.name_of(patient)
            profile = getattr(patient, "patient_profile", None)
            mrn = getattr(profile, "mrn", "") or ""
            if term and term not in name.lower() and term not in mrn.lower():
                continue
            mine = by_patient.get(pid, [])
            renal = svc.renal_info(patient)
            pending = [o for o in mine if o.pharmacy_status == "pending_verification"]
            dangerous = any(is_dangerous_drug(f"{svc.drug_names(o.orderable_name, o.orderable)['generic']} {o.orderable_name}", o.orderable) for o in mine)
            rows.append({
                "id": pid,
                "name": name,
                "mrn": mrn,
                "age": renal["age"],
                "sex": renal["sex"],
                "care_setting": care,
                "care_setting_label": CARE_LABELS.get(care, ""),
                "location": _location(visit, org),
                "visit_id": visit.pk if visit else None,
                "weight_kg": renal["weight_kg"],
                "scr": renal["scr"],
                "scr_units": renal["scr_units"],
                "crcl": renal["crcl"],
                "crcl_note": renal["crcl_note"],
                "allergies": allergy_map.get(pid, []),
                "no_known_allergies": pid in nka,
                "counts": {
                    "pending": len(pending),
                    "on_hold": sum(1 for o in mine if o.pharmacy_status == "on_hold_clarify"),
                    "verified": sum(1 for o in mine if o.pharmacy_status == "verified"),
                    "prescriptions": rx_counts.get(pid, 0),
                },
                "flags": {
                    "past_goal": any(svc.past_goal(o, now) for o in mine),
                    "stat": any(o.priority == "stat" and o.pharmacy_status in svc.QUEUE_STATUSES for o in mine),
                    "renal": renal["renal_flag"],
                    "dangerous_drug": dangerous,
                    "allergy": bool(allergy_map.get(pid)),
                },
            })
        rows.sort(key=lambda r: (not r["flags"]["past_goal"], -r["counts"]["pending"], r["name"].lower()))
        return Response({"count": len(rows), "results": rows[:MAX_ROWS]})


class VerificationQueueView(APIView):
    """GET ?status=pending_verification|on_hold_clarify|verified|rejected|all&care=&q=&patient=[&summary=1] -> rows and counts."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        org, err = _org_or_error(request)
        if err:
            return err
        p = request.query_params
        qs = _orders(request, org, include_rejected=True).exclude(pharmacy_status="")
        if p.get("patient"):
            qs = qs.filter(patient_id=p["patient"])
        if p.get("q"):
            term = p["q"].strip()
            qs = qs.filter(Q(orderable_name__icontains=term) | Q(orderable__generic_name__icontains=term)
                           | Q(orderable__brand_name__icontains=term) | Q(patient__first_name__icontains=term)
                           | Q(patient__last_name__icontains=term))
        rows = list(qs[:2000])
        care_filter = p.get("care") or ""
        cares = _care({o.patient_id for o in rows})
        if care_filter:
            rows = [o for o in rows if (cares.get(o.patient_id) or "ambulatory") == care_filter]
        now = timezone.now()
        counts = {key: sum(1 for o in rows if o.pharmacy_status == key) for key in QUEUE_TABS}
        counts["past_goal"] = sum(1 for o in rows if svc.past_goal(o, now))
        if p.get("summary"):  # the chart tab badge only needs the counts
            return Response({"counts": counts})
        wanted = p.get("status") or "pending_verification"
        if wanted != "all":
            rows = [o for o in rows if o.pharmacy_status == wanted]
        rows.sort(key=_rank)
        renal_cache = {}
        out = []
        for o in rows[:MAX_ROWS]:
            if o.patient_id not in renal_cache:
                renal_cache[o.patient_id] = svc.renal_info(o.patient)
            data = svc.serialize_order(o, now, svc.cds_alerts(o, renal_cache[o.patient_id]))
            data["care_setting"] = cares.get(o.patient_id) or "ambulatory"
            data["care_setting_label"] = CARE_LABELS.get(data["care_setting"], "")
            out.append(data)
        return Response({"counts": counts, "count": len(out), "results": out, "can_verify": request.user.role in svc.VERIFY_ROLES})


def _order_for(request, pk):
    org = _target_org(request, request.query_params.get("org"))
    qs = Order.objects.filter(pk=pk, orderable_category="medication").select_related(*ORDER_RELATED)
    if not sees_all_orgs(request.user):
        qs = qs.filter(organization=org) if org is not None else qs.none()
    return qs.first()


class PharmacyOrderView(APIView):
    """GET one medication order with its alerts, the patient's renal data and the interventions so far."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        denied = _denied(request)
        if denied:
            return denied
        order = _order_for(request, pk)
        if order is None:
            return Response({"detail": "Order not found."}, status=404)
        renal = svc.renal_info(order.patient)
        data = svc.serialize_order(order, alerts=svc.cds_alerts(order, renal))
        data["renal"] = renal
        data["interventions"] = [svc.serialize_intervention(i) for i in order.pharmacy_interventions.select_related("pharmacist")]
        data["can_verify"] = request.user.role in svc.VERIFY_ROLES and order.pharmacy_status in svc.QUEUE_STATUSES
        return Response(data)


class PharmacyOrderActionView(APIView):
    """POST {action, reason, new_value, note, acknowledged_alerts} -> the order after the action."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in svc.VERIFY_ROLES:
            return Response({"detail": "Only a pharmacist can verify medication orders."}, status=403)
        order = _order_for(request, pk)
        if order is None:
            return Response({"detail": "Order not found."}, status=404)
        try:
            order, intervention = svc.act(order, request.user, str(request.data.get("action") or ""), request.data)
        except svc.PharmacyError as exc:
            return Response({"detail": exc.message, **exc.extra}, status=exc.status_code)
        order = Order.objects.select_related(*ORDER_RELATED).get(pk=order.pk)
        data = svc.serialize_order(order)
        data["intervention"] = svc.serialize_intervention(intervention) if intervention else None
        return Response(data)


class MedProfileView(APIView):
    """GET the patient's medication profile: medication orders, prescriptions, home medications, allergies, renal data."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        denied = _denied(request)
        if denied:
            return denied
        patient = CustomUser.objects.filter(pk=patient_id, role="patient").select_related("patient_profile").first()
        if patient is None or (not sees_all_orgs(request.user) and patient.organization_id != request.user.organization_id):
            return Response({"detail": "Patient not found."}, status=404)
        now = timezone.now()
        renal = svc.renal_info(patient)
        since = now - timedelta(days=30)
        orders = (
            Order.objects.filter(patient=patient, orderable_category="medication")
            .exclude(status="draft")
            .filter(Q(status__in=svc.ACTIVE_ORDER_STATUSES) | Q(updated_at__gte=since))
            .select_related(*ORDER_RELATED)
        )
        orders = sorted(orders, key=lambda o: (o.status not in svc.ACTIVE_ORDER_STATUSES, _rank(o)))
        rxs = Prescription.objects.filter(patient=patient).exclude(status="cancelled").select_related("prescriber").order_by("-created_at")[:100]
        home = HomeMedication.objects.filter(patient=patient).order_by("status", "drug_name")[:100]
        interventions = PharmacyIntervention.objects.filter(order__patient=patient).select_related("pharmacist")[:50]
        dispensed = (
            PrescriptionFill.objects.filter(patient=patient, stage="dispensed")
            .select_related("prescription", "prescription__prescriber", "patient", "dispensed_by", "checked_by",
                            "received_by", "entered_by", "filled_by")
            .order_by("-dispensed_at")[:100]
        )
        allergy_rows = PatientAllergy.objects.filter(patient=patient, status="active").order_by("substance", "id")
        return Response({
            "patient": {"id": patient.pk, "name": svc.name_of(patient), "mrn": getattr(getattr(patient, "patient_profile", None), "mrn", "")},
            "renal": renal,
            "allergies": [{"substance": a.substance, "reaction": a.reaction, "severity": a.severity} for a in allergy_rows],
            "no_known_allergies": PatientAllergyStatus.objects.filter(patient=patient, no_known_allergies=True).exists(),
            "orders": [svc.serialize_order(o, now, svc.cds_alerts(o, renal)) for o in orders],
            "prescriptions": [
                {
                    "id": rx.pk,
                    "drug": svc.drug_names(rx.drug_name),
                    "dangerous_drug": is_dangerous_drug(rx.drug_name),
                    "strength": rx.strength,
                    "form": rx.form,
                    "sig": rx.sig or " ".join(x for x in (rx.dose, rx.route, rx.frequency) if x),
                    "status": rx.status,
                    "status_label": RX_STATUS_LABELS.get(rx.status, rx.status),
                    "prescriber": svc.name_of(rx.prescriber),
                    "created_at": rx.created_at.isoformat(),
                }
                for rx in rxs
            ],
            "home_medications": [
                {
                    "id": h.pk,
                    "drug": svc.drug_names(h.drug_name),
                    "dangerous_drug": is_dangerous_drug(h.drug_name),
                    "strength": h.strength,
                    "dose": h.dose,
                    "route": h.route,
                    "frequency": h.frequency,
                    "status": h.status,
                }
                for h in home
            ],
            "interventions": [svc.serialize_intervention(i) for i in interventions],
            # Phase 2: what the in-house pharmacy has dispensed to this patient
            "dispensing": [fx.serialize_fill(f) for f in dispensed],
            # Phase 3: what partner pharmacies (POWER Pharmacy Portal) dispensed, with the actual product
            "portal_dispensing": pt.portal_dispensing_for(patient),
        })


# --------------------------------------------------------------------------------------------- Phase 2
# In-house outpatient fill (see fills.py):
#
#     GET  fills/?stage=&q=                  the fill queue, with counts per stage
#     GET  fills/<id>/                       one fill, its price quote, the patient's senior / PWD IDs, its history
#     POST fills/<id>/action/                {action: start_entry|enter|fill|check|check_fail|dispense|hold|release, ...}
#     POST fills/<id>/complete-partial/      start a fill for the balance of a partial fill
#     GET  fills/<id>/label/                 what the label prints
#     POST prescriptions/<rx_id>/refill/     start the next refill (never a dangerous drug)
#     GET/POST prices/, PATCH/DELETE prices/<id>/                       the clinic's price table (PHP)
#     GET/POST patients/<id>/discount-ids/, PATCH discount-ids/<id>/     senior citizen / PWD IDs on file

from decimal import Decimal, InvalidOperation  # noqa: E402

from . import fills as fx  # noqa: E402
from .models import PatientDiscountId, PharmacyPrice, PrescriptionFill  # noqa: E402

FILL_RELATED = ("prescription", "prescription__prescriber", "prescription__pharmacy", "patient",
                "received_by", "entered_by", "filled_by", "checked_by", "dispensed_by")


def _fill_error(exc):
    return Response({"detail": exc.message}, status=exc.status_code)


def _fill_for(request, pk):
    org = _target_org(request, request.query_params.get("org"))
    qs = PrescriptionFill.objects.filter(pk=pk).select_related(*FILL_RELATED)
    if not sees_all_orgs(request.user):
        qs = qs.filter(organization=org) if org is not None else qs.none()
    return qs.first()


class FillQueueView(APIView):
    """GET ?stage=received|data_entry|filling|final_check|ready|dispensed|on_hold|all&q=[&summary=1] -> {counts, results}."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        org, err = _org_or_error(request)
        if err:
            return err
        fx.ensure_fills(org)
        stage = request.query_params.get("stage") or "received"
        if stage not in fx.STAGE_LABELS and stage != "all":
            return Response({"detail": "Unknown stage."}, status=400)
        counts, rows = fx.queue(org, None if stage == "all" else stage, (request.query_params.get("q") or "").strip())
        if request.query_params.get("summary"):
            return Response({"counts": counts})
        role = request.user.role
        return Response({
            "counts": counts,
            "results": [fx.serialize_fill(f) for f in rows],
            "stages": [{"value": k, "label": v} for k, v in fx.FILL_STAGES],
            "can_work": role in fx.FILL_ROLES,
            "can_check": role in fx.CHECK_ROLES,
            "can_price": role in fx.PRICE_ROLES,
        })


class FillDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        denied = _denied(request)
        if denied:
            return denied
        fill = _fill_for(request, pk)
        if fill is None:
            return Response({"detail": "Fill not found."}, status=404)
        data = fx.serialize_fill(fill, detail=True)
        role = request.user.role
        data.update({
            "can_work": role in fx.FILL_ROLES,
            "can_check": role in fx.CHECK_ROLES,
            "can_price": role in fx.PRICE_ROLES,
            "can_dispense": role in (fx.DANGEROUS_DISPENSE_ROLES if data["dangerous_drug"] else fx.DISPENSE_ROLES),
            "my_prc_license": fx.pharmacist_license(request.user),
            "filled_by_me": fill.filled_by_id == request.user.pk,
        })
        return Response(data)


class FillActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        fill = _fill_for(request, pk)
        if fill is None:
            return Response({"detail": "Fill not found."}, status=404)
        try:
            fill = fx.act(fill, request.user, str(request.data.get("action") or ""), request.data)
        except fx.FillError as exc:
            return _fill_error(exc)
        return Response(fx.serialize_fill(PrescriptionFill.objects.select_related(*FILL_RELATED).get(pk=fill.pk), detail=True))


class FillCompletePartialView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        fill = _fill_for(request, pk)
        if fill is None:
            return Response({"detail": "Fill not found."}, status=404)
        try:
            new = fx.complete_partial(fill, request.user)
        except fx.FillError as exc:
            return _fill_error(exc)
        return Response(fx.serialize_fill(new, detail=True), status=201)


class FillLabelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        denied = _denied(request)
        if denied:
            return denied
        fill = _fill_for(request, pk)
        if fill is None:
            return Response({"detail": "Fill not found."}, status=404)
        if fill.stage not in ("final_check", "ready", "dispensed"):
            return Response({"detail": "The label is printed once the fill has been filled."}, status=409)
        return Response(fx.label_data(fill))


class PrescriptionRefillView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, rx_id):
        org = _target_org(request, request.query_params.get("org"))
        qs = Prescription.objects.filter(pk=rx_id)
        if not sees_all_orgs(request.user):
            qs = qs.filter(organization=org) if org is not None else qs.none()
        rx = qs.first()
        if rx is None:
            return Response({"detail": "Prescription not found."}, status=404)
        try:
            new = fx.refill(rx, request.user)
        except fx.FillError as exc:
            return _fill_error(exc)
        return Response(fx.serialize_fill(new, detail=True), status=201)


def _price_json(p):
    return {"id": p.pk, "drug_name": p.drug_name, "unit": p.unit, "unit_price": format(p.unit_price, "f"),
            "vat_exempt": p.vat_exempt, "is_active": p.is_active, "currency": "PHP"}


def _price_values(data, partial):
    values = {}
    if "drug_name" in data or not partial:
        name = str(data.get("drug_name") or "").strip()[:200]
        if not name:
            return None, "Give the drug name."
        values["drug_name"] = name
    if "unit" in data:
        values["unit"] = str(data.get("unit") or "").strip()[:30]
    if "unit_price" in data or not partial:
        try:
            price = Decimal(str(data.get("unit_price")).strip())
        except (InvalidOperation, ValueError, TypeError):
            return None, "The unit price must be a number of pesos."
        if price < 0:
            return None, "The unit price can't be negative."
        values["unit_price"] = price.quantize(Decimal("0.01"))
    for key in ("vat_exempt", "is_active"):
        if key in data:
            values[key] = bool(data.get(key))
    return values, None


class PriceListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        org, err = _org_or_error(request)
        if err:
            return err
        qs = PharmacyPrice.objects.all() if org is None else PharmacyPrice.objects.filter(organization=org)
        return Response({"results": [_price_json(p) for p in qs], "can_edit": request.user.role in fx.PRICE_ROLES})

    def post(self, request):
        if request.user.role not in fx.PRICE_ROLES:
            return Response({"detail": "Only a pharmacist or an administrator can change prices."}, status=403)
        org = _target_org(request, request.query_params.get("org"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        values, err = _price_values(request.data, partial=False)
        if err:
            return Response({"detail": err}, status=400)
        p = PharmacyPrice.objects.create(organization=org, updated_by=request.user, **values)
        return Response(_price_json(p), status=201)


class PriceDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, pk):
        if request.user.role not in fx.PRICE_ROLES:
            return None, Response({"detail": "Only a pharmacist or an administrator can change prices."}, status=403)
        qs = PharmacyPrice.objects.filter(pk=pk)
        if not sees_all_orgs(request.user):
            qs = qs.filter(organization_id=request.user.organization_id)
        p = qs.first()
        return (p, None) if p else (None, Response({"detail": "Price not found."}, status=404))

    def patch(self, request, pk):
        p, err = self._get(request, pk)
        if err:
            return err
        values, msg = _price_values(request.data, partial=True)
        if msg:
            return Response({"detail": msg}, status=400)
        for k, v in values.items():
            setattr(p, k, v)
        p.updated_by = request.user
        p.save()
        return Response(_price_json(p))

    def delete(self, request, pk):
        p, err = self._get(request, pk)
        if err:
            return err
        p.delete()
        return Response(status=204)


def _card_json(c):
    return {"id": c.pk, "kind": c.kind, "kind_label": c.get_kind_display(), "id_number": c.id_number,
            "issued_by": c.issued_by, "is_active": c.is_active, "created_at": c.created_at.isoformat()}


class PatientDiscountIdsView(APIView):
    """Senior citizen (RA 9994) and PWD (RA 10754) IDs on file for a patient."""

    permission_classes = [permissions.IsAuthenticated]

    def _patient(self, request, patient_id):
        patient = CustomUser.objects.filter(pk=patient_id, role="patient").first()
        if patient is None or (not sees_all_orgs(request.user) and patient.organization_id != request.user.organization_id):
            return None
        return patient

    def get(self, request, patient_id):
        denied = _denied(request)
        if denied:
            return denied
        patient = self._patient(request, patient_id)
        if patient is None:
            return Response({"detail": "Patient not found."}, status=404)
        return Response({"results": [_card_json(c) for c in PatientDiscountId.objects.filter(patient=patient)]})

    def post(self, request, patient_id):
        if request.user.role not in fx.FILL_ROLES:
            return Response({"detail": "Only pharmacy staff can record an ID."}, status=403)
        patient = self._patient(request, patient_id)
        if patient is None:
            return Response({"detail": "Patient not found."}, status=404)
        kind = str(request.data.get("kind") or "")
        number = str(request.data.get("id_number") or "").strip()[:40]
        if kind not in dict(PatientDiscountId.KIND_CHOICES):
            return Response({"detail": "Choose senior citizen or PWD."}, status=400)
        if not number:
            return Response({"detail": "Enter the ID number."}, status=400)
        card = PatientDiscountId.objects.create(
            organization_id=patient.organization_id, patient=patient, kind=kind, id_number=number,
            issued_by=str(request.data.get("issued_by") or "").strip()[:120], recorded_by=request.user,
        )
        return Response(_card_json(card), status=201)


class DiscountIdDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in fx.FILL_ROLES:
            return Response({"detail": "Only pharmacy staff can change an ID."}, status=403)
        qs = PatientDiscountId.objects.filter(pk=pk)
        if not sees_all_orgs(request.user):
            qs = qs.filter(patient__organization_id=request.user.organization_id)
        card = qs.first()
        if card is None:
            return Response({"detail": "ID not found."}, status=404)
        if "is_active" in request.data:
            card.is_active = bool(request.data.get("is_active"))
            card.save(update_fields=["is_active"])
        return Response(_card_json(card))


# --------------------------------------------------------------------------------------------- Phase 3
# Clinic side of the POWER Pharmacy Portal:
#
#     GET  network/                         partner pharmacies (POWER administrators see every status)
#     POST network/<id>/status/             {action: approve|suspend|reinstate, reason}   (POWER administrators)
#     POST network/<id>/add-to-directory/   put an approved partner in this clinic's pharmacy directory
#     GET  portal-requests/?prescription=   a prescription's pharmacy requests
#     POST portal-requests/<id>/respond/    {decision: approved|denied, response}   (the prescriber or an admin)

from appointments import prescriptions as _rxs  # noqa: E402
from appointments.models import Pharmacy as _Pharmacy  # noqa: E402

from . import portal as pt  # noqa: E402
from .models import PartnerDirectoryLink, PartnerPharmacy, PortalRequest  # noqa: E402

NETWORK_ROLES = tuple(dict.fromkeys(_rxs.DRAFT_ROLES + svc.READ_ROLES))


class PartnerNetworkView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in NETWORK_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        qs = PartnerPharmacy.objects.prefetch_related("staff")
        if request.user.role != "system_admin":
            qs = qs.filter(status="approved")
        org = _target_org(request, request.query_params.get("org"))
        linked = set(PartnerDirectoryLink.objects.filter(pharmacy__organization=org).values_list("partner_id", flat=True)) if org else set()
        rows = []
        for p in qs:
            data = pt.serialize_partner(p)
            data["in_directory"] = p.pk in linked
            if request.user.role != "system_admin":
                data.pop("pharmacists")
            rows.append(data)
        return Response({"results": rows, "can_approve": request.user.role == "system_admin"})


class PartnerStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        partner = PartnerPharmacy.objects.filter(pk=pk).first()
        if partner is None:
            return Response({"detail": "Pharmacy not found."}, status=404)
        try:
            partner = pt.set_status(request.user, partner, str(request.data.get("action") or ""), request.data.get("reason"))
        except pt.PortalError as exc:
            return Response({"detail": exc.message}, status=exc.status_code)
        return Response(pt.serialize_partner(partner))


class PartnerAddToDirectoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in NETWORK_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        org = _target_org(request, request.query_params.get("org"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        partner = PartnerPharmacy.objects.filter(pk=pk).first()
        if partner is None or pt.partner_problem(partner):
            return Response({"detail": "Only an approved portal pharmacy with a valid LTO can be added."}, status=409)
        link = PartnerDirectoryLink.objects.filter(partner=partner, pharmacy__organization=org).select_related("pharmacy").first()
        if link is None:
            ph = _Pharmacy.objects.create(organization=org, name=partner.name, address=partner.address, city=partner.city,
                                          phone=partner.phone, fda_lto_number=partner.fda_lto_number)
            link = PartnerDirectoryLink.objects.create(pharmacy=ph, partner=partner)
        return Response(_rxs.pharmacy_json(link.pharmacy), status=201)


class PortalRequestListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in NETWORK_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        qs = PortalRequest.objects.select_related("portal__prescription", "partner", "created_by", "responded_by")
        if request.user.role != "system_admin":
            qs = qs.filter(portal__prescription__organization_id=request.user.organization_id)
        if request.query_params.get("prescription"):
            qs = qs.filter(portal__prescription_id=request.query_params["prescription"])
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return Response({"results": [pt.serialize_request(r) for r in qs[:200]]})


class PortalRequestRespondView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        req = PortalRequest.objects.filter(pk=pk).select_related("portal__prescription").first()
        if req is None or (request.user.role != "system_admin" and req.portal.prescription.organization_id != request.user.organization_id):
            return Response({"detail": "Request not found."}, status=404)
        try:
            req = pt.respond(request.user, req, str(request.data.get("decision") or ""), request.data.get("response"))
        except pt.PortalError as exc:
            return Response({"detail": exc.message}, status=exc.status_code)
        except _rxs.RxError as exc:
            return Response({"detail": str(exc)}, status=getattr(exc, "status_code", 400))
        return Response(pt.serialize_request(req))


class PortalRerouteView(APIView):
    """POST {pharmacy: directory id} -> send a declined prescription to another portal pharmacy.
    POST {new_code: true} -> give it a new claim code so any approved pharmacy can claim it."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, rx_id):
        rx = Prescription.objects.filter(pk=rx_id).first()
        if rx is None or (request.user.role != "system_admin" and rx.organization_id != request.user.organization_id):
            return Response({"detail": "Prescription not found."}, status=404)
        if request.user.role not in pt.RESPOND_ROLES or (request.user.role == "doctor" and rx.prescriber_id != request.user.pk):
            return Response({"detail": "Only the prescriber or an administrator can do this."}, status=403)
        try:
            if request.data.get("new_code"):
                pt.release_for_claim(request.user, rx)
            else:
                pharmacy = _Pharmacy.objects.filter(pk=request.data.get("pharmacy"), organization_id=rx.organization_id).first()
                if pharmacy is None:
                    return Response({"detail": "Choose a portal pharmacy from your directory."}, status=400)
                pt.reroute(request.user, rx, pharmacy)
        except pt.PortalError as exc:
            return Response({"detail": exc.message}, status=exc.status_code)
        rx.refresh_from_db()
        return Response({"claim_code": rx.claim_code, "portal": pt.portal_summary(rx)})


class PortalAccessLogView(APIView):
    """GET ?user=&pharmacy=&action=&prescription=&date_from=&date_to=[&export=csv] -- POWER administrators only (RA 10173)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        import csv

        from django.http import HttpResponse
        from django.utils.dateparse import parse_date

        from .models import PortalAccessLog

        if request.user.role != "system_admin":
            return Response({"detail": "Only a POWER administrator can see the portal access log."}, status=403)
        p = request.query_params
        qs = PortalAccessLog.objects.select_related("user", "partner")
        if p.get("user"):
            qs = qs.filter(Q(user__username__icontains=p["user"]) | Q(user__last_name__icontains=p["user"]))
        if p.get("pharmacy"):
            qs = qs.filter(partner_id=p["pharmacy"])
        if p.get("action"):
            qs = qs.filter(action__icontains=p["action"])
        if p.get("prescription"):
            qs = qs.filter(prescription_id=str(p["prescription"]).upper().replace("RX-", "").lstrip("0") or 0)
        if parse_date(p.get("date_from") or ""):
            qs = qs.filter(created_at__date__gte=parse_date(p["date_from"]))
        if parse_date(p.get("date_to") or ""):
            qs = qs.filter(created_at__date__lte=parse_date(p["date_to"]))
        rows = [
            {"id": e.pk, "at": e.created_at.isoformat(), "user": e.user.username, "name": svc.name_of(e.user),
             "pharmacy": e.partner.name if e.partner_id else "", "action": e.action,
             "prescription": f"RX-{e.prescription_id:06d}" if e.prescription_id else "", "ip": e.ip, "detail": e.detail}
            for e in qs[:5000 if p.get("export") == "csv" else 500]
        ]
        if p.get("export") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="portal-access-log.csv"'
            writer = csv.writer(response)
            writer.writerow(["When", "Username", "Name", "Pharmacy", "Action", "Prescription", "IP", "Detail"])
            for r in rows:
                writer.writerow([r["at"], r["user"], r["name"], r["pharmacy"], r["action"], r["prescription"], r["ip"], r["detail"]])
            return response
        return Response({"results": rows, "retention_days": pt.access_log_retention_days()})
