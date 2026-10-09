"""
Which facilities a person works at.

Each user can be assigned to one or more facilities (hospitals or clinics) of their organization.
* No assignment: no restriction. They see every facility, as before.
* Assigned: their Acute and ED patient lists, the bed board, the ED board and the unit pickers
  show only those facilities.
* System admins are never restricted; they choose the clinic and facility themselves in Settings.

An administrator sets the assignment (users/<id>/facilities/); people cannot change their own.
"""

from django.db.models import Q


def assigned_facility_ids(user):
    """The facility ids this user is limited to, or None when they are not limited."""
    if user is None or not getattr(user, "pk", None) or getattr(user, "role", "") == "system_admin":
        return None
    rows = user.facilities.values_list("pk", "organization_id")
    if not rows:
        return None
    # only facilities of the user's own organization count (guards against a stale link after a move)
    return {pk for pk, org_id in rows if org_id == user.organization_id}


def limit_to_facilities(queryset, user, field):
    """Narrow `queryset` to the user's facilities; `field` is the lookup that reaches a facility id."""
    ids = assigned_facility_ids(user)
    if ids is None:
        return queryset
    return queryset.filter(**{f"{field}__in": ids})


def visit_facility_q(user, prefix=""):
    """
    A Q for visits the user may see: placed in one of their facilities, or not placed anywhere yet
    (a visit without a location belongs to no other hospital, so it must not disappear).
    Returns None when the user is not limited.
    """
    ids = assigned_facility_ids(user)
    if ids is None:
        return None
    return Q(**{f"{prefix}facility_id__in": ids}) | Q(**{f"{prefix}facility__isnull": True})
