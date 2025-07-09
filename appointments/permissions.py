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
