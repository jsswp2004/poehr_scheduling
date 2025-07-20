from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

@require_http_methods(["GET"])
def api_root(request):
    """API root endpoint providing information about available endpoints"""
    return JsonResponse({
        "message": "Welcome to POEHR Healthcare Scheduling API",
        "version": "1.0",
        "status": "running",
        "endpoints": {
            "admin": "/admin/",
            "auth": "/api/auth/",
            "users": "/api/users/",
            "appointments": "/api/",
            "password_reset": "/api/password-reset/",
            "sms": "/api/sms/",
            "messages": "/api/messages/",
            "communicator": "/api/communicator/"
        },
        "documentation": "Contact your administrator for API documentation"
    })

urlpatterns = [
    path('', api_root, name='api_root'),  # Root endpoint
    path('admin/', admin.site.urls),

    # Auth-specific routes (register/login)
    path('api/auth/', include('users.urls')),       # Only for login/register/change-password

    # ✅ Password reset routes from django-rest-passwordreset
    path('api/password-reset/', include('django_rest_passwordreset.urls', namespace='password_reset')),

    # Profile & user-specific endpoints
    path('api/users/', include('users.urls')),      # Keep all user routes under /api/users/

    # Appointments
    path('api/', include('appointments.urls')),
    # path('api/auth/', include('django_rest_passwordreset.urls', namespace='password_reset')),

    path('api/sms/', include('users.urls')),  # or sms.urls
    path('api/messages/', include('users.urls')),
    path('api/communicator/', include('communicator.urls')),


] 
# + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve media during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
