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


def _orders(request, org):
    qs = Order.objects.filter(orderable_category="medication", status__in=svc.ACTIVE_ORDER_STATUSES)
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
    """GET ?status=pending_verification|on_hold_clarify|verified|rejected|all&care=&q=&patient= -> rows and counts."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        org, err = _org_or_error(request)
        if err:
            return err
        p = request.query_params
        qs = _orders(request, org).exclude(pharmacy_status="")
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
        })
