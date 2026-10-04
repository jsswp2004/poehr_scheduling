"""
Which organization is a staffing request acting on?

Everyone acts on their own organization. A system admin (platform level) may
pick any organization by sending ?organization=<id> on a request; the web
Staffing Center's organization switcher does this on every call. For anyone
else the parameter is ignored, so an org admin can never reach another org.

Without a pick, a system admin keeps the original behaviour (list views show
every organization; creates go to their own organization unless the body names
one), so existing clients such as the mobile app are unaffected.
"""

from rest_framework.exceptions import ValidationError


def is_system_admin(user):
    return getattr(user, "role", None) == "system_admin"


def requested_org_id(request, allow_body=False):
    """The organization id a system admin asked for, else None.

    `allow_body` also honours an "organization" field in the request body
    (used by create/upload paths, as before).
    """
    if not is_system_admin(request.user):
        return None
    raw = request.query_params.get("organization")
    if raw in (None, "") and allow_body:
        data = getattr(request, "data", None)
        raw = data.get("organization") if hasattr(data, "get") else None
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def acting_org(request, allow_body=False):
    """The Organization this request acts on (None if none / not found)."""
    from users.models import Organization

    oid = requested_org_id(request, allow_body=allow_body)
    if oid is not None:
        return Organization.objects.filter(pk=oid).first()
    return getattr(request.user, "organization", None)


def create_kwargs(request):
    """kwargs for serializer.save() so a new record lands in the right org."""
    oid = requested_org_id(request, allow_body=True)
    if oid is None:
        return {"organization": request.user.organization}
    from users.models import Organization

    org = Organization.objects.filter(pk=oid).first()
    if org is None:
        raise ValidationError({"organization": "Organization not found."})
    return {"organization": org}
