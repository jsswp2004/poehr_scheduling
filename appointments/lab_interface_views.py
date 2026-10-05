"""
Lab interface endpoints.

  POST /api/lab-interface/hl7/   raw HL7 v2 ORU text   -> HL7 ACK (text/plain)
  POST /api/lab-interface/fhir/  FHIR R4 Bundle (JSON)  -> JSON status

Both are called by a lab's interface engine, not by a person, so they are
authenticated with the connection's secret key (header X-Interface-Key) and not
with a login. Staff work the unmatched queue through /api/lab-messages/.
"""

import json

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from users.rights import user_has_right

from . import lab_hl7, lab_intake, lab_results
from .models import LabInboundMessage

MAX_BODY_BYTES = 5 * 1024 * 1024


def _read_body(request):
    if int(request.META.get("CONTENT_LENGTH") or 0) > MAX_BODY_BYTES:
        return None
    raw = request.body
    if len(raw) > MAX_BODY_BYTES:
        return None
    return raw.decode("utf-8", errors="replace").lstrip("﻿")


def _strip_mllp(text):
    return text.replace("\x0b", "").replace("\x1c", "").lstrip("\r\n ")


def _hl7_response(outcome, status=None):
    code = outcome.ack
    if outcome.duplicate:
        code = "AA"
    body = lab_hl7.build_ack(code, outcome.control_id, outcome.text, outcome.sending_app, outcome.sending_facility)
    return HttpResponse(body, status=status or outcome.http_status, content_type="text/plain; charset=utf-8")


@csrf_exempt
@require_POST
def hl7_intake(request):
    connection = lab_intake.authenticate(request.META.get("HTTP_X_INTERFACE_KEY", ""))
    if connection is None:
        return HttpResponse("Invalid or missing interface key.", status=401, content_type="text/plain")
    raw = _read_body(request)
    if raw is None:
        return _hl7_response(lab_intake.Outcome(413, "AR", "Message is too large."))
    outcome = lab_intake.process_message(connection, "hl7", _strip_mllp(raw))
    return _hl7_response(outcome)


@csrf_exempt
@require_POST
def fhir_intake(request):
    connection = lab_intake.authenticate(request.META.get("HTTP_X_INTERFACE_KEY", ""))
    if connection is None:
        return JsonResponse({"detail": "Invalid or missing interface key."}, status=401)
    raw = _read_body(request)
    if raw is None:
        return JsonResponse({"detail": "Message is too large."}, status=413)
    outcome = lab_intake.process_message(connection, "fhir", raw)
    body = {
        "resourceType": "OperationOutcome",
        "issue": [
            {
                "severity": "information" if outcome.http_status == 200 else "error",
                "code": "informational" if outcome.http_status == 200 else "invalid",
                "diagnostics": outcome.text,
            }
        ],
        "control_id": outcome.control_id,
        "status": "duplicate" if outcome.duplicate else outcome.message_status,
        "report_ids": outcome.report_ids,
    }
    return JsonResponse(body, status=outcome.http_status)


class CanWorkLabMessages(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user_has_right(user, "lab_results.enter")


class LabInboundMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Messages from labs. ?status=unmatched (default) lists those waiting for a
    person; actions: POST assign {patient | mrn}, POST dismiss {reason}.
    """

    permission_classes = [permissions.IsAuthenticated, CanWorkLabMessages]

    def handle_exception(self, exc):
        if isinstance(exc, lab_results.LabResultError):
            return Response({"detail": exc.message}, status=exc.status_code)
        return super().handle_exception(exc)

    def get_queryset(self):
        user = self.request.user
        qs = LabInboundMessage.objects.select_related("connection", "resolved_by")
        if getattr(user, "role", None) != "system_admin":
            qs = qs.filter(organization=user.organization)
        if self.action == "list":
            qs = qs.filter(status=self.request.query_params.get("status") or "unmatched")
        return qs

    @staticmethod
    def _row(m, with_raw=False):
        row = {
            "id": m.pk,
            "status": m.status,
            "format": m.message_format,
            "control_id": m.control_id,
            "lab": m.connection.lab_name or m.connection.name,
            "patient_hint": m.patient_hint,
            "detail": m.detail,
            "received_at": m.received_at,
            "resolved_at": m.resolved_at,
            "resolved_by": (m.resolved_by.get_full_name() or m.resolved_by.username) if m.resolved_by else None,
        }
        if with_raw:
            row["raw"] = m.raw
        return row

    def list(self, request, *args, **kwargs):
        rows = [self._row(m) for m in self.get_queryset()[:200]]
        return Response({"count": len(rows), "results": rows})

    def retrieve(self, request, *args, **kwargs):
        return Response(self._row(self.get_object(), with_raw=True))

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        message = self.get_object()
        user = request.user
        patient = None
        if request.data.get("patient"):
            try:
                patient = lab_results._find_patient(user, int(request.data["patient"]))
            except (TypeError, ValueError):
                raise lab_results.LabResultError("Patient not found.", 404)
        elif str(request.data.get("mrn") or "").strip():
            from users.models import Patient

            profile = Patient.objects.filter(
                organization=message.organization, mrn__iexact=str(request.data["mrn"]).strip()
            ).select_related("user").first()
            if profile is None:
                raise lab_results.LabResultError("No patient in this organization has that MRN.", 404)
            patient = profile.user
        else:
            raise lab_results.LabResultError("Give the patient's MRN.")
        report_ids = lab_intake.assign_message(message, user, patient)
        message.refresh_from_db()
        return Response({**self._row(message), "report_ids": report_ids})

    @action(detail=True, methods=["post"])
    def dismiss(self, request, pk=None):
        message = lab_intake.dismiss_message(self.get_object(), request.user, request.data.get("reason"))
        return Response(self._row(message))
