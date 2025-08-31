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
from .frontend_views import FrontendView
import os
import base64


def favicon_view(request):
    # Return 204 No Content to stop the 404 errors
    from django.http import HttpResponse

    return HttpResponse(status=204)


def health_check(request):
    """Enhanced health check endpoint for Azure Container Apps"""
    from django.db import connection
    from django.core.cache import cache
    import logging

    logger = logging.getLogger(__name__)

    health_status = {
        "status": "healthy",
        "service": "poehr-scheduling",
        "version": "1.0.0",
        "checks": {},
    }

    is_healthy = True

    # Check database connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            health_status["checks"]["database"] = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["checks"]["database"] = "unhealthy"
        is_healthy = False

    # Check cache (Redis) if configured
    try:
        cache.set("health_check", "ok", 10)
        cache_value = cache.get("health_check")
        if cache_value == "ok":
            health_status["checks"]["cache"] = "healthy"
        else:
            health_status["checks"]["cache"] = "unhealthy"
    except Exception as e:
        logger.warning(f"Cache health check failed: {e}")
        health_status["checks"]["cache"] = "unavailable"
        # Cache is optional, don't mark as unhealthy

    # Overall status
    if is_healthy:
        health_status["status"] = "healthy"
        return JsonResponse(health_status, status=200)
    else:
        health_status["status"] = "unhealthy"
        return JsonResponse(health_status, status=503)


def readiness_check(request):
    """Readiness check for Azure Container Apps startup"""
    try:
        # Simple check if Django is responding
        return JsonResponse(
            {"status": "ready", "service": "poehr-scheduling"}, status=200
        )
    except Exception as e:
        return JsonResponse({"status": "not ready", "error": str(e)}, status=503)


@csrf_exempt
def debug_frontend_files(request):
    """Debug endpoint to check frontend files in production"""
    import os
    import glob

    debug_info = {
        "static_root": settings.STATIC_ROOT,
        "frontend_path": "/code/static/frontend/",
        "index_exists": os.path.exists("/code/static/frontend/index.html"),
        "frontend_files": [],
        "build_info": None,
        "index_size": None,
        "index_modified": None,
    }

    try:
        # List frontend directory contents
        if os.path.exists("/code/static/frontend/"):
            debug_info["frontend_files"] = os.listdir("/code/static/frontend/")

        # Check build info
        if os.path.exists("/code/static/frontend/build-info.txt"):
            with open("/code/static/frontend/build-info.txt", "r") as f:
                debug_info["build_info"] = f.read().strip()

        # Check index.html details
        if os.path.exists("/code/static/frontend/index.html"):
            stat = os.stat("/code/static/frontend/index.html")
            debug_info["index_size"] = stat.st_size
            debug_info["index_modified"] = stat.st_mtime

            # Check if our test content is in the index.html
            with open("/code/static/frontend/index.html", "r") as f:
                content = f.read()
                debug_info["has_deployment_test"] = "MEGA DEPLOYMENT" in content
                debug_info["content_preview"] = (
                    content[:500] + "..." if len(content) > 500 else content
                )

    except Exception as e:
        debug_info["error"] = str(e)

    return JsonResponse(debug_info)


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
    # Health check endpoints for Azure Container Apps
    path("health/", health_check, name="health_check"),
    path("ready/", readiness_check, name="readiness_check"),
    # Debug endpoint
    path("debug-frontend/", debug_frontend_files, name="debug_frontend"),
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
        r"^(?!api/|admin/|health/|static/|media/|create-admin/|debug-frontend/|ws/).*$",
        TemplateView.as_view(template_name="index.html"),
        name="frontend_routes",
    ),
]
