"""API for the header search (see global_search.py)."""

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import global_search
from .models import SearchAudit


class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return global_search.can_search(request.user)


class SearchView(APIView):
    """GET /api/search/?q=santos[&care=acute] -> patients, visits and close spellings. No q: my patients."""

    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get(self, request):
        data = global_search.search(request.user, request.query_params.get("q", ""), care=request.query_params.get("care") or None)
        return Response(data)


class SearchOpenedView(APIView):
    """POST {patient, visit?, q?, action?} -> note that a chart was opened from search (for the audit log)."""

    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def post(self, request):
        patient_id = request.data.get("patient")
        if not str(patient_id or "").isdigit():
            return Response({"detail": "patient is required."}, status=status.HTTP_400_BAD_REQUEST)
        patient = global_search._patients(request.user).filter(user_id=int(patient_id)).first()
        if patient is None:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)
        visit = request.data.get("visit")
        visit_id = None
        if str(visit or "").isdigit():
            visit_id = global_search._visits(request.user).filter(pk=int(visit), patient=patient).values_list("pk", flat=True).first()
        kind, query = global_search.kind_for_audit(str(request.data.get("q") or ""))
        SearchAudit.objects.create(
            user=request.user,
            organization=patient.user.organization,
            patient=patient.user,
            registration_id=visit_id,
            kind=kind,
            query=query,
            action=str(request.data.get("action") or "chart")[:20],
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
