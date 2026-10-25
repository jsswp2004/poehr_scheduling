"""
Report export + report subscriptions (Reports tab).

    GET    /api/staffing/reports/export/<kind>/?file=pdf|csv&start=&end=&...   one report as a file
    GET    /api/staffing/report-subscriptions/                                 list
    POST   /api/staffing/report-subscriptions/                                 create
    PATCH  /api/staffing/report-subscriptions/<id>/                            edit, pause (is_active)
    DELETE /api/staffing/report-subscriptions/<id>/                            delete
    POST   /api/staffing/report-subscriptions/<id>/send-now/   {"to": "me"|"everyone"}
    POST   /api/staffing/report-subscriptions/send-test/       a draft, emailed to the requester only

Managers can export; only admins can create, change or send subscriptions.
"""

import datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import org_scope, report_export, report_subscriptions as subs
from .models import ReportSubscription
from .views import ADMIN_ROLES, IsStaffingManager, _org_queryset


class IsStaffingAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in ADMIN_ROLES)


class ReportExportView(APIView):
    permission_classes = [IsStaffingManager]

    def get(self, request, kind):
        fmt = (request.query_params.get("file") or "pdf").lower()
        org = org_scope.acting_org(request)
        params = {k: request.query_params.get(k) for k in ("start", "end", "date", *subs.PARAM_KEYS)}
        try:
            report = report_export.build_report(kind, fmt, request.user, org, params, tz=request.query_params.get("tz"))
        except report_export.ReportError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return report_export.http_response(report)


def _clean_emails(values):
    if not isinstance(values, list):
        raise serializers.ValidationError("Recipients must be a list of email addresses.")
    out, seen = [], set()
    for raw in values:
        email = str(raw or "").strip().lower()
        if not email or email in seen:
            continue
        try:
            validate_email(email)
        except DjangoValidationError:
            raise serializers.ValidationError(f"'{raw}' is not a valid email address.")
        seen.add(email)
        out.append(email)
    if len(out) > subs.MAX_RECIPIENTS:
        raise serializers.ValidationError(f"At most {subs.MAX_RECIPIENTS} recipients.")
    return out


class ReportSubscriptionSerializer(serializers.ModelSerializer):
    schedule_text = serializers.SerializerMethodField()
    covers_text = serializers.SerializerMethodField()
    report_label = serializers.SerializerMethodField()

    class Meta:
        model = ReportSubscription
        fields = [
            "id", "report", "report_label", "params", "frequency", "weekday", "month_day", "send_hour",
            "timezone", "covers", "covers_text", "formats", "recipients", "is_active", "schedule_text",
            "next_run_at", "last_run_at", "last_status", "last_detail", "created_at",
        ]
        read_only_fields = ["next_run_at", "last_run_at", "last_status", "last_detail", "created_at"]

    def get_schedule_text(self, obj):
        return subs.describe_schedule(obj)

    def get_covers_text(self, obj):
        return subs.COVERS.get(obj.covers, obj.covers)

    def get_report_label(self, obj):
        return report_export.REPORTS.get(obj.report, (obj.report,))[0]

    def validate_report(self, value):
        if value not in report_export.REPORTS:
            raise serializers.ValidationError("Unknown report.")
        return value

    def validate_recipients(self, value):
        return _clean_emails(value)

    def validate_weekday(self, value):
        if not 0 <= value <= 6:
            raise serializers.ValidationError("Choose a day of the week.")
        return value

    def validate_month_day(self, value):
        if not 0 <= value <= 31:
            raise serializers.ValidationError("Choose a day from 1 to 31, or the last day.")
        return value

    def validate_send_hour(self, value):
        if not 0 <= value <= 23:
            raise serializers.ValidationError("Choose an hour of the day.")
        return value

    def validate_timezone(self, value):
        try:
            subs.ZoneInfo(value)
        except Exception:
            raise serializers.ValidationError("Unknown time zone.")
        return value

    def validate_params(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Filters must be an object.")
        return {k: v for k, v in value.items() if k in subs.PARAM_KEYS and v not in (None, "")}

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        report, covers = get("report"), get("covers")
        if covers not in subs.COVERS:
            raise serializers.ValidationError({"covers": "Choose what period the report covers."})
        if report == "daily_forms" and covers not in subs.SINGLE_DAY_COVERS:
            raise serializers.ValidationError({"covers": "Daily staffing forms cover a single day."})
        allowed = report_export.REPORTS[report][1]
        formats = [f for f in (get("formats") or []) if f in allowed]
        if not formats:
            raise serializers.ValidationError({"formats": f"Choose a file type ({' or '.join(x.upper() for x in allowed)})."})
        attrs["formats"] = list(dict.fromkeys(formats))
        if not self.partial or "recipients" in attrs:
            if not get("recipients"):
                raise serializers.ValidationError({"recipients": "Add at least one recipient."})
        return attrs


class ReportSubscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = ReportSubscriptionSerializer
    permission_classes = [IsStaffingAdmin]

    def get_queryset(self):
        return _org_queryset(ReportSubscription, self.request).select_related("organization", "created_by")

    def _refresh_schedule(self, sub):
        sub.next_run_at = subs.compute_next_run(sub) if sub.is_active else None
        sub.save(update_fields=["next_run_at"])

    def perform_create(self, serializer):
        sub = serializer.save(created_by=self.request.user, **org_scope.create_kwargs(self.request))
        self._refresh_schedule(sub)

    def perform_update(self, serializer):
        sub = serializer.save()
        self._refresh_schedule(sub)

    @action(detail=True, methods=["post"], url_path="send-now")
    def send_now(self, request, pk=None):
        sub = self.get_object()
        if request.data.get("to") == "everyone":
            targets = list(sub.recipients or [])
        else:
            if not request.user.email:
                return Response({"error": "Your account has no email address."}, status=400)
            targets = [request.user.email]
        status_, detail = subs.deliver(sub, recipients=targets, record=request.data.get("to") == "everyone", user=request.user)
        code = status.HTTP_200_OK if status_ != "failed" else status.HTTP_502_BAD_GATEWAY
        return Response({"status": status_, "detail": detail}, status=code)

    @action(detail=False, methods=["post"], url_path="send-test")
    def send_test(self, request):
        """Email the draft to the requester only, without saving it."""
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        data.setdefault("recipients", [request.user.email or "me@example.com"])
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        if not request.user.email:
            return Response({"error": "Your account has no email address."}, status=400)
        org = org_scope.acting_org(request, allow_body=True) or request.user.organization
        draft = ReportSubscription(
            organization=org, created_by=request.user, **{k: v for k, v in serializer.validated_data.items()}
        )
        status_, detail = subs.deliver(draft, recipients=[request.user.email], record=False, user=request.user)
        code = status.HTTP_200_OK if status_ != "failed" else status.HTTP_502_BAD_GATEWAY
        return Response({"status": status_, "detail": detail, "sent_to": request.user.email}, status=code)
