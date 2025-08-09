from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.views.static import serve
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect
from django.core.management import call_command
from django.views.decorators.csrf import csrf_exempt
import os
import base64


def favicon_view(request):
    # Return 204 No Content to stop the 404 errors
    from django.http import HttpResponse

    return HttpResponse(status=204)


def health_check(request):
    """Health check endpoint for Cloud Run"""
    return JsonResponse(
        {"status": "healthy", "service": "poehr-scheduling", "version": "1.0.0"}
    )


@csrf_exempt
def create_admin_endpoint(request):
    """Emergency endpoint to create admin user if needed"""
    if request.method == "POST":
        try:
            call_command("create_admin")
            return JsonResponse(
                {
                    "status": "success",
                    "message": "Admin user creation attempted. Check logs.",
                }
            )
        except Exception as e:
            return JsonResponse(
                {"status": "error", "message": f"Error: {str(e)}"}, status=500
            )
    return JsonResponse({"message": "POST to create admin user"})


urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check endpoint
    path("health/", health_check, name="health_check"),
    # Emergency admin creation endpoint
    path("create-admin/", create_admin_endpoint, name="create_admin"),
    # Favicon handler
    path("favicon.ico", favicon_view, name="favicon"),
    # Auth-specific routes (register/login)
    path("api/auth/", include("users.urls")),  # Only for login/register/change-password
    # ✅ Password reset routes from django-rest-passwordreset
    path(
        "api/password-reset/",
        include("django_rest_passwordreset.urls", namespace="password_reset"),
    ),
    # Profile & user-specific endpoints
    path("api/users/", include("users.urls")),  # Keep all user routes under /api/users/
    # API routes
    path("api/", include("appointments.urls")),
    path("api/sms/", include("users.urls")),  # or sms.urls
    path("api/messages/", include("users.urls")),
    path("api/communicator/", include("communicator.urls")),
]

# Serve static files manually for production
urlpatterns += [
    re_path(
        r"^static/(?P<path>.*)$",
        serve,
        {
            "document_root": settings.STATIC_ROOT,
        },
    ),
]


# Custom media handler with fallback to a transparent PNG to avoid 404s
def serve_media_with_fallback(request, path):
    file_path = os.path.join(settings.MEDIA_ROOT, path)
    if os.path.exists(file_path):
        return serve(request, path, document_root=settings.MEDIA_ROOT)
    # 1x1 transparent PNG
    transparent_png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axWQDoAAAAASUVORK5CYII="
    data = base64.b64decode(transparent_png_base64)
    return HttpResponse(data, content_type="image/png", status=200)


urlpatterns += [
    re_path(r"^media/(?P<path>.*)$", serve_media_with_fallback),
]

# Catch-all pattern for frontend routes (must be LAST)
urlpatterns += [
    re_path(r"^$", TemplateView.as_view(template_name="index.html"), name="home"),
    re_path(
        r"^(?!api/|admin/|health/|static/|media/|create-admin/).*$",
        TemplateView.as_view(template_name="index.html"),
        name="frontend_routes",
    ),
]
