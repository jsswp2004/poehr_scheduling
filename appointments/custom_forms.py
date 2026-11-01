"""
Custom forms: questions a clinic adds to registration.

* GET    /api/custom-forms/                    forms the signed-in role may fill in (admins also see inactive ones)
* PUT    /api/custom-forms/   {form:{...}}     add or change one form with its items (administrators)
* DELETE /api/custom-forms/?id=                remove a form and its answers (administrators)
* GET    /api/custom-form-answers/<patient user id>/?visit=<id>
* PUT    /api/custom-form-answers/<patient user id>/   {visit, answers:{item id: value}}

A form is for the patient (answers kept across visits) or for a visit. An item can be hidden until an
earlier item has a given answer. Required items are checked by the registration form, not blocked here.
"""

import re

from django.db import transaction
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from poehr_scheduling_backend.tenancy import sees_all_orgs
from users.models import Patient, Registration

from .models import CustomForm, CustomFormAnswer, CustomFormItem
from .patient_header import ADMIN_ROLES, STAFF_ROLES, _target_org

ITEM_TYPES = [k for k, _ in CustomFormItem.TYPE_CHOICES]
MAX_ITEMS = 40
MAX_OPTIONS = 50
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NUMBER = re.compile(r"^-?\d+(\.\d+)?$")


def _can_fill(form, user):
    return form.active and (not form.roles or user.role in form.roles or user.role in ADMIN_ROLES)


def form_row(form):
    items = list(form.items.all())
    index = {it.pk: i for i, it in enumerate(items)}
    return {
        "id": form.pk,
        "name": form.name,
        "used_as": form.used_as,
        "roles": form.roles,
        "active": form.active,
        "items": [
            {
                "id": it.pk,
                "label": it.label,
                "item_type": it.item_type,
                "options": it.options,
                "required": it.required,
                "show_when": index.get(it.show_when_item_id),
                "show_when_value": it.show_when_value,
            }
            for it in items
        ],
    }


def clean_form(raw):
    """(cleaned dict, error)."""
    if not isinstance(raw, dict):
        return None, "form must be an object."
    name = str(raw.get("name") or "").strip()
    if not name:
        return None, "The form needs a name."
    if len(name) > 120:
        return None, "The form name is longer than 120 characters."
    used_as = raw.get("used_as", "patient")
    if used_as not in ("patient", "visit"):
        return None, "A form is used for the patient or for the visit."
    roles = raw.get("roles") or []
    if not isinstance(roles, list) or any(r not in STAFF_ROLES for r in roles):
        return None, "Unknown role."
    items = raw.get("items") or []
    if not isinstance(items, list) or not items:
        return None, "Add at least one question."
    if len(items) > MAX_ITEMS:
        return None, f"A form can hold at most {MAX_ITEMS} questions."
    cleaned = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            return None, f"Question {i + 1} is not valid."
        label = str(it.get("label") or "").strip()
        if not label:
            return None, f"Question {i + 1} needs a label."
        if len(label) > 200:
            return None, f"Question {i + 1} is longer than 200 characters."
        kind = it.get("item_type", "text")
        if kind not in ITEM_TYPES:
            return None, f"Question {i + 1} has an unknown type."
        options = []
        if kind == "dictionary":
            raw_opts = it.get("options") or []
            if not isinstance(raw_opts, list):
                return None, f"The choices for '{label}' must be a list."
            seen = set()
            for o in raw_opts:
                o = str(o or "").strip()
                if not o:
                    continue
                if len(o) > 80:
                    return None, f"A choice for '{label}' is longer than 80 characters."
                if o.lower() in seen:
                    return None, f"'{o}' is listed twice for '{label}'."
                seen.add(o.lower())
                options.append(o)
            if not options:
                return None, f"'{label}' needs at least one choice."
            if len(options) > MAX_OPTIONS:
                return None, f"'{label}' has more than {MAX_OPTIONS} choices."
        when = it.get("show_when")
        when_value = str(it.get("show_when_value") or "").strip()
        if when is not None and when != "":
            if not isinstance(when, int) or isinstance(when, bool) or not 0 <= when < i:
                return None, f"'{label}' can only depend on a question above it."
            if not when_value:
                return None, f"'{label}' needs the answer that shows it."
        else:
            when, when_value = None, ""
        cleaned.append({"id": it.get("id"), "label": label, "item_type": kind, "options": options, "required": bool(it.get("required", False)), "show_when": when, "show_when_value": when_value[:80]})
    return {"name": name, "used_as": used_as, "roles": roles, "active": bool(raw.get("active", True)), "items": cleaned}, None


class CustomFormsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _payload(self, request, org):
        forms = CustomForm.objects.filter(organization=org).prefetch_related("items") if org else CustomForm.objects.none()
        if request.user.role not in ADMIN_ROLES:
            forms = [f for f in forms if _can_fill(f, request.user)]
        return {"organization": org.pk if org else None, "forms": [form_row(f) for f in forms], "can_edit": request.user.role in ADMIN_ROLES, "item_types": [{"key": k, "label": label} for k, label in CustomFormItem.TYPE_CHOICES]}

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        return Response(self._payload(request, _target_org(request)))

    def put(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change forms."}, status=403)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        raw = request.data.get("form")
        cleaned, error = clean_form(raw)
        if error:
            return Response({"detail": error}, status=400)
        pk = raw.get("id")
        with transaction.atomic():
            if pk:
                form = CustomForm.objects.filter(pk=pk, organization=org).first()
                if form is None:
                    return Response({"detail": "Form not found."}, status=404)
            else:
                form = CustomForm(organization=org, sequence=CustomForm.objects.filter(organization=org).count())
            clash = CustomForm.objects.filter(organization=org, name__iexact=cleaned["name"]).exclude(pk=form.pk or 0)
            if clash.exists():
                return Response({"detail": f"'{cleaned['name']}' already exists."}, status=400)
            form.name, form.used_as, form.roles, form.active = cleaned["name"], cleaned["used_as"], cleaned["roles"], cleaned["active"]
            form.save()
            keep, saved = [], []
            for i, it in enumerate(cleaned["items"]):
                row = CustomFormItem.objects.filter(pk=it["id"], form=form).first() if it["id"] else None
                if row is None:
                    row = CustomFormItem(form=form)
                row.sequence, row.label, row.item_type, row.options = i, it["label"], it["item_type"], it["options"]
                row.required, row.show_when_value, row.show_when_item = it["required"], it["show_when_value"], None
                row.save()
                keep.append(row.pk)
                saved.append(row)
            # dependencies point at saved rows, so they are set once every item has an id
            for it, row in zip(cleaned["items"], saved):
                if it["show_when"] is not None:
                    row.show_when_item = saved[it["show_when"]]
                    row.save(update_fields=["show_when_item"])
            form.items.exclude(pk__in=keep).delete()
        return Response(self._payload(request, org))

    def delete(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change forms."}, status=403)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        CustomForm.objects.filter(pk=request.query_params.get("id") or 0, organization=org).delete()
        return Response(self._payload(request, org))


def _check_value(item, value):
    """(clean value, error)."""
    value = "" if value is None else str(value).strip()
    if value == "":
        return "", None
    if item.item_type == "yes_no":
        if value.lower() not in ("yes", "no"):
            return None, f"'{item.label}' must be Yes or No."
        return value.lower(), None
    if item.item_type == "dictionary":
        match = next((o for o in item.options if o.lower() == value.lower()), None)
        if match is None:
            return None, f"'{value}' is not a choice for '{item.label}'."
        return match, None
    if item.item_type == "date":
        if not ISO_DATE.match(value):
            return None, f"'{item.label}' must be a date like 2026-03-31."
        return value, None
    if item.item_type == "number":
        if not NUMBER.match(value):
            return None, f"'{item.label}' must be a number."
        return value, None
    if len(value) > 1000:
        return None, f"'{item.label}' is longer than 1000 characters."
    return value, None


class CustomFormAnswersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _context(self, request, user_id):
        if request.user.role not in STAFF_ROLES:
            return None, None, Response({"detail": "Not allowed."}, status=403)
        patient = Patient.objects.filter(user_id=user_id).first()
        if patient is None or (not sees_all_orgs(request.user) and patient.organization_id != request.user.organization_id):
            return None, None, Response({"detail": "Patient not found."}, status=404)
        visit_id = request.query_params.get("visit") or request.data.get("visit")
        visit = None
        if visit_id:
            visit = Registration.objects.filter(pk=visit_id, patient=patient).first()
            if visit is None:
                return None, None, Response({"detail": "Visit not found."}, status=404)
        return patient, visit, None

    def _answers(self, patient, visit):
        out = {}
        for a in CustomFormAnswer.objects.filter(patient=patient, registration__isnull=True):
            out[str(a.item_id)] = a.value
        if visit is not None:
            for a in CustomFormAnswer.objects.filter(patient=patient, registration=visit):
                out[str(a.item_id)] = a.value
        return {"answers": out}

    def get(self, request, user_id):
        patient, visit, error = self._context(request, user_id)
        if error:
            return error
        return Response(self._answers(patient, visit))

    def put(self, request, user_id):
        patient, visit, error = self._context(request, user_id)
        if error:
            return error
        answers = request.data.get("answers")
        if not isinstance(answers, dict):
            return Response({"detail": "answers must be an object."}, status=400)
        items = {str(i.pk): i for i in CustomFormItem.objects.filter(form__organization=patient.organization).select_related("form")}
        pending = []
        for key, raw in answers.items():
            item = items.get(str(key))
            if item is None:
                return Response({"detail": "Unknown question."}, status=400)
            if not _can_fill(item.form, request.user):
                return Response({"detail": f"You cannot fill in '{item.form.name}'."}, status=403)
            if item.form.used_as == "visit" and visit is None:
                return Response({"detail": f"'{item.form.name}' belongs to a visit. Save the visit first."}, status=400)
            value, err = _check_value(item, raw)
            if err:
                return Response({"detail": err}, status=400)
            pending.append((item, value))
        with transaction.atomic():
            for item, value in pending:
                reg = visit if item.form.used_as == "visit" else None
                if value == "":
                    CustomFormAnswer.objects.filter(item=item, patient=patient, registration=reg).delete()
                else:
                    CustomFormAnswer.objects.update_or_create(item=item, patient=patient, registration=reg, defaults={"value": value})
        return Response(self._answers(patient, visit))
