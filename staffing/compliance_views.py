"""
Calendar coverage colors + clinic location.

  GET   /api/staffing/coverage-status/?start=&end=&unit=   per-day met / at_risk / not_met
  GET   /api/staffing/location/                            clinic state/address + rule in force
  PATCH /api/staffing/location/                            (admin) set state/address/spare buffer

The same coverage-status payload feeds the web calendar and the mobile app, so
both color days identically.
"""

import datetime

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Organization
from users.us_states import US_STATE_NAMES, normalize_state

from . import org_scope, state_rules
from .coverage_status import compute_coverage_status
from .models import OrgStaffingRule
from .views import (
    ADMIN_ROLES,
    IsStaffingManager,
    IsStaffingManagerOrStaffReadOnly,
    _parse_date_cell,
)


def _org_for(request):
    """The caller's organization; a system admin may pass ?organization=<id>."""
    return org_scope.acting_org(request)


class CoverageStatusView(APIView):
    permission_classes = [IsStaffingManagerOrStaffReadOnly]

    def get(self, request):
        org = _org_for(request)
        if org is None:
            return Response({"error": "No organization for this user."}, status=400)

        today = timezone.localdate()
        try:
            start = _parse_date_cell(request.query_params.get("start"), "start") or today.replace(day=1)
            end = _parse_date_cell(request.query_params.get("end"), "end") or (start + datetime.timedelta(days=41))
            unit = request.query_params.get("unit") or None
            if unit is not None:
                unit = int(unit)
            return Response(compute_coverage_status(org, start, end, unit_id=unit))
        except ValueError as e:
            return Response({"error": str(e)}, status=400)


def _location_payload(org):
    resolved = state_rules.resolve_rule_for_org(org)
    choice = OrgStaffingRule.objects.filter(organization=org).first()
    return {
        "organization_id": org.id,
        "address_line1": org.address_line1,
        "address_line2": org.address_line2,
        "city": org.city,
        "state": org.state,
        "state_name": US_STATE_NAMES.get(org.state, ""),
        "postal_code": org.postal_code,
        "staffing_spare_buffer": org.staffing_spare_buffer,
        "rule": resolved.rule.as_dict() if resolved.rule else None,
        "warning": resolved.warning,
        "states_with_rules": state_rules.states_with_rules(),
        "selected_rule_id": choice.rule_id if choice else None,
    }


class OrgLocationView(APIView):
    permission_classes = [IsStaffingManagerOrStaffReadOnly]

    def get(self, request):
        org = _org_for(request)
        if org is None:
            return Response({"error": "No organization for this user."}, status=400)
        return Response(_location_payload(org))

    def patch(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"error": "Only admins can change the clinic location."}, status=403)
        org = _org_for(request)
        if org is None:
            return Response({"error": "No organization for this user."}, status=400)

        data = request.data
        if "state" in data:
            raw = (data.get("state") or "").strip()
            code = normalize_state(raw)
            if raw and not code:
                return Response({"error": f"'{raw}' is not a valid US state."}, status=400)
            org.state = code
        for field, limit in (("address_line1", 255), ("address_line2", 255), ("city", 100), ("postal_code", 10)):
            if field in data:
                setattr(org, field, (data.get(field) or "").strip()[:limit])
        if "staffing_spare_buffer" in data:
            try:
                buf = int(data.get("staffing_spare_buffer"))
            except (TypeError, ValueError):
                return Response({"error": "staffing_spare_buffer must be 0, 1 or 2."}, status=400)
            if buf not in (0, 1, 2):
                return Response({"error": "staffing_spare_buffer must be 0, 1 or 2."}, status=400)
            org.staffing_spare_buffer = buf
        org.save()
        return Response(_location_payload(org), status=status.HTTP_200_OK)
