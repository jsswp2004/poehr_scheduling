"""
Insurance for registration.

Setup (an administrator): insurance types, carriers and plans.
* GET /api/insurance-setup/                       everything (any staff)
* PUT /api/insurance-setup/   {kind, items}       add or change types | carriers | plans (administrators)

A patient's policies (staff, same clinic):
* GET /api/patient-policies/<patient user id>/
* PUT /api/patient-policies/<patient user id>/    {policies:[...], delete_ids:[...]}
  Policies sent with an id are updated, without one are added, and the rest are left alone. An ended
  policy stays as history. Rules: one policy per COB order, and a type marked "required primary"
  has to be order 1. Two current policies of the same type give a warning, not an error.
"""

import re
from datetime import date

from django.db import transaction
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from poehr_scheduling_backend.tenancy import sees_all_orgs
from users.models import Patient

from .models import InsuranceCarrier, InsurancePlan, InsuranceType, PatientPolicy
from .patient_header import ADMIN_ROLES, STAFF_ROLES, _target_org

FORMAT_CHARS = re.compile(r"^[ANZP \-/.]*$")
MAX_NAME = 120
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def matches_format(fmt, value):
    """True when value fits fmt: A letter, N digit, Z letter or digit, P punctuation, anything else literal."""
    if not fmt:
        return True
    value = value or ""
    if len(value) != len(fmt):
        return False
    for f, ch in zip(fmt, value):
        if f == "A":
            ok = ch.isalpha()
        elif f == "N":
            ok = ch.isdigit()
        elif f == "Z":
            ok = ch.isalnum()
        elif f == "P":
            ok = not ch.isalnum() and not ch.isspace()
        else:
            ok = ch == f
        if not ok:
            return False
    return True


def _name(raw, label):
    value = str(raw or "").strip()
    if not value:
        raise ValueError(f"{label} needs a name.")
    if len(value) > MAX_NAME:
        raise ValueError(f"{label} name is longer than {MAX_NAME} characters.")
    return value


# ---------------- setup ----------------

def setup_payload(org, user):
    types = InsuranceType.objects.filter(organization=org)
    carriers = InsuranceCarrier.objects.filter(organization=org)
    plans = InsurancePlan.objects.filter(organization=org).select_related("carrier", "insurance_type")
    return {
        "organization": org.pk if org else None,
        "types": [{"id": t.pk, "name": t.name, "policy_format": t.policy_format, "required_primary": t.required_primary, "active": t.active} for t in types],
        "carriers": [{"id": c.pk, "name": c.name, "active": c.active} for c in carriers],
        "plans": [
            {"id": p.pk, "name": p.name, "carrier": p.carrier_id, "carrier_name": p.carrier.name, "insurance_type": p.insurance_type_id, "type_name": p.insurance_type.name, "active": p.active}
            for p in plans
        ],
        "can_edit": user.role in ADMIN_ROLES,
    }


def _save_items(org, kind, items):
    """Applies the items; raises ValueError with a message the registrar can read."""
    if not isinstance(items, list):
        raise ValueError("items must be a list.")
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Each item must be an object.")
        label = {"types": "Insurance type", "carriers": "Carrier", "plans": "Plan"}[kind]
        name = _name(item.get("name"), label)
        if name.lower() in seen:
            raise ValueError(f"'{name}' is listed twice.")
        seen.add(name.lower())
        active = bool(item.get("active", True))
        pk = item.get("id")
        if kind == "types":
            fmt = str(item.get("policy_format") or "").strip().upper()
            if len(fmt) > 40 or not FORMAT_CHARS.match(fmt):
                raise ValueError(f"The policy number format for '{name}' may only use A, N, Z, P, space, - / and .")
            defaults = {"name": name, "policy_format": fmt, "required_primary": bool(item.get("required_primary", False)), "active": active}
            model = InsuranceType
        elif kind == "carriers":
            defaults = {"name": name, "active": active}
            model = InsuranceCarrier
        else:
            carrier = InsuranceCarrier.objects.filter(pk=item.get("carrier"), organization=org).first()
            itype = InsuranceType.objects.filter(pk=item.get("insurance_type"), organization=org).first()
            if carrier is None or itype is None:
                raise ValueError(f"Plan '{name}' needs a carrier and an insurance type first.")
            defaults = {"name": name, "carrier": carrier, "insurance_type": itype, "active": active}
            model = InsurancePlan
        clash = model.objects.filter(organization=org, name__iexact=name)
        if pk:
            clash = clash.exclude(pk=pk)
        if clash.exists():
            raise ValueError(f"'{name}' already exists.")
        if pk:
            row = model.objects.filter(pk=pk, organization=org).first()
            if row is None:
                raise ValueError(f"'{name}' was not found.")
            for k, v in defaults.items():
                setattr(row, k, v)
            row.save()
        else:
            model.objects.create(organization=org, **defaults)


class InsuranceSetupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        return Response(setup_payload(_target_org(request), request.user))

    def put(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change insurance setup."}, status=403)
        kind = request.data.get("kind")
        if kind not in ("types", "carriers", "plans"):
            return Response({"detail": "Unknown kind."}, status=400)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        try:
            with transaction.atomic():
                _save_items(org, kind, request.data.get("items"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(setup_payload(org, request.user))


# ---------------- a patient's policies ----------------

def _current(p, today=None):
    today = today or date.today()
    return p.active and (p.end_date is None or p.end_date >= today)


def policy_row(p):
    return {
        "id": p.pk,
        "plan": p.plan_id,
        "plan_name": p.plan.name,
        "carrier_name": p.plan.carrier.name,
        "type_name": p.plan.insurance_type.name,
        "cob_order": p.cob_order,
        "insured_person": p.insured_person,
        "relationship": p.relationship,
        "policy_number": p.policy_number,
        "group_number": p.group_number,
        "effective_date": p.effective_date.isoformat() if p.effective_date else "",
        "end_date": p.end_date.isoformat() if p.end_date else "",
        "active": p.active,
        "status": "Active" if _current(p) else "History",
    }


def _rules(patient):
    """(error, warnings) across the patient's current policies."""
    current = [p for p in PatientPolicy.objects.filter(patient=patient).select_related("plan__insurance_type") if _current(p)]
    orders = {}
    for p in current:
        if p.cob_order in orders:
            return f"Two current policies have COB order {p.cob_order}. Give each its own order or end one.", []
        orders[p.cob_order] = p
    for p in current:
        t = p.plan.insurance_type
        if t.required_primary and p.cob_order != 1:
            return f"{t.name} has to be the primary insurance (order 1).", []
    warnings = []
    by_type = {}
    for p in current:
        by_type.setdefault(p.plan.insurance_type_id, []).append(p)
    for plans in by_type.values():
        if len(plans) > 1:
            warnings.append(f"More than one current {plans[0].plan.insurance_type.name} policy. Check the order.")
    return None, warnings


def _clean_policy(item, org):
    if not isinstance(item, dict):
        raise ValueError("A policy is not valid.")
    plan = InsurancePlan.objects.filter(pk=item.get("plan"), organization=org).select_related("insurance_type").first()
    if plan is None:
        raise ValueError("Pick a plan for each policy.")
    number = str(item.get("policy_number") or "").strip()
    if not number:
        raise ValueError(f"{plan.name} needs a policy number.")
    if len(number) > 60:
        raise ValueError("A policy number is longer than 60 characters.")
    if not matches_format(plan.insurance_type.policy_format, number):
        raise ValueError(f"The policy number for {plan.name} must match {plan.insurance_type.policy_format} ({plan.insurance_type.name}).")
    try:
        raw_order = item.get("cob_order")
        order = 1 if raw_order in (None, "") else int(raw_order)
    except (TypeError, ValueError):
        raise ValueError("COB order must be a number.")
    if not 1 <= order <= 9:
        raise ValueError("COB order must be between 1 and 9.")
    dates = {}
    for key in ("effective_date", "end_date"):
        raw = str(item.get(key) or "").strip()
        if raw and not ISO_DATE.match(raw):
            raise ValueError("Dates must look like 2026-03-31.")
        dates[key] = raw or None
    if dates["effective_date"] and dates["end_date"] and dates["end_date"] < dates["effective_date"]:
        raise ValueError(f"The end date of {plan.name} is before its effective date.")
    return {
        "plan": plan,
        "cob_order": order,
        "insured_person": str(item.get("insured_person") or "").strip()[:255],
        "relationship": str(item.get("relationship") or "").strip()[:100],
        "policy_number": number,
        "group_number": str(item.get("group_number") or "").strip()[:60],
        "effective_date": dates["effective_date"],
        "end_date": dates["end_date"],
        "active": bool(item.get("active", True)),
    }


class PatientPoliciesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _patient(self, request, user_id):
        if request.user.role not in STAFF_ROLES:
            return None, Response({"detail": "Not allowed."}, status=403)
        patient = Patient.objects.filter(user_id=user_id).first()
        if patient is None or (not sees_all_orgs(request.user) and patient.organization_id != request.user.organization_id):
            return None, Response({"detail": "Patient not found."}, status=404)
        return patient, None

    def _payload(self, patient, warnings=None):
        rows = PatientPolicy.objects.filter(patient=patient).select_related("plan__carrier", "plan__insurance_type")
        return {"policies": [policy_row(p) for p in rows], "warnings": warnings or []}

    def get(self, request, user_id):
        patient, error = self._patient(request, user_id)
        if error:
            return error
        _err, warnings = _rules(patient)
        return Response(self._payload(patient, warnings))

    def put(self, request, user_id):
        patient, error = self._patient(request, user_id)
        if error:
            return error
        org = patient.organization
        items = request.data.get("policies", [])
        delete_ids = request.data.get("delete_ids", [])
        if not isinstance(items, list) or not isinstance(delete_ids, list):
            return Response({"detail": "policies and delete_ids must be lists."}, status=400)
        try:
            with transaction.atomic():
                for pk in delete_ids:
                    row = PatientPolicy.objects.filter(pk=pk, patient=patient).first()
                    if row is None:
                        continue
                    if row.visits.exists():
                        raise ValueError("A policy used on a visit cannot be deleted. End it instead.")
                    row.delete()
                for item in items:
                    values = _clean_policy(item, org)
                    pk = item.get("id")
                    if pk:
                        row = PatientPolicy.objects.filter(pk=pk, patient=patient).first()
                        if row is None:
                            raise ValueError("A policy was not found.")
                        for k, v in values.items():
                            setattr(row, k, v)
                        row.save()
                    else:
                        PatientPolicy.objects.create(patient=patient, **values)
                err, warnings = _rules(patient)
                if err:
                    raise ValueError(err)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(self._payload(patient, warnings))
