"""
Vaccine Manager API (all under /api/vaccine-manager/).

    GET  patient/<id>/                          what is due, history, risk schedules and suggestions
    POST patient/<id>/doses/                    record one dose, or several given at the same visit ({"doses": [...]})
    POST patient/<id>/not-done/                 record a decision not to give a vaccine
    POST doses/<record_id>/void/                mark a record entered in error (records are never deleted)
    POST patient/<id>/risk-schedules/           put the patient on a risk schedule (confirm a suggestion or add by hand)
    POST patient/<id>/risk-schedules/<id>/      {"action": "dismiss" | "end"}
    GET  catalog/                               vaccines, products and dictionaries for the forms

Viewing needs immunizations.view; recording, voiding and managing a patient's risk schedules need immunizations.record.
Everything is limited to the staff member's own organization.
"""

import datetime

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.rights import user_has_right

from . import immunization_engine as engine
from . import immunization_service as service
from .models import (
    ImmunizationEvent,
    ImmunizationItem,
    ImmunizationSchedule,
    LookupEntry,
    PatientImmunization,
    PatientSchedule,
    ProblemListEntry,
)
from .patient_header import _patient_for

STATUS_LABELS = {
    engine.OVERDUE: "Overdue", engine.DUE: "Due now", engine.NEAR_DUE: "Near due", engine.REVIEW: "Needs review",
    engine.FUTURE: "Future", engine.DONE: "Done", engine.NOT_DONE: "Not done", engine.AGED_OUT: "Aged out",
}
PROBLEM_TEXT = {
    "no_dob": "This patient has no date of birth on file, so nothing can be recommended.",
    "future_dob": "The date of birth is in the future. Correct it in the registration.",
    "no_schedule": "No approved schedule applies to this patient's age. An administrator must approve one.",
    "schedule_clash": "More than one approved schedule applies to this age. An administrator must retire all but one.",
}
LOOKUP_FIELDS = {
    "manufacturer": "manufacturer", "eligibility_code": "eligibility_code", "lot_source": "lot_source",
    "packaging_type": "packaging_type", "historical_source": "historical_source",
}
TEXT_LIMITS = {"lot_number": 60, "dose_amount": 40, "route": 40, "site": 60, "notes": 2000}
REASONS = dict(PatientImmunization.REASON_CHOICES)


class VaccineError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def _right(request, code):
    return user_has_right(request.user, code)


def _iso(value):
    return value.isoformat() if value else None


def _name(user):
    if not user:
        return ""
    return (f"{user.first_name} {user.last_name}".strip() or user.username)


def _date(value, label, required=False):
    if value in (None, ""):
        if required:
            raise VaccineError(f"{label} is required.")
        return None
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        raise VaccineError(f"{label} must be a date.")


def _org_items(org):
    return ImmunizationItem.objects.filter(active=True).filter(Q(organization=org) | Q(organization__isnull=True))


def _lookup(org, dictionary, pk, label):
    if pk in (None, ""):
        return None
    entry = (LookupEntry.objects.filter(pk=pk, dictionary=dictionary, active=True)
             .filter(Q(organization=org) | Q(organization__isnull=True)).first())
    if entry is None:
        raise VaccineError(f"{label} is not a valid choice.")
    return entry


def _audit(record, action, user, fields=()):
    ImmunizationEvent.objects.create(
        organization=record.organization, record=record, patient_id=record.patient_id, action=action,
        changed_fields=list(fields), user=user,
    )


def serialize_recommendation(rec):
    return {
        "item": rec.item_code, "name": rec.name, "kind": rec.kind, "status": rec.status,
        "status_label": STATUS_LABELS[rec.status], "why": rec.why,
        "last_done": _iso(rec.last_done), "next_due": _iso(rec.next_due),
        "dose_number": rec.dose_number, "dose_count": rec.dose_count, "doses": rec.doses, "rule_id": rec.rule_id,
    }


def serialize_record(rec):
    return {
        "id": rec.pk, "item": rec.item.code, "item_name": rec.item.display_name or rec.item.name,
        "status": rec.status, "dose_number": rec.dose_number, "source": rec.source,
        "given_on": _iso(rec.given_on), "given_time": rec.given_time.strftime("%H:%M") if rec.given_time else None,
        "product": rec.product.short_name if rec.product_id else "", "cvx": rec.product.cvx_code if rec.product_id else "",
        "manufacturer": rec.manufacturer.name if rec.manufacturer_id else "",
        "lot_number": rec.lot_number, "expiration_date": _iso(rec.expiration_date),
        "dose_amount": rec.dose_amount, "route": rec.route, "site": rec.site,
        "vis_given": rec.vis_given, "screening_reviewed": rec.screening_reviewed,
        "not_done_reason": rec.not_done_reason, "not_done_reason_label": REASONS.get(rec.not_done_reason, ""),
        "offer_again_on": _iso(rec.offer_again_on), "notes": rec.notes,
        "given_by": _name(rec.given_by) if rec.given_by_id else "",
        "entered_by": _name(rec.entered_by) if rec.entered_by_id else "",
        "created_at": _iso(rec.created_at),
    }


def serialize_patient_schedule(ps):
    return {
        "id": ps.pk, "schedule": ps.schedule_id, "name": ps.schedule.name, "status": ps.status, "source": ps.source,
        "reason": ps.reason, "started_on": _iso(ps.started_on), "ended_on": _iso(ps.ended_on),
    }


def _patient_response(request, patient):
    org = patient.organization
    data = service.recommend_for_patient(patient, org)
    history = (PatientImmunization.all_objects.filter(organization=org, patient=patient)
               .select_related("item", "product", "manufacturer", "given_by", "entered_by")
               .order_by("-given_on", "-id"))
    recs = [serialize_recommendation(r) for r in data["recommendations"]]
    counts = engine.summarize(data["recommendations"])
    return {
        "patient": {"id": patient.pk, "name": _name(patient), "date_of_birth": _iso(data["dob"]),
                    "sex": data["sex"], "age_months": engine.age_in_months(data["dob"], data["as_of"]) if data["dob"] and data["dob"] <= data["as_of"] else None},
        "as_of": _iso(data["as_of"]),
        "problem": data["problem"], "problem_text": PROBLEM_TEXT.get(data["problem"], ""),
        "schedule": ({"id": data["age_schedule"].pk, "name": data["age_schedule"].name, "edition": data["age_schedule"].edition,
                      "source": data["age_schedule"].source} if data["age_schedule"] else None),
        "clash": [{"id": s.pk, "name": s.name, "edition": s.edition} for s in data["clash"]],
        "recommendations": recs,
        "counts": {k: v for k, v in counts.items()},
        "due_now": counts[engine.DUE] + counts[engine.OVERDUE],
        "risk_schedules": [serialize_patient_schedule(ps) for ps in data["risk"]],
        "suggestions": [
            {"schedule": s["schedule"].pk, "name": s["schedule"].name, "problem": s["problem"].description,
             "problem_code": s["problem"].code, "trigger": s["trigger"], "problem_id": s["problem"].pk}
            for s in data["suggestions"]
        ],
        "history": [serialize_record(r) for r in history],
        "can_record": _right(request, "immunizations.record"),
    }


class _Base(APIView):
    permission_classes = [permissions.IsAuthenticated]
    need = "immunizations.view"

    def handle_exception(self, exc):
        if isinstance(exc, VaccineError):
            return Response({"detail": exc.message}, status=exc.status)
        return super().handle_exception(exc)

    def patient(self, request, patient_id):
        if not _right(request, self.need):
            raise VaccineError("Not allowed.", 403)
        patient, err = _patient_for(request, patient_id)
        if err is not None:
            raise VaccineError(err.data.get("detail", "Not found."), err.status_code)
        return patient


class PatientVaccinesView(_Base):
    def get(self, request, patient_id):
        patient = self.patient(request, patient_id)
        return Response(_patient_response(request, patient))


class DosesView(_Base):
    need = "immunizations.record"

    def post(self, request, patient_id):
        patient = self.patient(request, patient_id)
        batch = request.data.get("doses")
        if batch is None:
            batch = [request.data]
        if not isinstance(batch, list) or not batch or len(batch) > 20:
            raise VaccineError("Send between 1 and 20 doses.")
        with transaction.atomic():
            made = [self.one(request, patient, d) for d in batch]
        body = _patient_response(request, patient)
        body["saved"] = [serialize_record(r) for r in made]
        return Response(body, status=201)

    def one(self, request, patient, data):
        org = patient.organization
        if not isinstance(data, dict):
            raise VaccineError("Each dose must be an object.")
        item = _org_items(org).filter(code=str(data.get("item") or "")).first()
        if item is None:
            raise VaccineError("Choose the vaccine.")
        if item.kind != "vaccine":
            raise VaccineError("This item is not a vaccine. Screenings are recorded as done through the screening form.")
        dob, _ = service.patient_facts(patient)
        today = timezone.localdate()
        given_on = _date(data.get("given_on"), "Date given", required=True)
        if given_on > today:
            raise VaccineError("Date given can't be in the future.")
        if dob and given_on < dob:
            raise VaccineError("Date given is before the patient's date of birth.")
        product = None
        if data.get("product") not in (None, ""):
            product = item.products.filter(cvx_code=str(data["product"])).first()
            if product is None:
                raise VaccineError("That product does not count for this vaccine.")
        source = data.get("source") or "given_here"
        if source not in dict(PatientImmunization.SOURCE_CHOICES):
            raise VaccineError("Unknown source.")
        if source == "given_here" and _date(data.get("expiration_date"), "Expiration date") and \
                _date(data.get("expiration_date"), "Expiration date") < given_on:
            raise VaccineError("This vaccine had expired on the date given.")
        given_time = None
        if data.get("given_time"):
            try:
                given_time = datetime.time.fromisoformat(str(data["given_time"])[:5])
            except ValueError:
                raise VaccineError("Time given must look like 10:40.")
        values = {key: str(data.get(key) or "").strip()[:limit] for key, limit in TEXT_LIMITS.items()}
        looked = {field: _lookup(org, dictionary, data.get(field), field.replace("_", " ").capitalize())
                  for field, dictionary in LOOKUP_FIELDS.items()}
        existing = PatientImmunization.all_objects.filter(organization=org, patient=patient, item=item, status="done")
        number = data.get("dose_number")
        if number in (None, ""):
            number = existing.count() + 1
        elif not isinstance(number, int) or isinstance(number, bool) or not 1 <= number <= 20:
            raise VaccineError("Dose number must be between 1 and 20.")
        if existing.filter(given_on=given_on, dose_number=number).exists():
            raise VaccineError(f"{item.display_name or item.name} dose {number} is already recorded for that date.")
        rec = PatientImmunization.all_objects.create(
            organization=org, patient=patient, item=item, product=product, dose_number=number, status="done",
            source=source, given_on=given_on, given_time=given_time, expiration_date=_date(data.get("expiration_date"), "Expiration date"),
            vis_given=bool(data.get("vis_given")), screening_reviewed=bool(data.get("screening_reviewed")),
            given_by=request.user if source == "given_here" else None, entered_by=request.user, updated_by=request.user,
            **values, **looked,
        )
        _audit(rec, "recorded", request.user)
        return rec


class NotDoneView(_Base):
    need = "immunizations.record"

    def post(self, request, patient_id):
        patient = self.patient(request, patient_id)
        org = patient.organization
        data = request.data
        item = _org_items(org).filter(code=str(data.get("item") or "")).first()
        if item is None:
            raise VaccineError("Choose the vaccine or screening.")
        reason = str(data.get("reason") or "")
        if reason not in REASONS:
            raise VaccineError("Choose the reason.")
        offer = _date(data.get("offer_again_on"), "Offer again on")
        if offer and offer <= timezone.localdate():
            raise VaccineError("Offer again on must be a future date.")
        with transaction.atomic():
            rec = PatientImmunization.all_objects.create(
                organization=org, patient=patient, item=item, status="not_done", not_done_reason=reason,
                offer_again_on=offer, notes=str(data.get("notes") or "").strip()[:2000], dose_number=1,
                given_on=None, entered_by=request.user, updated_by=request.user,
            )
            _audit(rec, "recorded", request.user)
        body = _patient_response(request, patient)
        body["saved"] = [serialize_record(rec)]
        return Response(body, status=201)


class VoidView(_Base):
    need = "immunizations.record"

    def post(self, request, record_id):
        if not _right(request, self.need):
            raise VaccineError("Not allowed.", 403)
        rec = PatientImmunization.all_objects.select_related("patient", "item").filter(pk=record_id).first()
        if rec is None or (request.user.role != "system_admin" and rec.organization_id != request.user.organization_id):
            raise VaccineError("Record not found.", 404)
        if rec.status == "entered_in_error":
            raise VaccineError("That record is already marked entered in error.")
        why = str(request.data.get("reason") or "").strip()
        if not why:
            raise VaccineError("Say why this record was entered in error.")
        with transaction.atomic():
            rec.notes = (rec.notes + "\n" if rec.notes else "") + f"Entered in error: {why[:500]}"
            rec.status, rec.updated_by = "entered_in_error", request.user
            rec.save()
            _audit(rec, "entered_in_error", request.user, ["status", "notes"])
        return Response(_patient_response(request, rec.patient))


class RiskSchedulesView(_Base):
    need = "immunizations.record"

    def post(self, request, patient_id):
        patient = self.patient(request, patient_id)
        org = patient.organization
        schedule = (ImmunizationSchedule.objects.filter(pk=request.data.get("schedule"), status="approved", is_risk_group=True)
                    .filter(Q(organization=org) | Q(organization__isnull=True)).first())
        if schedule is None:
            raise VaccineError("Choose an approved risk schedule.")
        if PatientSchedule.all_objects.filter(patient=patient, schedule=schedule, status__in=["suggested", "active"]).exists():
            raise VaccineError("The patient is already on that schedule.")
        problem = None
        if request.data.get("problem"):
            problem = ProblemListEntry.objects.filter(pk=request.data["problem"], organization=org, patient=patient).first()
            if problem is None:
                raise VaccineError("That problem is not on this patient's list.")
        PatientSchedule.all_objects.create(
            organization=org, patient=patient, schedule=schedule, status="active",
            source="auto" if problem else "manual",
            reason=(f"{problem.description} ({problem.code})" if problem else str(request.data.get("reason") or "").strip())[:300],
            trigger_problem_id=problem.pk if problem else None, started_on=timezone.localdate(),
            confirmed_by=request.user, confirmed_at=timezone.now(), created_by=request.user,
        )
        return Response(_patient_response(request, patient), status=201)


class RiskScheduleDetailView(_Base):
    need = "immunizations.record"

    def post(self, request, patient_id, assignment_id):
        patient = self.patient(request, patient_id)
        ps = PatientSchedule.all_objects.filter(pk=assignment_id, patient=patient, organization=patient.organization).first()
        if ps is None:
            raise VaccineError("Schedule assignment not found.", 404)
        action = request.data.get("action")
        if action == "end" and ps.status == "active":
            ps.status, ps.ended_on = "ended", timezone.localdate()
        elif action == "dismiss" and ps.status in ("suggested", "active"):
            ps.status = "dismissed"
        else:
            raise VaccineError("That can't be done to this schedule right now.")
        ps.save()
        return Response(_patient_response(request, patient))


class DismissSuggestionView(_Base):
    """A clinician says a suggested risk schedule does not apply. Remembered so it is not suggested again."""
    need = "immunizations.record"

    def post(self, request, patient_id):
        patient = self.patient(request, patient_id)
        org = patient.organization
        schedule = (ImmunizationSchedule.objects.filter(pk=request.data.get("schedule"), is_risk_group=True)
                    .filter(Q(organization=org) | Q(organization__isnull=True)).first())
        if schedule is None:
            raise VaccineError("Choose a risk schedule.")
        if PatientSchedule.all_objects.filter(patient=patient, schedule=schedule, status__in=["suggested", "active"]).exists():
            raise VaccineError("The patient is already on that schedule.")
        PatientSchedule.all_objects.create(
            organization=org, patient=patient, schedule=schedule, status="dismissed", source="auto",
            reason=str(request.data.get("reason") or "").strip()[:300], created_by=request.user,
        )
        return Response(_patient_response(request, patient), status=201)


class CatalogView(_Base):
    def get(self, request):
        if not _right(request, "immunizations.view"):
            raise VaccineError("Not allowed.", 403)
        if request.user.role not in ("doctor", "nurse", "registrar", "admin", "system_admin"):
            raise VaccineError("Not allowed.", 403)
        org = request.user.organization
        scope = Q(organization=org) | Q(organization__isnull=True)
        items = _org_items(org).prefetch_related("products").order_by("sort_order", "name")
        lookups = {}
        for entry in LookupEntry.objects.filter(scope, active=True).order_by("dictionary", "sort_order", "name"):
            lookups.setdefault(entry.dictionary, []).append({"id": entry.pk, "name": entry.name, "code": entry.code})
        return Response({
            "items": [
                {"code": i.code, "name": i.display_name or i.name, "kind": i.kind,
                 "products": [{"cvx": p.cvx_code, "name": p.short_name} for p in i.products.filter(status="active")]}
                for i in items
            ],
            "lookups": lookups,
            "reasons": [{"value": v, "label": l} for v, l in PatientImmunization.REASON_CHOICES],
            "risk_schedules": [
                {"id": s.pk, "name": s.name, "population": s.population}
                for s in ImmunizationSchedule.objects.filter(scope, status="approved", is_risk_group=True).order_by("name")
            ],
        })
