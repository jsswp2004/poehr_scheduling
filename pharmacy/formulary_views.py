"""
POWER Formulary API (mounted at /api/pharmacy/formulary/, part of the POWER Pharmacy module):

    GET   formulary/?q=&scope=shared|clinic|overridden&dangerous=&renal=&active=   the items as this clinic sees them
    POST  formulary/                         add an item (system admin: shared; clinic: the clinic's own)
    PATCH formulary/<id>/                    edit (system admin: the shared item; clinic: overrides / its own item)
    POST  formulary/<id>/revert/             {field}: back to the shared value
    POST  formulary/<id>/review/             "Mark reviewed" (needs pharmacist review -> reviewed)
    GET   formulary/<id>/history/            the item's change history
    GET   formulary/export/  formulary/template/            CSV
    POST  formulary/import/                  multipart file, mode=preview|apply
    GET   formulary/imports/, formulary/imports/<id>/file/  past imports and their original file

View: pharmacist, pharmacy assistant, admin, system admin. Edit: pharmacist and admin (their clinic), system admin
(the shared formulary, without prices: prices are per clinic). Mark reviewed: see formulary.can_review. Doctors and nurses have no access here (they meet the formulary in the drug search).
"""

from django.http import HttpResponse
from rest_framework import permissions
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.patient_header import _target_org

from . import formulary as fm
from .models import FormularyChange, FormularyImport
from .services import name_of


def _org(request):
    return None if request.user.role == "system_admin" else _target_org(request)


def _denied(request, edit=False):
    roles = fm.EDIT_ROLES if edit else fm.VIEW_ROLES
    if getattr(request.user, "role", None) not in roles:
        return Response({"detail": "Not allowed." if not edit else "Only a pharmacist or an administrator can change the formulary."}, status=403)
    if request.user.role != "system_admin" and _target_org(request) is None:
        return Response({"detail": "Choose a clinic."}, status=400)
    return None


def _item(request, pk):
    org = _org(request)
    return fm.scope_items(org).filter(pk=pk).first()


def _clean(data, fields):
    values, errors = {}, {}
    for field in fields:
        if field in data:
            try:
                values[field] = fm.clean_value(field, data[field])
            except ValueError as exc:
                errors[field] = f"Must be {exc}."
    return values, errors


def _csv(text, filename):
    response = HttpResponse(text, content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


class FormularyListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        p = request.query_params
        org = _org(request)
        rows = fm.listing(org, p.get("q", ""), p.get("scope", ""), p.get("dangerous", ""), p.get("renal", ""), p.get("active", ""), p.get("review", ""))
        role = request.user.role
        reviews_shared = fm.can_review(request.user, fm.Orderable(organization=None), org)
        for r in rows:
            r["can_review"] = r["review"]["status"] == "needs_review" and (
                reviews_shared if r["scope"] == "shared" else (role == "pharmacist" and org is not None))
        return Response({
            "results": rows,
            "can_edit": role in fm.EDIT_ROLES,
            "edits_shared": role == "system_admin",
            "edits_prices": role in fm.EDIT_ROLES and role != "system_admin",
            "reviews_shared": reviews_shared,
            "forms": fm.FORMS,
            "routes": list(fm.ROUTES),
            "overridable": list(fm.OVERRIDABLE),
        })

    def post(self, request):
        denied = _denied(request, edit=True)
        if denied:
            return denied
        if request.user.role == "system_admin" and any(request.data.get(f) not in (None, "", False) for f in fm.PRICE):
            return Response({"detail": fm.PRICES_PER_CLINIC, "fields": list(fm.PRICE)}, status=403)
        try:
            item = fm.create_item(request.user, _org(request), request.data)
        except (fm.FormularyError, ValueError) as exc:
            return Response({"detail": getattr(exc, "message", None) or f"Check the values: {exc}."}, status=400)
        return Response(fm.serialize(item, _org(request)), status=201)


class FormularyItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        denied = _denied(request, edit=True)
        if denied:
            return denied
        org = _org(request)
        item = _item(request, pk)
        if item is None or not fm.can_edit(request.user, item):
            return Response({"detail": "Item not found."}, status=404)
        fields = fm.OVERRIDABLE if item.organization_id is None and request.user.role != "system_admin" else fm.COLUMNS[1:]
        if request.user.role == "system_admin":
            priced = [f for f in request.data if f in fm.PRICE]
            if priced:
                return Response({"detail": fm.PRICES_PER_CLINIC, "fields": priced}, status=403)
        refused = [f for f in request.data if f in fm.COLUMNS[1:] and f not in fields]
        if refused:
            return Response({"detail": f"Only POWER can change the shared item's {', '.join(refused)}.", "fields": refused}, status=403)
        values, errors = _clean(request.data, fields)
        if errors:
            return Response({"detail": "Check the values.", "errors": errors}, status=400)
        if "generic_name" in values and not values["generic_name"]:
            return Response({"detail": "The generic name can't be blank."}, status=400)
        changes = fm.apply_changes(request.user, org, item, values)
        item.refresh_from_db()
        return Response({**fm.serialize(item, org), "changed": changes})


class FormularyRevertView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        denied = _denied(request, edit=True)
        if denied:
            return denied
        org = _org(request)
        item = _item(request, pk)
        if item is None:
            return Response({"detail": "Item not found."}, status=404)
        try:
            fm.revert(request.user, org, item, str(request.data.get("field") or ""))
        except fm.FormularyError as exc:
            return Response({"detail": exc.message}, status=exc.status_code)
        return Response(fm.serialize(item, org))


class FormularyReviewView(APIView):
    """POST: "Mark reviewed". Recorded in the item's history."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        denied = _denied(request)
        if denied:
            return denied
        org = _org(request)
        item = _item(request, pk)
        if item is None:
            return Response({"detail": "Item not found."}, status=404)
        try:
            fm.mark_reviewed(request.user, org, item)
        except fm.FormularyError as exc:
            return Response({"detail": exc.message}, status=exc.status_code)
        return Response(fm.serialize(item, org))


class FormularyHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        denied = _denied(request)
        if denied:
            return denied
        org = _org(request)
        item = _item(request, pk)
        if item is None:
            return Response({"detail": "Item not found."}, status=404)
        from django.db.models import Q

        # the full history of a shared item (every change to the shared definition, whoever caused it) plus this
        # clinic's own overrides; never another clinic's overrides, and a clinic's own items are private to it
        qs = FormularyChange.objects.filter(orderable=item).filter(Q(organization__isnull=True) | Q(organization=org)).select_related("user", "formulary_import")
        return Response({"results": [
            {"id": c.pk, "at": c.created_at.isoformat(), "user": name_of(c.user) if c.user_id else "System", "source": c.source,
             "scope": "shared" if c.organization_id is None else "clinic", "changes": c.changes,
             "import": {"id": c.formulary_import_id, "filename": c.formulary_import.filename} if c.formulary_import_id else None}
            for c in qs[:200]
        ]})


class FormularyExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        return _csv(fm.export_csv(_org(request)), "formulary.csv")


class FormularyTemplateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        return _csv(fm.sample_csv(), "formulary_upload_template.csv")


class FormularyImportView(APIView):
    """POST multipart {file, mode: preview|apply}. Preview never writes; apply writes all rows or none."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        denied = _denied(request, edit=True)
        if denied:
            return denied
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Choose a CSV file."}, status=400)
        if upload.size > 2 * 1024 * 1024:
            return Response({"detail": "The file is larger than 2 MB."}, status=400)
        raw = upload.read()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")
        org = _org(request)
        if request.data.get("mode") == "apply":
            try:
                imp, plan = fm.apply_import(request.user, org, text, upload.name)
            except fm.FormularyError as exc:
                return Response({"detail": exc.message, **fm.plan_import(request.user, org, text)}, status=exc.status_code)
            return Response({**plan, "import": {"id": imp.pk, "filename": imp.filename}}, status=201)
        return Response(fm.plan_import(request.user, org, text))


class FormularyImportListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _denied(request)
        if denied:
            return denied
        org = _org(request)
        qs = FormularyImport.objects.filter(organization=org).select_related("user")
        return Response({"results": [
            {"id": i.pk, "filename": i.filename, "user": name_of(i.user), "at": i.created_at.isoformat(),
             "created": i.created, "changed": i.changed, "unchanged": i.unchanged}
            for i in qs[:100]
        ]})


class FormularyImportFileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        denied = _denied(request)
        if denied:
            return denied
        imp = FormularyImport.objects.filter(pk=pk, organization=_org(request)).first()
        if imp is None:
            return Response({"detail": "Import not found."}, status=404)
        return _csv(imp.content, imp.filename)

