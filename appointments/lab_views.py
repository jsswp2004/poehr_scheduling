"""API for lab reports: GET/POST/PATCH /api/lab-reports/ plus review and mark-in-error."""

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

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

    def _reload(self, report):
        """Fresh copy with result lines and history, so the response shows what was just saved."""
        return LabReport.objects.select_related("patient", "order", "entered_by", "reviewed_by").prefetch_related(
            "items", "events", "events__user"
        ).get(pk=report.pk)
