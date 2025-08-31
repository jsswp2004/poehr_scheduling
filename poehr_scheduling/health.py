from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache
import logging

logger = logging.getLogger(__name__)


def health_check(request):
    """
    Health check endpoint for Azure Container Apps
    Returns 200 if all systems are healthy, 503 if there are issues
    """
    health_status = {
        "status": "healthy",
        "timestamp": request.META.get("HTTP_X_FORWARDED_FOR", ""),
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
            is_healthy = False
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
    """
    Readiness check - simpler version for startup
    """
    try:
        # Just check if Django is responding
        return JsonResponse({"status": "ready"}, status=200)
    except Exception as e:
        return JsonResponse({"status": "not ready", "error": str(e)}, status=503)
