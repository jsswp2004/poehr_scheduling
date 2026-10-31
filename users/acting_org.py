"""
Which organization a system administrator is working in.

A system administrator belongs to one organization of their own but may work in any other. They choose at
sign-in (and can change it from the header); the server remembers the choice for that person only and every
request they make is then about that one organization (see poehr_scheduling_backend.tenancy). Nobody else can
set it, and every choice is written to a log so it is clear who worked in which organization.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ActingOrganizationLog, CustomUser, Organization


def _org_json(org):
    return {"id": org.id, "name": org.name} if org else None


def _real_org(user):
    """The administrator's own organization (the request may be acting for another one)."""
    return Organization.objects.filter(pk=user.organization_id).first() if user.organization_id else None


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def acting_organization(request):
    user = request.user
    if getattr(user, "role", None) != "system_admin":
        return Response({"detail": "Only a system administrator can choose an organization."}, status=403)

    stored = CustomUser.objects.filter(pk=user.pk).values_list("acting_organization_id", flat=True).first()

    if request.method == "PUT":
        raw = request.data.get("organization")
        org = Organization.objects.filter(pk=raw).first() if raw not in (None, "") else None
        if org is None:
            return Response({"detail": "Choose an organization."}, status=400)
        source = "login" if request.data.get("source") == "login" else "header"
        CustomUser.objects.filter(pk=user.pk).update(acting_organization=org)
        ActingOrganizationLog.objects.create(user_id=user.pk, organization=org, organization_name=org.name, source=source)
        stored = org.pk

    chosen = Organization.objects.filter(pk=stored).first() if stored else None
    return Response({"organization": _org_json(chosen), "own": _org_json(_real_org(user))})
