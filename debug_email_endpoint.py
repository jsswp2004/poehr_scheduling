#!/usr/bin/env python3
"""
Debug script to test email endpoint and improve error logging
"""
import os
import sys
import django

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")
django.setup()

import requests
import json
from django.conf import settings
from django.core.mail import send_mail
from django.test import RequestFactory
from users.views import send_patient_email
from rest_framework.test import APIRequestFactory
from rest_framework.authtoken.models import Token
from users.models import CustomUser


def test_email_function_directly():
    """Test the send_patient_email function directly"""
    print("=== Testing send_patient_email function directly ===")

    try:
        # Test Django email configuration
        print(f"Email backend: {settings.EMAIL_BACKEND}")
        print(f"Email host: {getattr(settings, 'EMAIL_HOST', 'Not configured')}")
        print(f"Email port: {getattr(settings, 'EMAIL_PORT', 'Not configured')}")
        print(f"Email use TLS: {getattr(settings, 'EMAIL_USE_TLS', 'Not configured')}")
        print(
            f"Default from email: {getattr(settings, 'DEFAULT_FROM_EMAIL', 'Not configured')}"
        )

        # Test with Django send_mail directly
        send_mail(
            subject="Test Email",
            message="This is a test email from debug script",
            from_email=None,
            recipient_list=["test@example.com"],
            fail_silently=False,
        )
        print("✅ Django send_mail test passed")

    except Exception as e:
        print(f"❌ Django send_mail test failed: {str(e)}")
        return False

    return True


def test_email_endpoint_with_auth():
    """Test the email endpoint with proper authentication"""
    print("\n=== Testing email endpoint with authentication ===")

    try:
        # Get a user for testing
        user = CustomUser.objects.first()
        if not user:
            print("❌ No users found in database")
            return False

        print(f"Testing with user: {user.username}")

        # Create a test request
        factory = APIRequestFactory()

        # Test data
        test_data = {
            "email": "test@example.com",
            "subject": "Test Email from Debug Script",
            "message": "This is a test message to debug the email endpoint",
        }

        # Create request
        request = factory.post("/api/messages/send-email/", test_data, format="json")
        request.user = user

        # Call the view function
        response = send_patient_email(request)

        print(f"Response status: {response.status_code}")
        print(f"Response data: {response.data}")

        if response.status_code == 200:
            print("✅ Email endpoint test passed")
            return True
        else:
            print("❌ Email endpoint test failed")
            return False

    except Exception as e:
        print(f"❌ Email endpoint test failed with exception: {str(e)}")
        import traceback

        traceback.print_exc()
        return False


def check_url_routing():
    """Check if URL routing is correct"""
    print("\n=== Checking URL routing ===")

    try:
        from django.urls import resolve
        from django.http import Http404

        # Test URL resolution
        try:
            resolver_match = resolve("/api/messages/send-email/")
            print(f"✅ URL resolved to: {resolver_match.func.__name__}")
            print(f"View function: {resolver_match.func}")
            return True
        except Http404:
            print("❌ URL '/api/messages/send-email/' not found")
            return False

    except Exception as e:
        print(f"❌ URL routing check failed: {str(e)}")
        return False


if __name__ == "__main__":
    print("Starting email endpoint debugging...")

    # Run tests
    email_config_ok = test_email_function_directly()
    url_routing_ok = check_url_routing()
    endpoint_ok = test_email_endpoint_with_auth()

    print("\n=== Summary ===")
    print(f"Email configuration: {'✅' if email_config_ok else '❌'}")
    print(f"URL routing: {'✅' if url_routing_ok else '❌'}")
    print(f"Endpoint function: {'✅' if endpoint_ok else '❌'}")

    if not all([email_config_ok, url_routing_ok, endpoint_ok]):
        print("\n❌ Some tests failed. Check the output above for details.")
        sys.exit(1)
    else:
        print("\n✅ All tests passed!")
