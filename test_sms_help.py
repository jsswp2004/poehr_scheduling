"""
Test SMS HELP functionality
"""

import os
import django

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")
django.setup()

from users.models import CustomUser
from communicator.views import SMSWebhookView
from django.test import RequestFactory
from django.utils import timezone


def test_help_functionality():
    print("=== Testing SMS HELP Functionality ===\n")

    # Create a request factory
    factory = RequestFactory()

    # Get a test user
    user = CustomUser.objects.filter(username="jdoe").first()
    if not user:
        print("❌ Test user 'jdoe' not found")
        return

    print(f"Testing with user: {user.username} ({user.phone_number})")
    print(f"Current status: consent={user.sms_consent}, opt_out={user.sms_opt_out}\n")

    # Test scenarios
    test_scenarios = [
        {
            "name": "User with SMS consent",
            "setup": lambda u: setattr(u, "sms_consent", True)
            or setattr(u, "sms_opt_out", False)
            or u.save(),
            "body": "HELP",
        },
        {
            "name": "User who has opted out",
            "setup": lambda u: setattr(u, "sms_opt_out", True)
            or setattr(u, "sms_opt_out_method", "STOP")
            or u.save(),
            "body": "HELP",
        },
        {
            "name": "User with no consent",
            "setup": lambda u: setattr(u, "sms_consent", False)
            or setattr(u, "sms_opt_out", False)
            or u.save(),
            "body": "HELP",
        },
        {"name": "INFO keyword", "setup": None, "body": "INFO"},
        {"name": "Question mark", "setup": None, "body": "?"},
        {"name": "Unknown command", "setup": None, "body": "HELLO"},
    ]

    # Test each scenario
    for scenario in test_scenarios:
        print(f"--- Testing: {scenario['name']} ---")

        if scenario["setup"]:
            scenario["setup"](user)
            print(
                f"Setup complete: consent={user.sms_consent}, opt_out={user.sms_opt_out}"
            )

        # Create webhook request
        request = factory.post(
            "/api/communicator/sms-webhook/",
            {"From": user.phone_number, "Body": scenario["body"], "To": "+19876543210"},
        )

        # Process with webhook view
        view = SMSWebhookView()
        try:
            response = view.post(request)
            print(f"✅ Response status: {response.status_code}")
        except Exception as e:
            print(f"❌ Error: {str(e)}")

        print()

    # Reset user to clean state
    user.sms_consent = False
    user.sms_opt_out = False
    user.sms_opt_out_method = None
    user.sms_opt_out_date = None
    user.save()
    print("User reset to default state")


if __name__ == "__main__":
    test_help_functionality()
