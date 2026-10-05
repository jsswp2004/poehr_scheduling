"""API for lab reports: GET/POST/PATCH /api/lab-reports/ plus review and mark-in-error."""

from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.serializers import DateTimeField, ValidationError

from users.rights import user_has_right

from . import lab_results
from .lab_serializers import LabReportInputSerializer, LabReportSerializer
from .models import LabReport


class CanAccessLabResults(permissions.BasePermission):
    """
    One right per kind of action (users.rights, "lab_results.*"):
    viewing, entering/changing, and reviewing are granted separately.
    """

    ACTION_RIGHTS = {
        "list": "lab_results.view",
        "retrieve": "lab_results.view",
        "create": "lab_results.enter",
        "partial_update": "lab_results.enter",
        "mark_error": "lab_results.enter",
        "review": "lab_results.review",
        "inbox": "lab_results.review",
        "upload": "lab_results.upload",
        "file": "lab_results.view",
    }

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        right = self.ACTION_RIGHTS.get(getattr(view, "action", None), "lab_results.view")
        return user_has_right(user, right)


class LabReportViewSet(viewsets.ModelViewSet):
    """
    Lab reports for the user's organization. Reports are never deleted
    (no DELETE, no PUT): a wrong one is marked entered in error.

    Filters: ?patient=  ?order=  ?review_status=unreviewed|reviewed
             ?status=  ?source=  ?abnormal=1
    """

    serializer_class = LabReportSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessLabResults]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def handle_exception(self, exc):
        if isinstance(exc, lab_results.LabResultError):
            body = {"detail": exc.message}
            if exc.errors:
                body["errors"] = exc.errors
            return Response(body, status=exc.status_code)
        return super().handle_exception(exc)

    def get_queryset(self):
        user = self.request.user
        qs = LabReport.objects.all()
        if getattr(user, "role", None) != "system_admin":
            qs = qs.filter(organization=user.organization)
        p = self.request.query_params
        for param, lookup in (
            ("patient", "patient_id"),
            ("order", "order_id"),
            ("review_status", "review_status"),
            ("status", "status"),
            ("source", "source"),
        ):
            value = p.get(param)
            if value:
                qs = qs.filter(**{lookup: value})
        if p.get("abnormal") in ("1", "true", "True"):
            qs = qs.filter(items__abnormal_flag__gt="").distinct()
        return qs.select_related("patient", "order", "entered_by", "reviewed_by").prefetch_related(
            "items", "events", "events__user"
        )

    def _validated(self, request, partial):
        ser = LabReportInputSerializer(data=request.data, partial=partial)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        if "items" in data:
            data["items"] = [dict(i) for i in data["items"]]
        return data

    def create(self, request, *args, **kwargs):
        data = self._validated(request, partial=False)
        if "patient" not in data:
            raise lab_results.LabResultError("Choose the patient this result is for.")
        report = lab_results.create_report(request.user, data, source="manual")
        return Response(self.get_serializer(self._reload(report)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        report = self.get_object()
        data = self._validated(request, partial=True)
        data.pop("patient", None)  # a report never moves to another patient
        report = lab_results.update_report(report, request.user, data)
        return Response(self.get_serializer(self._reload(report)).data)

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        report = lab_results.review_report(self.get_object(), request.user, request.data.get("comment", ""))
        return Response(self.get_serializer(self._reload(report)).data)

    @action(detail=True, methods=["post"], url_path="mark-error")
    def mark_error(self, request, pk=None):
        report = lab_results.mark_entered_in_error(
            self.get_object(), request.user, request.data.get("reason", "")
        )
        return Response(self.get_serializer(self._reload(report)).data)

    INBOX_LIMIT = 200

    @action(detail=False, methods=["get"])
    def inbox(self, request):
        """
        Everything waiting for review across the organization, most urgent first:
        critical values, then other abnormal results, then the oldest. Any user with
        the review right sees all of it (the ordering provider, a covering provider
        or a nurse); ?mine=1 narrows it to results for orders this user placed.
        """
        qs = self.get_queryset().filter(review_status="unreviewed").exclude(status="entered_in_error")
        if request.query_params.get("mine") in ("1", "true", "True"):
            qs = qs.filter(order__ordering_provider=request.user)
        reports = list(qs)

        def urgency(report):
            has_abnormal, has_critical = lab_results.report_flags(report)
            when = report.resulted_at or report.created_at
            return (not has_critical, not has_abnormal, when)

        reports.sort(key=urgency)
        critical = sum(1 for r in reports if lab_results.report_flags(r)[1])
        shown = reports[: self.INBOX_LIMIT]
        from .models import LabInboundMessage

        unmatched = LabInboundMessage.objects.filter(status="unmatched")
        if getattr(request.user, "role", None) != "system_admin":
            unmatched = unmatched.filter(organization=request.user.organization)
        return Response(
            {
                "unmatched": unmatched.count() if user_has_right(request.user, "lab_results.enter") else 0,
                "count": len(reports),
                "critical": critical,
                "truncated": len(reports) > len(shown),
                "results": self.get_serializer(shown, many=True).data,
            }
        )

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        """
        POST multipart: file, patient, and optionally title, order, performing_lab,
        collected_at, comment, allow_duplicate. Front-desk staff may upload without
        being able to read results back; they get a short confirmation only.
        """
        form = request.data

        def text(name):
            value = form.get(name)
            return value.strip() if isinstance(value, str) else value

        try:
            patient = int(text("patient"))
        except (TypeError, ValueError):
            raise lab_results.LabResultError("Choose the patient this scan is for.")
        order = text("order")
        try:
            order = int(order) if order not in (None, "") else None
        except ValueError:
            raise lab_results.LabResultError("That order was not found for this patient.", 404)
        collected_at = None
        if text("collected_at"):
            try:
                collected_at = DateTimeField().to_internal_value(text("collected_at"))
            except ValidationError:
                raise lab_results.LabResultError("The collection date and time are not valid.")
        data = {
            "patient": patient,
            "order": order,
            "title": text("title") or "",
            "performing_lab": text("performing_lab") or "",
            "comment": text("comment") or "",
            "collected_at": collected_at,
        }
        allow_duplicate = str(text("allow_duplicate") or "").lower() in ("1", "true", "yes")
        report = lab_results.create_scanned_report(
            request.user, data, request.FILES.get("file"), allow_duplicate=allow_duplicate
        )
        if user_has_right(request.user, "lab_results.view"):
            body = self.get_serializer(self._reload(report)).data
        else:
            body = {
                "id": report.pk,
                "title": report.title,
                "file_name": report.file_name,
                "file_size": report.file_size,
                "created_at": report.created_at,
                "detail": "Uploaded. A clinician will review it.",
            }
        return Response(body, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        """The scanned document itself. Every opening is recorded in the report's history."""
        content, content_type, filename = lab_results.read_report_file(self.get_object(), request.user)
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "no-store"
        response["Content-Security-Policy"] = "sandbox"
        return response

    def _reload(self, report):
        """Fresh copy with result lines and history, so the response shows what was just saved."""
        return LabReport.objects.select_related("patient", "order", "entered_by", "reviewed_by").prefetch_related(
            "items", "events", "events__user"
        ).get(pk=report.pk)
