"""
POWER MDS asks this site who is signed in.

POWER MDS is a separate application with its own database. It never sees passwords and does not hold this
site's signing key: for each sign-in token it receives, it calls this endpoint with that same token and
trusts the answer. The answer is only what MDS needs: who the person is, their role, the organization they
work for and the facilities of that organization they may use.

A person gets a session only when their role may use MDS and their organization has POWER MDS switched on
(system administrators are never blocked, same rule as every other module).
"""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .facility_scope import assigned_facility_ids
from .modules import has_module

MDS_ROLES = ("admin", "system_admin", "doctor", "nurse")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mds_session(request):
    from appointments.models import Facility

    user = request.user
    role = getattr(user, "role", None)
    if role not in MDS_ROLES:
        return Response({"detail": "POWER MDS is for clinical and administrator accounts.", "code": "role_not_allowed"}, status=status.HTTP_403_FORBIDDEN)

    org = getattr(user, "organization", None)
    if role != "system_admin" and not has_module(org, "mds"):
        return Response({"detail": "POWER MDS is not turned on for your organization.", "code": "module_not_enabled"}, status=status.HTTP_403_FORBIDDEN)
    if org is None:
        return Response({"detail": "Your account has no organization.", "code": "no_organization"}, status=status.HTTP_403_FORBIDDEN)

    facilities = Facility.objects.filter(organization=org, is_active=True)
    ids = assigned_facility_ids(user)
    if ids is not None:
        facilities = facilities.filter(pk__in=ids)

    return Response(
        {
            "user_id": user.pk,
            "name": (f"{user.first_name} {user.last_name}".strip() or user.username),
            "role": role,
            "organization": {"id": org.pk, "name": org.name},
            "facilities": [{"id": f.pk, "name": f.name} for f in facilities],
        }
    )
