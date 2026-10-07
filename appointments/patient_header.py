"""
Patient chart header: the banner at the top of a patient's chart (name, unit or
clinic, attending, MRN, visit ID, age and sex, allergies, ...).

* Each clinic chooses which items show and in what order (PatientHeaderConfig).
* The built-in items below come from data already on the chart.
* A clinic can also define its own items (HeaderFieldDefinition), e.g. "Code
  status" or "Isolation", and staff fill them in per patient (PatientHeaderValue).
* Allergies are recorded here too (PatientAllergy, PatientAllergyStatus).

The server works out the text for every visible item, so adding or removing an
item in Settings changes the header everywhere without a code change.
"""

import re
from datetime import date

from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import CustomUser, Organization, Registration

from .models import (
    HeaderFieldDefinition,
    PatientAllergy,
    PatientAllergyStatus,
    PatientHeaderConfig,
    PatientHeaderValue,
)

STAFF_ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")
ADMIN_ROLES = ("admin", "system_admin")
MAX_CUSTOM_FIELDS = 20

# key, label, what it shows
BUILTIN_FIELDS = [
    ("name", "Patient name", "Last name, first name"),
    ("location", "Location", "Location, unit, room and bed for the visit, or the clinic's name"),
    ("attending", "Attending", "The visit's attending provider, or the patient's provider"),
    ("mrn", "MRN", "Medical record number"),
    ("visit_id", "Visit ID", "Visit number of the latest visit"),
    ("age_sex", "Age / sex", "For example 43 y · Female"),
    ("allergies", "Allergies", "Active allergies, shown in red"),
    ("care_setting", "Care setting", "Ambulatory, Emergency or Acute Care"),
    ("dob", "Date of birth", ""),
    ("preferred_language", "Preferred language", ""),
    ("reason_for_visit", "Visit reason", "Reason for the latest visit"),
    ("arrival", "Admit / arrival date", "Arrival date of the latest visit"),
]
BUILTIN_KEYS = [key for key, _label, _hint in BUILTIN_FIELDS]
BUILTIN_BY_KEY = {key: (label, hint) for key, label, hint in BUILTIN_FIELDS}
DEFAULT_VISIBLE = ["name", "location", "attending", "mrn", "visit_id", "age_sex", "allergies"]
CARE_SETTING_LABELS = dict(Registration.CARE_SETTING_CHOICES)
SEX_LABELS = {"M": "Male", "F": "Female", "X": "Other"}


# --------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------

def _custom_defs(org):
    return list(HeaderFieldDefinition.objects.filter(organization=org)) if org else []


def resolved_config(org):
    """
    The full ordered list of items for a clinic: its saved layout first, then every
    other available item (hidden), so Settings can show and re-add anything.
    """
    defs = {f"custom:{d.key}": d for d in _custom_defs(org)}
    saved = []
    row = PatientHeaderConfig.objects.filter(organization=org).first() if org else None
    if row and isinstance(row.items, list):
        saved = [i for i in row.items if isinstance(i, dict)]
    if not saved:
        saved = [{"key": key, "visible": True} for key in DEFAULT_VISIBLE]

    out, seen = [], set()
    for item in saved:
        key = item.get("key")
        if key in seen or (key not in BUILTIN_BY_KEY and key not in defs):
            continue  # unknown or deleted item
        seen.add(key)
        out.append(_describe(key, bool(item.get("visible", True)), defs))
    for key in BUILTIN_KEYS + sorted(defs, key=lambda k: defs[k].label.lower()):
        if key not in seen:
            out.append(_describe(key, False, defs))
    return out


def _describe(key, visible, defs):
    if key in BUILTIN_BY_KEY:
        label, hint = BUILTIN_BY_KEY[key]
        return {"key": key, "label": label, "description": hint, "visible": visible, "kind": "builtin"}
    d = defs[key]
    return {
        "key": key,
        "label": d.label,
        "description": f"Added by your clinic ({d.get_field_type_display().lower()})",
        "visible": visible,
        "kind": "custom",
        "field_type": d.field_type,
        "alert": d.alert,
    }


def _target_org(request, supplied=None):
    """The clinic a request is about: your own, or (system admins) the one named."""
    user = request.user
    if user.role == "system_admin":
        org_id = supplied or request.query_params.get("org")
        return Organization.objects.filter(pk=org_id).first() if org_id else user.organization
    return user.organization


class HeaderConfigView(APIView):
    """GET the clinic's header layout (any staff); PUT a new one (admins)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic (?org=ID)."}, status=400)
        return Response({"organization": org.pk, "items": resolved_config(org), "can_edit": request.user.role in ADMIN_ROLES})

    def put(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change the patient header."}, status=403)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        items = request.data.get("items")
        if not isinstance(items, list):
            return Response({"detail": "items must be a list."}, status=400)
        defs = {f"custom:{d.key}" for d in _custom_defs(org)}
        cleaned, seen = [], set()
        for item in items:
            key = item.get("key") if isinstance(item, dict) else None
            if key not in BUILTIN_BY_KEY and key not in defs:
                return Response({"detail": f"Unknown header item: {key}"}, status=400)
            if key in seen:
                return Response({"detail": f"Header item listed twice: {key}"}, status=400)
            seen.add(key)
            cleaned.append({"key": key, "visible": bool(item.get("visible", True))})
        if not any(i["visible"] for i in cleaned):
            return Response({"detail": "Show at least one item in the header."}, status=400)
        PatientHeaderConfig.objects.update_or_create(organization=org, defaults={"items": cleaned, "updated_by": request.user})
        return Response({"organization": org.pk, "items": resolved_config(org), "can_edit": True})


class HeaderFieldViewSet(viewsets.ModelViewSet):
    """The clinic's own header items (admins only): create, rename, delete."""

    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _check(self):
        if self.request.user.role not in ADMIN_ROLES:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only an administrator can manage header items.")

    def get_queryset(self):
        user = self.request.user
        qs = HeaderFieldDefinition.objects.all()
        if user.role == "system_admin":
            org_id = self.request.query_params.get("org")
            return qs.filter(organization_id=org_id) if org_id else qs
        return qs.filter(organization=user.organization)

    @staticmethod
    def render(d):
        return {"id": d.pk, "key": d.key, "item_key": f"custom:{d.key}", "label": d.label, "field_type": d.field_type, "alert": d.alert}

    def list(self, request, *args, **kwargs):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        return Response([self.render(d) for d in self.get_queryset()])

    def create(self, request, *args, **kwargs):
        self._check()
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        label = str(request.data.get("label", "")).strip()
        if not label:
            return Response({"detail": "Give the item a name."}, status=400)
        if len(label) > 60:
            return Response({"detail": "Keep the name to 60 characters."}, status=400)
        field_type = request.data.get("field_type", "text")
        if field_type not in dict(HeaderFieldDefinition.TYPE_CHOICES):
            return Response({"detail": "Type must be text, yes_no or date."}, status=400)
        if HeaderFieldDefinition.objects.filter(organization=org).count() >= MAX_CUSTOM_FIELDS:
            return Response({"detail": f"A clinic can add up to {MAX_CUSTOM_FIELDS} items."}, status=400)
        if HeaderFieldDefinition.objects.filter(organization=org, label__iexact=label).exists():
            return Response({"detail": "You already have an item with that name."}, status=400)
        base = slugify(label)[:40] or "item"
        key, n = base, 2
        while HeaderFieldDefinition.objects.filter(organization=org, key=key).exists():
            key, n = f"{base}-{n}", n + 1
        d = HeaderFieldDefinition.objects.create(organization=org, key=key, label=label, field_type=field_type, alert=bool(request.data.get("alert")))
        # a new item starts hidden at the end of the layout; the admin switches it on
        return Response(self.render(d), status=201)

    def partial_update(self, request, *args, **kwargs):
        self._check()
        d = self.get_object()
        if "label" in request.data:
            label = str(request.data["label"]).strip()
            if not label or len(label) > 60:
                return Response({"detail": "Give the item a name of up to 60 characters."}, status=400)
            if HeaderFieldDefinition.objects.filter(organization=d.organization, label__iexact=label).exclude(pk=d.pk).exists():
                return Response({"detail": "You already have an item with that name."}, status=400)
            d.label = label
        if "alert" in request.data:
            d.alert = bool(request.data["alert"])
        d.save()
        return Response(self.render(d))

    def destroy(self, request, *args, **kwargs):
        self._check()
        d = self.get_object()
        key = f"custom:{d.key}"
        row = PatientHeaderConfig.objects.filter(organization=d.organization).first()
        with transaction.atomic():
            if row:
                row.items = [i for i in row.items if i.get("key") != key]
                row.save(update_fields=["items", "updated_at"])
            d.delete()
        return Response(status=204)


# --------------------------------------------------------------------------
# the header itself
# --------------------------------------------------------------------------

def _patient_for(request, patient_id):
    """The patient user, if this staff member may see them. Returns (patient, error response)."""
    user = request.user
    if user.role not in STAFF_ROLES:
        return None, Response({"detail": "Not allowed."}, status=403)
    patient = CustomUser.objects.filter(pk=patient_id, role="patient").select_related("organization", "provider").first()
    if patient is None or (user.role != "system_admin" and patient.organization_id != user.organization_id):
        return None, Response({"detail": "Patient not found."}, status=404)
    return patient, None


def _age_text(dob, today=None):
    if not dob:
        return ""
    today = today or date.today()
    if dob > today:
        return ""
    months = (today.year - dob.year) * 12 + today.month - dob.month - (1 if today.day < dob.day else 0)
    if months >= 24:
        return f"{months // 12} y"
    if months >= 1:
        return f"{months} m"
    return f"{(today - dob).days} d"


def _fmt_date(value):
    if not value:
        return ""
    if hasattr(value, "astimezone") and getattr(value, "tzinfo", None):
        value = timezone.localtime(value)
    return value.strftime("%m-%d-%Y")


def allergy_summary(patient):
    """(text, emphasis, rows) for the allergies item."""
    rows = list(PatientAllergy.objects.filter(patient=patient, status="active").order_by("substance", "id"))
    if rows:
        parts = []
        for a in rows:
            detail = ", ".join(x for x in (a.reaction, a.severity) if x)
            parts.append(f"{a.substance} ({detail})" if detail else a.substance)
        return "; ".join(parts), "alert", rows
    nka = PatientAllergyStatus.objects.filter(patient=patient, no_known_allergies=True).exists()
    return ("No known allergies", "none", rows) if nka else ("Not documented", "warn", rows)


def _custom_text(definition, raw):
    if not raw:
        return ""
    if definition.field_type == "yes_no":
        return "Yes" if raw == "yes" else "No"
    if definition.field_type == "date":
        try:
            return date.fromisoformat(raw).strftime("%m-%d-%Y")
        except ValueError:
            return raw
    return raw


def _chart_appointment_id(visit):
    """The visit's chart record, made on first use for visits that were registered without one."""
    if visit is None:
        return None
    if not visit.appointment_id:
        visit.ensure_chart_appointment()
    return visit.appointment_id


def build_header(patient, visit_id=None):
    org = patient.organization
    profile = getattr(patient, "patient_profile", None)
    visits = Registration.objects.filter(patient__user=patient).select_related("attending_provider").order_by("-created_at", "-pk")
    visit = visits.filter(pk=visit_id).first() if visit_id else visits.first()

    provider = (visit.attending_provider if visit and visit.attending_provider else None) or patient.provider
    attending = f"Dr. {provider.first_name} {provider.last_name}".strip() if provider else ""
    sex = SEX_LABELS.get(getattr(profile, "legal_sex", ""), "")
    age = _age_text(getattr(profile, "date_of_birth", None))
    allergy_text, allergy_emphasis, allergy_rows = allergy_summary(patient)
    arrival = (visit.arrival_time or visit.created_at) if visit else None

    builtin_values = {
        "name": f"{patient.last_name}, {patient.first_name}".strip(", "),
        # the full path from the Location Manager, else the older typed text, else the clinic's name
        "location": ((visit.location_path() or visit.assigned_location) if visit and (visit.location_path() or visit.assigned_location) else (org.name if org else "")),
        "attending": attending,
        "mrn": getattr(profile, "mrn", "") or "",
        "visit_id": (visit.visit_number if visit else "") or "",
        "age_sex": " · ".join(x for x in (age, sex) if x),
        "allergies": allergy_text,
        "care_setting": CARE_SETTING_LABELS.get(visit.care_setting, "") if visit else CARE_SETTING_LABELS["ambulatory"],
        "dob": _fmt_date(getattr(profile, "date_of_birth", None)),
        "preferred_language": getattr(profile, "preferred_language", "") or "",
        "reason_for_visit": (visit.reason_for_visit if visit else "") or "",
        "arrival": _fmt_date(arrival),
    }

    defs = {d.pk: d for d in _custom_defs(org)}
    values = {v.definition_id: v.value for v in PatientHeaderValue.objects.filter(patient=patient, definition_id__in=list(defs))}

    items = []
    for entry in resolved_config(org):
        if not entry["visible"]:
            continue
        key = entry["key"]
        emphasis = "none"
        if key in builtin_values:
            text = builtin_values[key]
            if key == "allergies":
                emphasis = allergy_emphasis
            elif key == "name":
                emphasis = "strong"
        else:
            d = next(d for d in defs.values() if f"custom:{d.key}" == key)
            raw = values.get(d.pk, "")
            text = _custom_text(d, raw)
            if d.alert and text and not (d.field_type == "yes_no" and raw != "yes"):
                emphasis = "alert"
        items.append({"key": key, "label": entry["label"], "value": text, "emphasis": emphasis})

    return {
        "patient": patient.pk,
        "visit": visit.pk if visit else None,
        # the chart record (an Appointment) that Orders, Documents and Flowsheets are filed against for this visit
        "appointment": _chart_appointment_id(visit),
        "items": items,
        "allergies": {
            "no_known_allergies": allergy_text == "No known allergies",
            "records": [_allergy_json(a) for a in PatientAllergy.objects.filter(patient=patient).order_by("status", "substance", "id")],
        },
        "custom_fields": [
            {"key": f"custom:{d.key}", "label": d.label, "field_type": d.field_type, "value": values.get(d.pk, "")}
            for d in sorted(defs.values(), key=lambda x: x.label.lower())
        ],
    }


def _allergy_json(a):
    return {
        "id": a.pk,
        "substance": a.substance,
        "reaction": a.reaction,
        "severity": a.severity,
        "status": a.status,
    }


class PatientHeaderView(APIView):
    """GET /api/patient-header/<patient user id>/ -> the header, ready to draw."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        patient, error = _patient_for(request, patient_id)
        if error:
            return error
        data = build_header(patient, request.query_params.get("visit"))
        data["can_edit"] = True
        return Response(data)


class PatientHeaderValuesView(APIView):
    """PUT {"values": {"custom:code-status": "Full code"}} fills in clinic-defined items."""

    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, patient_id):
        patient, error = _patient_for(request, patient_id)
        if error:
            return error
        incoming = request.data.get("values")
        if not isinstance(incoming, dict):
            return Response({"detail": "values must be an object."}, status=400)
        defs = {f"custom:{d.key}": d for d in _custom_defs(patient.organization)}
        for key, raw in incoming.items():
            d = defs.get(key)
            if d is None:
                return Response({"detail": f"Unknown header item: {key}"}, status=400)
            text = "" if raw is None else str(raw).strip()
            if len(text) > 300:
                return Response({"detail": f"{d.label} is too long (300 characters at most)."}, status=400)
            if text and d.field_type == "yes_no" and text not in ("yes", "no"):
                return Response({"detail": f"{d.label} must be yes or no."}, status=400)
            if text and d.field_type == "date" and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
                return Response({"detail": f"{d.label} must be a date (YYYY-MM-DD)."}, status=400)
            if text and d.field_type == "date":
                try:
                    date.fromisoformat(text)
                except ValueError:
                    return Response({"detail": f"{d.label} is not a real date."}, status=400)
        with transaction.atomic():
            for key, raw in incoming.items():
                text = "" if raw is None else str(raw).strip()
                if text:
                    PatientHeaderValue.objects.update_or_create(
                        patient=patient, definition=defs[key], defaults={"value": text, "updated_by": request.user}
                    )
                else:
                    PatientHeaderValue.objects.filter(patient=patient, definition=defs[key]).delete()
        return Response(build_header(patient))


# --------------------------------------------------------------------------
# allergies
# --------------------------------------------------------------------------

class PatientAllergiesView(APIView):
    """GET the allergy list; POST {substance, reaction?, severity?} to add one."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        patient, error = _patient_for(request, patient_id)
        if error:
            return error
        return Response(build_header(patient)["allergies"])

    def post(self, request, patient_id):
        patient, error = _patient_for(request, patient_id)
        if error:
            return error
        substance = str(request.data.get("substance", "")).strip()
        reaction = str(request.data.get("reaction", "")).strip()
        severity = str(request.data.get("severity", "")).strip().lower()
        if not substance:
            return Response({"detail": "Say what the patient is allergic to."}, status=400)
        if len(substance) > 200 or len(reaction) > 200:
            return Response({"detail": "Keep it to 200 characters."}, status=400)
        if severity and severity not in dict(PatientAllergy.SEVERITY_CHOICES):
            return Response({"detail": "Severity must be mild, moderate or severe."}, status=400)
        duplicate = PatientAllergy.objects.filter(patient=patient, substance__iexact=substance, status="active").first()
        if duplicate:
            return Response({"detail": f"{duplicate.substance} is already on the list."}, status=400)
        with transaction.atomic():
            PatientAllergy.objects.create(
                organization=patient.organization, patient=patient, substance=substance,
                reaction=reaction, severity=severity, entered_by=request.user,
            )
            # a real allergy replaces "no known allergies"
            PatientAllergyStatus.objects.filter(patient=patient).update(no_known_allergies=False)
        return Response(build_header(patient)["allergies"], status=201)


class PatientAllergyDetailView(APIView):
    """PATCH {status: inactive|active, reaction?, severity?}; DELETE removes a mistaken entry."""

    permission_classes = [permissions.IsAuthenticated]

    def _get(self, request, patient_id, allergy_id):
        patient, error = _patient_for(request, patient_id)
        if error:
            return None, None, error
        allergy = PatientAllergy.objects.filter(pk=allergy_id, patient=patient).first()
        if allergy is None:
            return None, None, Response({"detail": "Allergy not found."}, status=404)
        return patient, allergy, None

    def patch(self, request, patient_id, allergy_id):
        patient, allergy, error = self._get(request, patient_id, allergy_id)
        if error:
            return error
        if "status" in request.data:
            if request.data["status"] not in dict(PatientAllergy.STATUS_CHOICES):
                return Response({"detail": "Status must be active or inactive."}, status=400)
            allergy.status = request.data["status"]
        if "reaction" in request.data:
            allergy.reaction = str(request.data["reaction"]).strip()[:200]
        if "severity" in request.data:
            severity = str(request.data["severity"]).strip().lower()
            if severity and severity not in dict(PatientAllergy.SEVERITY_CHOICES):
                return Response({"detail": "Severity must be mild, moderate or severe."}, status=400)
            allergy.severity = severity
        allergy.save()
        return Response(build_header(patient)["allergies"])

    def delete(self, request, patient_id, allergy_id):
        patient, allergy, error = self._get(request, patient_id, allergy_id)
        if error:
            return error
        allergy.delete()
        return Response(build_header(patient)["allergies"])


class PatientAllergyStatusView(APIView):
    """PUT {"no_known_allergies": true} records that the patient was asked and has none."""

    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, patient_id):
        patient, error = _patient_for(request, patient_id)
        if error:
            return error
        nka = bool(request.data.get("no_known_allergies"))
        if nka and PatientAllergy.objects.filter(patient=patient, status="active").exists():
            return Response({"detail": "This patient has active allergies. Mark them inactive first."}, status=400)
        PatientAllergyStatus.objects.update_or_create(patient=patient, defaults={"no_known_allergies": nka, "updated_by": request.user})
        return Response(build_header(patient)["allergies"])
