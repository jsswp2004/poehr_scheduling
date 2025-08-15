from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from django.template.loader import get_template
from django.views.generic import View
import os
import logging

logger = logging.getLogger(__name__)


class FrontendView(View):
    """
    Custom view to serve the React frontend with better error handling
    """

    def get(self, request, *args, **kwargs):
        try:
            # Log the request for debugging
            logger.info(f"Frontend route requested: {request.path}")
            logger.info(f"User agent: {request.META.get('HTTP_USER_AGENT', 'Unknown')}")
            logger.info(f"Referer: {request.META.get('HTTP_REFERER', 'None')}")

            # Check if index.html exists
            template_path = "/code/static/frontend/index.html"
            if not os.path.exists(template_path):
                logger.error(f"Frontend template not found at: {template_path}")
                return JsonResponse(
                    {
                        "error": "Frontend template not found",
                        "path": template_path,
                        "exists": False,
                    },
                    status=500,
                )

            # Try to render the template
            try:
                template = get_template("index.html")
                response = HttpResponse(template.render({}, request))

                # Add cache control headers to prevent aggressive caching
                response["Cache-Control"] = "no-cache, no-store, must-revalidate"
                response["Pragma"] = "no-cache"
                response["Expires"] = "0"

                return response

            except Exception as template_error:
                logger.error(f"Template rendering error: {str(template_error)}")

                # Fallback: serve the file directly
                try:
                    with open(template_path, "r", encoding="utf-8") as f:
                        content = f.read()

                    response = HttpResponse(content, content_type="text/html")
                    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
                    response["Pragma"] = "no-cache"
                    response["Expires"] = "0"

                    logger.info("Served index.html directly as fallback")
                    return response

                except Exception as file_error:
                    logger.error(f"File serving error: {str(file_error)}")
                    return JsonResponse(
                        {
                            "error": "Could not serve frontend",
                            "template_error": str(template_error),
                            "file_error": str(file_error),
                        },
                        status=500,
                    )

        except Exception as e:
            logger.error(f"Unexpected error in FrontendView: {str(e)}")
            return JsonResponse(
                {"error": "Unexpected frontend serving error", "details": str(e)},
                status=500,
            )

    def post(self, request, *args, **kwargs):
        # Handle POST requests the same way (some SPAs might need this)
        return self.get(request, *args, **kwargs)
