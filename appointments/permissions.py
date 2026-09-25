from rest_framework import permissions

class IsAdminOrSystemAdmin(permissions.BasePermission):
    """
    Allows access to users with role 'admin', 'system_admin', or 'registrar', or is_staff as fallback.
    """
    def has_permission(self, request, view):
        user = request.user
        # Debug print for troubleshooting
        print(f"[DEBUG] IsAdminOrSystemAdmin: user={user}, role={getattr(user, 'role', None)}, is_staff={getattr(user, 'is_staff', None)}")
        return (
            user.is_authenticated and (
                getattr(user, 'role', None) in ['admin', 'system_admin', 'registrar']
                or getattr(user, 'is_staff', False)
            )
        )

class CanSendMessages(permissions.BasePermission):
    """
    Allows access to users who can send emails and SMS: admin, system_admin, or registrar.
    """
    def has_permission(self, request, view):
        user = request.user
        print(f"[DEBUG] CanSendMessages: user={user}, role={getattr(user, 'role', None)}")
        return (
            user.is_authenticated and 
            getattr(user, 'role', None) in ['admin', 'system_admin', 'registrar']
        )


class CanAccessClinicalNotes(permissions.BasePermission):
    """
    Doctors, nurses, admins, and system_admins can view/author clinical notes.
    Patients (and any other role) have no access — a patient-facing "view my
    notes" feature is a separate, deliberate decision to make later.

    A signed note can never be edited by anyone (object-level check below) —
    corrections must go through the addendum endpoint instead.
    """
    ALLOWED_ROLES = ["doctor", "nurse", "admin", "system_admin"]

    def has_permission(self, request, view):
        user = request.user
        return (
            user.is_authenticated
            and getattr(user, "role", None) in self.ALLOWED_ROLES
        )

    def has_object_permission(self, request, view, obj):
        # `sign` and `addend` are exempt from the signed-note lock below:
        # `sign` re-checks status itself and returns a friendly 400 for an
        # already-signed note, and `addend` operates BY DEFINITION on an
        # already-signed note -- that IS the addendum feature. Without this
        # exemption, DRF's automatic check_object_permissions() (triggered
        # by get_object() inside those actions) blocks every addend call
        # with a 403 before the view code ever runs.
        if getattr(view, "action", None) in ("sign", "addend"):
            return True
        # Otherwise: signed notes are read-only for everyone from this
        # point forward (plain update/partial_update/destroy).
        if request.method not in permissions.SAFE_METHODS and obj.status == "signed":
            return False
        return True


class CanAuthorClinicalNoteType(permissions.BasePermission):
    """
    Enforces that a nurse can only author 'nursing_assessment' notes and a
    doctor can only author 'doctor_assessment' notes. Admins/system_admins
    may author either (useful for demo/testing and correcting data).

    This only applies to the ViewSet's `create` action (a plain POST to the
    list endpoint, i.e. "save draft" / "sign immediately without a draft").
    It must NOT run against the custom `sign` / `addend` @action POST
    endpoints: `sign` sends no body at all (so note_type is always None,
    which would deny every sign request for doctors/nurses), and `addend`
    already forces note_type server-side from the original note.
    """

    def has_permission(self, request, view):
        if getattr(view, "action", None) != "create":
            return True
        user = request.user
        note_type = request.data.get("note_type")
        if getattr(user, "role", None) in ("admin", "system_admin"):
            return True
        expected = {
            "nurse": "nursing_assessment",
            "doctor": "doctor_assessment",
        }.get(getattr(user, "role", None))
        return expected is not None and note_type == expected