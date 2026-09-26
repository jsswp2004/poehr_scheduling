from rest_framework import permissions

from .rights import RIGHT_LABELS, user_has_right


def HasRight(code):
    """
    Returns a DRF permission class gating a view/action on a single right
    code from the users.rights registry (checked via
    users.rights.user_has_right, which merges the user's role defaults with
    any UserRightOverride rows for them).

    Usage: permission_classes = [permissions.IsAuthenticated, HasRight("csv.upload_patients")]

    A factory function rather than one parameterized class so each call
    site gets its own class (DRF instantiates permission_classes entries
    with no constructor args, so the code has to be baked in at class
    -definition time, not passed in later).
    """
    if code not in RIGHT_LABELS:
        raise ValueError(f"Unknown right code: {code!r}")

    class _HasRight(permissions.BasePermission):
        message = f"You don't have the '{RIGHT_LABELS[code]}' right."

        def has_permission(self, request, view):
            return bool(
                request.user
                and request.user.is_authenticated
                and user_has_right(request.user, code)
            )

    _HasRight.__name__ = f"HasRight_{code.replace('.', '_')}"
    return _HasRight
