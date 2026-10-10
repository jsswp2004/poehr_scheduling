"""Remove a person from an organization.

Someone with no clinical history is deleted. Someone who has ordered, documented, prescribed or messaged is
deactivated instead, so everything they signed keeps their name. Admins act within their own organization;
system admins act on any organization. Deactivated people can be restored.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CustomUser

REMOVERS = ("admin", "system_admin")

# Rows here do not make a person "have history": they are settings or login plumbing that go with the account.
HARMLESS = {
    "admin.LogEntry",
    "django_rest_passwordreset.ResetPasswordToken",
    "users.OnlineUser",
    "users.UserRightOverride",
    "users.StatusBoardPreference",
    "appointments.ChartTabLayout",
    "appointments.PrescriberProfile",
    "appointments.PrescriptionFavorite",
    "appointments.TaskGridColumns",
    "appointments.Availability",
    "secure_messaging.ThreadMember",
    "users.CustomUser",  # people whose "provider" or "removed by" points here
}


def history_of(user):
    """What this person has done in the system, as plain phrases (empty means nothing to preserve)."""
    reasons = []
    for rel in CustomUser._meta.related_objects:
        model = rel.related_model
        if model._meta.label in HARMLESS:
            continue
        if rel.field.name == "patient" and user.role != "patient":
            continue  # staff are not the patient on these records
        if model._base_manager.filter(**{rel.field.name: user}).exists():
            reasons.append(str(model._meta.verbose_name_plural))
    return sorted(set(reasons))


def _problem(request, target):
    """Why this person cannot be removed by the requester, as (message, status), or None."""
    me = request.user
    if me.role not in REMOVERS:
        return "Only administrators can remove people.", status.HTTP_403_FORBIDDEN
    if target.pk == me.pk:
        return "You cannot remove yourself.", status.HTTP_400_BAD_REQUEST
    if me.role != "system_admin":
        if target.role == "system_admin":
            return "Only a system administrator can remove a system administrator.", status.HTTP_403_FORBIDDEN
        if target.organization_id != me.organization_id:
            return "You can only remove people from your own organization.", status.HTTP_404_NOT_FOUND
    if target.role == "patient":
        return "Patients are not removed here.", status.HTTP_400_BAD_REQUEST
    if target.role == "admin" and target.is_active:
        others = CustomUser.objects.filter(organization_id=target.organization_id, role="admin", is_active=True).exclude(pk=target.pk)
        if not others.exists():
            return "This is the organization's last active administrator. Make someone else an administrator first.", status.HTTP_400_BAD_REQUEST
    return None


def _target(user_id):
    return CustomUser.objects.filter(pk=user_id).select_related("organization").first()


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def user_removal(request, user_id):
    """GET: what removing would do ("delete" or "deactivate"). POST: do it."""
    target = _target(user_id)
    if target is None:
        return Response({"error": "User not found."}, status=404)
    problem = _problem(request, target)
    if problem:
        return Response({"error": problem[0]}, status=problem[1])
    reasons = history_of(target)
    action = "deactivate" if reasons else "delete"
    if request.method == "GET":
        return Response({"action": action, "history": reasons, "already_removed": not target.is_active})
    if not target.is_active and action == "deactivate":
        return Response({"error": "This person is already removed."}, status=400)
    name = f"{target.first_name} {target.last_name}".strip() or target.username
    with transaction.atomic():
        _end_secure_conversations(target, request.user)
        if action == "delete":
            target.delete()
        else:
            target.is_active = False
            target.is_online = False
            target.removed_at = timezone.now()
            target.removed_by = request.user
            target.save(update_fields=["is_active", "is_online", "removed_at", "removed_by"])
            target.facilities.clear()
            _drop_overrides(target)
    return Response({"result": "deleted" if action == "delete" else "deactivated", "name": name, "history": reasons})


def _drop_overrides(target):
    from .models import UserRightOverride

    UserRightOverride.objects.filter(user=target).delete()


def _end_secure_conversations(target, actor):
    """Take the person out of their secure conversations (with a note in group and care-team threads)."""
    from secure_messaging import services
    from secure_messaging.models import ThreadMember

    for member in ThreadMember.objects.select_related("thread").filter(user=target, left_at__isnull=True):
        member.left_at = timezone.now()
        member.save(update_fields=["left_at"])
        if member.thread.kind != "direct":
            services.system_message(member.thread, actor, f"{services.display_name(target)} was removed from the organization")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def user_restore(request, user_id):
    """Bring a removed person back. Their facilities and extra rights were cleared and must be set again."""
    target = _target(user_id)
    if target is None:
        return Response({"error": "User not found."}, status=404)
    me = request.user
    if me.role not in REMOVERS:
        return Response({"error": "Only administrators can restore people."}, status=403)
    if me.role != "system_admin" and (target.organization_id != me.organization_id or target.role == "system_admin"):
        return Response({"error": "User not found."}, status=404)
    if target.is_active:
        return Response({"error": "This person is not removed."}, status=400)
    if target.removed_at is None:
        return Response({"error": "This account was deactivated another way, not by removal."}, status=400)
    target.is_active = True
    target.removed_at = None
    target.removed_by = None
    target.save(update_fields=["is_active", "removed_at", "removed_by"])
    return Response({"result": "restored"})
