"""
Create a test endpoint to verify email configuration without actually sending emails
"""

from django.core.mail import send_mail
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
import logging


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def test_email_config(request):
    """
    Test email configuration without actually sending emails
    """
    logger = logging.getLogger(__name__)

    try:
        # Log current email settings
        config_info = {
            "EMAIL_BACKEND": getattr(settings, "EMAIL_BACKEND", "Not set"),
            "EMAIL_HOST": getattr(settings, "EMAIL_HOST", "Not set"),
            "EMAIL_PORT": getattr(settings, "EMAIL_PORT", "Not set"),
            "EMAIL_USE_TLS": getattr(settings, "EMAIL_USE_TLS", "Not set"),
            "EMAIL_HOST_USER": getattr(settings, "EMAIL_HOST_USER", "Not set"),
            "EMAIL_HOST_PASSWORD": (
                "***" if getattr(settings, "EMAIL_HOST_PASSWORD", None) else "Not set"
            ),
            "DEFAULT_FROM_EMAIL": getattr(settings, "DEFAULT_FROM_EMAIL", "Not set"),
        }

        logger.info(f"Email configuration: {config_info}")

        # Test email validation
        email = request.data.get("email", "test@example.com")
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError

        try:
            validate_email(email)
            email_valid = True
        except ValidationError:
            email_valid = False

        return Response(
            {
                "message": "Email configuration test completed",
                "email_config": config_info,
                "email_validation": {"email": email, "valid": email_valid},
                "user": request.user.username,
            }
        )

    except Exception as e:
        logger.error(f"Email config test failed: {str(e)}")
        return Response(
            {"error": str(e), "message": "Email configuration test failed"}, status=500
        )
