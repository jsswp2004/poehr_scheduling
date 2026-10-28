"""
Custom reports (Reports module).

    GET    /api/staffing/custom-reports/sources/        data sources a report can start from
    GET    /api/staffing/custom-reports/                reports the user can run (own, shared with them)
    POST   /api/staffing/custom-reports/                create
    PATCH  /api/staffing/custom-reports/<id>/           edit (owner or admin)
    DELETE /api/staffing/custom-reports/<id>/           delete (owner or admin)
    POST   /api/staffing/custom-reports/<id>/run/       {start, end, narrow}  rows for the viewer
    POST   /api/staffing/custom-reports/preview/        {source, config, start, end}  builder preview
    GET    /api/staffing/custom-reports/linked-catalog/  the things a linked report (canvas) can combine
    GET    /api/staffing/custom-reports/documentation-catalog/?templates=a,b  notes to pick from, and their observations
    GET    /api/staffing/custom-reports/audit/          who ran reports on patient data (admins)

Run and preview accept "hide_phi": true to de-identify (patient names and note text) before anything leaves
the server, so the download is clean too. Every run or preview of a source that holds patient data is written to the audit log.

Rights: each data source says who may use it. Staffing sources follow the Staffing report roles
(MANAGER_ROLES); Communicator sources need the "messages.view_logs" right. Anyone who may use a source can
run reports on it that are shared with them and build their own; only the owner or an admin can change or
delete a report. A report on a source the user may not use is hidden from them.
"""

import datetime

from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import custom_report_documentation as documentation, custom_report_linked as linked, custom_reports as engine, org_scope
from .models import CustomReport, ReportAuditLog
from .views import ADMIN_ROLES, MANAGER_ROLES, IsStaffingManager, _org_queryset

SHARE_ROLES = ("admin", "doctor", "nurse", "registrar")


def _can_see(user, report):
    if user.role in ADMIN_ROLES:
        return True
    if report.created_by_id == user.id:
        return True
    if report.audience == "org":
        return True
    return report.audience == "roles" and user.role in (report.audience_roles or [])


def _source_ok(source_key, user, report=None):
    if source_key == "linked":  # allowed when the user may use every object on the report's canvas
        try:
            linked.clean_canvas((report.config or {}).get("canvas") if report else {"objects": ["pat", "visit"]}, user)
        except engine.ReportConfigError as e:
            return "access to" not in str(e)
        return True
    src = engine.SOURCES.get(source_key)
    return bool(src and engine.source_allowed(src, user))


def _prepare(source_key, config, user, org=None, hide=False):
    """(source override or None, config to run). A linked report builds its source from the canvas it carries, a
    documentation report from the notes and observations it carries."""
    if source_key == documentation.DOC_KEY:
        docs, rest = documentation.split_config(config)
        return documentation.build_source(docs, org, user, hide), rest
    if source_key != "linked":
        return None, config
    canvas, rest = linked.split_config(config, user)
    return linked.build_source(canvas, None, user), rest


def _can_edit(user, report):
    return user.role in ADMIN_ROLES or report.created_by_id == user.id


class CustomReportSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    source_label = serializers.SerializerMethodField()
    module_label = serializers.SerializerMethodField()
    shared_text = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = CustomReport
        fields = [
            "id", "name", "description", "module", "module_label", "source", "source_label", "config", "audience", "audience_roles",
            "shared_text", "owner_name", "is_mine", "can_edit", "last_run_at", "created_at", "updated_at",
        ]
        read_only_fields = ["module", "last_run_at", "created_at", "updated_at"]

    def get_owner_name(self, obj):
        u = obj.created_by
        if not u:
            return ""
        return (u.get_full_name() or u.get_username() or "").strip()

    def get_is_mine(self, obj):
        request = self.context.get("request")
        return bool(request and obj.created_by_id == request.user.id)

    def get_can_edit(self, obj):
        request = self.context.get("request")
        return bool(request and _can_edit(request.user, obj))

    def get_source_label(self, obj):
        if obj.source == "linked":
            return "Linked report"
        src = engine.SOURCES.get(obj.source)
        return src["label"] if src else obj.source

    def get_module_label(self, obj):
        return engine.MODULES.get(obj.module, obj.module)

    def get_shared_text(self, obj):
        if obj.audience == "me":
            return "Only me"
        if obj.audience == "org":
            return "Everyone at the facility"
        roles = [r.capitalize() for r in (obj.audience_roles or [])]
        return ", ".join(roles) or "No roles chosen"

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Give the report a name.")
        return value

    def validate_audience_roles(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Roles must be a list.")
        return [r for r in dict.fromkeys(value) if r in SHARE_ROLES]

    def validate(self, attrs):
        get = lambda k, d=None: attrs.get(k, getattr(self.instance, k, d))  # noqa: E731
        source = get("source")
        request = self.context.get("request")
        if source == "linked":
            attrs["module"] = "linked"
            try:
                canvas, rest = linked.split_config(get("config", {}), request.user)
                cfg = engine.clean_config("linked", rest, linked.build_source(canvas, None, request.user))
            except engine.ReportConfigError as e:
                raise serializers.ValidationError({"config": str(e)})
            attrs["config"] = {**cfg, "canvas": canvas}
        elif source == documentation.DOC_KEY:
            src = engine.SOURCES[source]
            if request is not None and not engine.source_allowed(src, request.user):
                raise serializers.ValidationError({"source": "You do not have access to this data source."})
            attrs["module"] = src["module"]
            org = self.instance.organization if self.instance else org_scope.create_kwargs(request)["organization"]
            try:
                docs, rest = documentation.split_config(get("config", {}))
                cfg = engine.clean_config(source, rest, documentation.build_source(docs, org, request.user))
            except engine.ReportConfigError as e:
                raise serializers.ValidationError({"config": str(e)})
            attrs["config"] = {**cfg, "docs": docs}
        else:
            src = engine.SOURCES.get(source)
            if src is None:
                raise serializers.ValidationError({"source": "Unknown report source."})
            if request is not None and not engine.source_allowed(src, request.user):
                raise serializers.ValidationError({"source": "You do not have access to this data source."})
            attrs["module"] = src["module"]
            try:
                attrs["config"] = engine.clean_config(source, get("config", {}))
            except engine.ReportConfigError as e:
                raise serializers.ValidationError({"config": str(e)})
        if get("audience") == "roles" and not (attrs.get("audience_roles", get("audience_roles")) or []):
            raise serializers.ValidationError({"audience_roles": "Choose at least one role."})
        return attrs


def _parse_day(raw, label):
    try:
        return datetime.date.fromisoformat(str(raw))
    except (TypeError, ValueError):
        raise engine.ReportConfigError(f"Choose a valid {label} date.")


def _hide(request):
    return request.data.get("hide_phi") is True


def _audit(request, org, source, action, result, start, end, report=None, src=None):
    if not (src or engine.SOURCES[source])["patient_data"]:
        return
    hidden = result.get("phi") == "hidden"
    if action == "preview":
        # The builder re-runs its preview as you type: keep one row per person and source per few minutes.
        recent = timezone.now() - datetime.timedelta(minutes=10)
        row = ReportAuditLog.objects.filter(
            organization=org, user=request.user, source=source, action="preview", phi_hidden=hidden, created_at__gte=recent
        ).first()
        if row:
            ReportAuditLog.objects.filter(pk=row.pk).update(row_count=result.get("row_count", 0), range_start=start, range_end=end)
            return
    ReportAuditLog.objects.create(
        organization=org, user=request.user, report=report, report_name=(report.name if report else "")[:120],
        source=source, action=action, phi_hidden=hidden,
        row_count=result.get("row_count", 0), range_start=start, range_end=end,
    )


def _range(request, source_key):
    if source_key != "linked" and not engine.get_source(source_key)["dated"]:
        return None, None
    return _parse_day(request.data.get("start"), "start"), _parse_day(request.data.get("end"), "end")


class CustomReportViewSet(viewsets.ModelViewSet):
    serializer_class = CustomReportSerializer
    permission_classes = [IsStaffingManager]

    def get_queryset(self):
        qs = _org_queryset(CustomReport, self.request).select_related("created_by")
        user = self.request.user
        ids = [r.pk for r in qs if _can_see(user, r) and _source_ok(r.source, user, r)]
        return qs.filter(pk__in=ids)

    def get_object(self):
        obj = _org_queryset(CustomReport, self.request).select_related("created_by").filter(pk=self.kwargs["pk"]).first()
        if obj is None or not _can_see(self.request.user, obj) or not _source_ok(obj.source, self.request.user, obj):
            from rest_framework.exceptions import NotFound

            raise NotFound()
        return obj

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, **org_scope.create_kwargs(self.request))

    def update(self, request, *args, **kwargs):
        if not _can_edit(request.user, self.get_object()):
            return Response({"error": "Only the owner or an admin can change this report."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not _can_edit(request.user, self.get_object()):
            return Response({"error": "Only the owner or an admin can delete this report."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="sources")
    def sources(self, request):
        # Documentation reports have their own builder (they carry the notes and observations they were built for).
        return Response([engine.source_summary(s) for s in engine.SOURCES.values() if s["key"] != documentation.DOC_KEY and engine.source_allowed(s, request.user)])

    @action(detail=True, methods=["post"], url_path="run")
    def run(self, request, pk=None):
        report = self.get_object()
        try:
            start, end = _range(request, report.source)
            src, cfg = _prepare(report.source, report.config, request.user, report.organization, _hide(request))
            result = engine.run_report(
                report.source, report.organization, cfg, start, end, request.data.get("narrow"),
                user=request.user, hide_phi=_hide(request), src=src,
            )
        except engine.ReportConfigError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(request, report.organization, report.source, "run", result, start, end, report, src)
        CustomReport.objects.filter(pk=report.pk).update(last_run_at=timezone.now())
        return Response(result)

    @action(detail=False, methods=["post"], url_path="preview")
    def preview(self, request):
        org = org_scope.acting_org(request, allow_body=True)
        if org is None:
            return Response({"error": "Choose an organization first."}, status=status.HTTP_400_BAD_REQUEST)
        source = request.data.get("source")
        if source == "linked":
            try:
                linked.clean_canvas((request.data.get("config") or {}).get("canvas"), request.user)
            except engine.ReportConfigError as e:
                code = status.HTTP_403_FORBIDDEN if "access to" in str(e) else status.HTTP_400_BAD_REQUEST
                return Response({"error": str(e)}, status=code)
        elif not _source_ok(source, request.user):
            return Response({"error": "You do not have access to this data source."}, status=status.HTTP_403_FORBIDDEN)
        try:
            start, end = _range(request, source)
            src, cfg = _prepare(source, request.data.get("config"), request.user, org, _hide(request))
            result = engine.run_report(
                source, org, cfg, start, end, None, user=request.user, hide_phi=_hide(request), src=src
            )
        except engine.ReportConfigError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        _audit(request, org, source, "preview", result, start, end, src=src)
        return Response(result)

    @action(detail=False, methods=["get"], url_path="linked-catalog")
    def linked_catalog(self, request):
        return Response(linked.catalog(request.user))

    @action(detail=False, methods=["get"], url_path="documentation-catalog")
    def documentation_catalog(self, request):
        """The notes to pick from and the observations of the ones picked (?templates=a,b)."""
        if not _source_ok(documentation.DOC_KEY, request.user):
            return Response({"error": "You do not have access to documentation reports."}, status=status.HTTP_403_FORBIDDEN)
        org = org_scope.acting_org(request)
        if org is None:
            return Response({"error": "Choose an organization first."}, status=status.HTTP_400_BAD_REQUEST)
        codes = [c for c in (request.query_params.get("templates") or "").split(",") if c.strip()]
        return Response(documentation.catalog(request.user, org, codes))

    @action(detail=False, methods=["get"], url_path="audit")
    def audit(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"error": "Only administrators can see the report audit log."}, status=status.HTTP_403_FORBIDDEN)
        org = org_scope.acting_org(request)
        if org is None:
            return Response([])
        rows = ReportAuditLog.objects.filter(organization=org).select_related("user")[:200]
        return Response(
            [
                {
                    "id": r.id,
                    "at": r.created_at.isoformat(),
                    "user": (r.user.get_full_name() or r.user.get_username()) if r.user else "Removed user",
                    "report": r.report_name or "Builder preview",
                    "source": r.source,
                    "source_label": "Linked report" if r.source == "linked" else (engine.SOURCES[r.source]["label"] if r.source in engine.SOURCES else r.source),
                    "action": r.action,
                    "phi_hidden": r.phi_hidden,
                    "row_count": r.row_count,
                    "range_start": r.range_start.isoformat() if r.range_start else None,
                    "range_end": r.range_end.isoformat() if r.range_end else None,
                }
                for r in rows
            ]
        )
