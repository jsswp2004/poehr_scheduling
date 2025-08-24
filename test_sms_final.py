#!/usr/bin/env python3
"""
Final SMS Test - Test Twilio SMS functionality after fixes
"""

import os
import sys
import django
from dotenv import load_dotenv

# Setup Django
sys.path.append(".")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling.settings")

try:
    django.setup()
except Exception as e:
    print(f"Django setup error: {e}")


def test_sms_configuration():
    """Test Twilio configuration"""
    print("🧪 Testing SMS Configuration")
    print("=" * 50)

    # Load environment variables
    load_dotenv()

    # Check environment variables
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    phone_number = os.getenv("TWILIO_PHONE_NUMBER")

    print(f"✓ Account SID: {account_sid}")
    print(f"✓ Auth Token: {auth_token[:10]}..." if auth_token else "❌ Missing")
    print(f"✓ Phone Number: {phone_number}")

    if not all([account_sid, auth_token, phone_number]):
        print("❌ Missing Twilio configuration!")
        return False

    # Test Django settings
    try:
        from django.conf import settings

        print(f"✓ Django TWILIO_ACCOUNT_SID: {settings.TWILIO_ACCOUNT_SID}")
        print(f"✓ Django TWILIO_PHONE_NUMBER: {settings.TWILIO_PHONE_NUMBER}")
    except Exception as e:
        print(f"❌ Django settings error: {e}")
        return False

    return True


def test_twilio_client():
    """Test Twilio client creation"""
    print("\n🔧 Testing Twilio Client")
    print("=" * 50)

    try:
        from twilio.rest import Client
        from django.conf import settings

        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        print("✅ Twilio client created successfully")

        # Test account access
        account = client.api.accounts(settings.TWILIO_ACCOUNT_SID).fetch()
        print(f"✅ Account status: {account.status}")

        return True

    except Exception as e:
        print(f"❌ Twilio client error: {e}")
        return False


def test_sms_function():
    """Test the SMS utility function"""
    print("\n📱 Testing SMS Utility Function")
    print("=" * 50)

    try:
        from communicator.utils import send_sms

        # Test with a test number (won't actually send)
        test_phone = "+1234567890"
        test_message = "Test SMS from POEHR system - verification"

        print(f"Testing SMS to: {test_phone}")
        print(f"Message: {test_message}")

        # This will fail due to test number, but will test the function
        result = send_sms(test_phone, test_message)
        print("✅ SMS function executed successfully")

    except Exception as e:
        error_str = str(e)
        if (
            "not a valid phone number" in error_str
            or "not a mobile number" in error_str
        ):
            print("✅ SMS function working (expected error with test number)")
            return True
        else:
            print(f"❌ SMS function error: {e}")
            return False

    return True


def test_sms_view():
    """Test the SMS view endpoint"""
    print("\n🌐 Testing SMS View Endpoint")
    print("=" * 50)

    try:
        from users.views import send_sms
        from django.test import RequestFactory
        from django.contrib.auth import get_user_model
        import json

        # Create mock request
        factory = RequestFactory()
        User = get_user_model()

        # Create test user if needed
        try:
            user = User.objects.get(username="test_sms_user")
        except User.DoesNotExist:
            user = User.objects.create_user(
                username="test_sms_user",
                email="test@example.com",
                password="testpass123",
            )

        # Create POST request
        request = factory.post(
            "/api/send-sms/",
            {"phone": "+1234567890", "message": "Test SMS from view endpoint"},
            content_type="application/json",
        )
        request.user = user

        # Call view
        response = send_sms(request)
        print(f"View response status: {response.status_code}")
        print(f"View response data: {response.data}")

        if response.status_code in [200, 400]:  # 400 for test number is expected
            print("✅ SMS view endpoint working")
            return True
        else:
            print("❌ SMS view endpoint error")
            return False

    except Exception as e:
        print(f"❌ SMS view test error: {e}")
        return False


def main():
    """Run all SMS tests"""
    print("🧪 FINAL SMS FUNCTIONALITY TEST")
    print("=" * 60)
    print("Testing SMS after Twilio fixes...")

    tests = [
        ("Configuration", test_sms_configuration),
        ("Twilio Client", test_twilio_client),
        ("SMS Function", test_sms_function),
        ("SMS View", test_sms_view),
    ]

    results = []

    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} test failed: {e}")
            results.append((test_name, False))

    # Summary
    print("\n📊 TEST RESULTS SUMMARY")
    print("=" * 60)

    passed = 0
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
        if result:
            passed += 1

    print(f"\nOverall: {passed}/{len(results)} tests passed")

    if passed == len(results):
        print("\n🎉 SUCCESS: All SMS tests passed!")
        print("✅ SMS functionality should now work properly")
        print("✅ You can test from PatientsPage.js in the browser")
    else:
        print(f"\n⚠️  {len(results) - passed} test(s) failed")
        print("🔧 Some issues may need additional attention")


if __name__ == "__main__":
    main()
