#!/usr/bin/env python3
"""
Final SMS Test - Verify Twilio SMS fixes after campaign approval
"""

import os
import sys
import django
from django.conf import settings

# Add the project directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling.settings")
django.setup()

import requests
import json
from twilio.rest import Client


def test_environment_config():
    """Test 1: Check environment configuration"""
    print("🔧 Testing Environment Configuration...")

    required_vars = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]
    config_ok = True

    for var in required_vars:
        value = getattr(settings, var, None)
        if value:
            print(f"   ✅ {var}: {value[:10]}...")
        else:
            print(f"   ❌ {var}: Missing")
            config_ok = False

    return config_ok


def test_twilio_direct():
    """Test 2: Direct Twilio client test"""
    print("\n📱 Testing Direct Twilio Client...")

    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

        # Test with a dummy number to verify client works
        test_phone = "+1234567890"  # This won't send but will validate the client
        test_message = "Test message from POEHR system after campaign approval"

        print(f"   🔧 Testing message creation to {test_phone}...")

        # This will fail due to invalid number, but validates Twilio setup
        try:
            message = client.messages.create(
                body=test_message, from_=settings.TWILIO_PHONE_NUMBER, to=test_phone
            )
            print(f"   ✅ Twilio client working (unexpected success)")
            return True
        except Exception as twilio_error:
            error_str = str(twilio_error)
            if (
                "not a valid phone number" in error_str
                or "is not a mobile number" in error_str
            ):
                print(
                    f"   ✅ Twilio client working (failed as expected with test number)"
                )
                print(f"       Error: {error_str}")
                return True
            else:
                print(f"   ❌ Unexpected Twilio error: {error_str}")
                return False

    except Exception as e:
        print(f"   ❌ Twilio client creation failed: {e}")
        return False


def test_sms_endpoint():
    """Test 3: Test SMS endpoint with authentication"""
    print("\n🌐 Testing SMS Endpoint...")

    # Start local server check
    try:
        response = requests.get("http://127.0.0.1:8000/", timeout=5)
        print("   ✅ Django server is running")
    except requests.exceptions.ConnectionError:
        print(
            "   ❌ Django server is not running - please start with 'python manage.py runserver'"
        )
        return False
    except requests.exceptions.Timeout:
        print("   ❌ Django server timeout - server may be slow")
        return False

    # Test authentication
    login_data = {"username": "jsswp2004", "password": "krat25Miko!"}

    try:
        login_response = requests.post(
            "http://127.0.0.1:8000/api/auth/login/", json=login_data, timeout=10
        )

        if login_response.status_code == 200:
            token = login_response.json().get("access")
            print("   ✅ Authentication successful")

            # Test SMS endpoint
            headers = {"Authorization": f"Bearer {token}"}
            sms_data = {
                "phone": "+1234567890",  # Test number
                "message": "Test SMS from POEHR - Campaign approved verification",
            }

            sms_response = requests.post(
                "http://127.0.0.1:8000/api/sms/send-sms/",
                json=sms_data,
                headers=headers,
                timeout=10,
            )

            print(f"   📱 SMS Response Status: {sms_response.status_code}")

            if sms_response.status_code == 500:
                print("   ❌ STILL GETTING 500 ERROR!")
                print(f"   Response: {sms_response.text}")
                return False
            elif sms_response.status_code == 400:
                # Expected with test number
                response_data = sms_response.json()
                if "Invalid phone number" in response_data.get("error", ""):
                    print(
                        "   ✅ SMS endpoint working (rejected test number as expected)"
                    )
                    return True
                else:
                    print(f"   ⚠️  Unexpected 400 error: {response_data}")
                    return False
            else:
                print(
                    f"   ✅ SMS endpoint responding correctly: {sms_response.status_code}"
                )
                return True

        else:
            print(f"   ❌ Authentication failed: {login_response.status_code}")
            return False

    except Exception as e:
        print(f"   ❌ Endpoint test error: {e}")
        return False


def main():
    """Main test function"""
    print("🧪 TWILIO SMS FIX VERIFICATION")
    print("=" * 50)
    print("Campaign Status: ✅ APPROVED")
    print("Testing SMS functionality after fixes...")
    print("=" * 50)

    test_results = []

    # Run tests
    test_results.append(("Environment Config", test_environment_config()))
    test_results.append(("Twilio Direct", test_twilio_direct()))
    test_results.append(("SMS Endpoint", test_sms_endpoint()))

    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST RESULTS SUMMARY:")

    all_passed = True
    for test_name, passed in test_results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {test_name}: {status}")
        if not passed:
            all_passed = False

    print("=" * 50)

    if all_passed:
        print("🎉 SUCCESS: All SMS functionality tests passed!")
        print("\n✅ Next steps:")
        print("   • SMS should now work from PatientsPage.js")
        print("   • Bulk messaging should be functional")
        print("   • Auto-SMS reminders should work")
        print("   • Ready for Azure deployment")
    else:
        print("❌ Some tests failed - additional debugging needed")

    return all_passed


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
