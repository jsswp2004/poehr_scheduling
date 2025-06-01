from rest_framework import permissions

class IsAdminOrSystemAdmin(permissions.BasePermission):
    """
    Allows access to users with role 'admin' or 'system_admin', or is_staff as fallback.
    """
    def has_permission(self, request, view):
        user = request.user
        # Debug print for troubleshooting
        print(f"[DEBUG] IsAdminOrSystemAdmin: user={user}, role={getattr(user, 'role', None)}, is_staff={getattr(user, 'is_staff', None)}")
        return (
            user.is_authenticated and (
                getattr(user, 'role', None) in ['admin', 'system_admin']
                or getattr(user, 'is_staff', False)
            )
        )
