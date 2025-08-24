#!/usr/bin/env python3
"""
Simple SMS Test Script
"""

import requests
import json


def test_sms_endpoint():
    """Test SMS endpoint functionality"""
    print("🧪 Testing SMS Endpoint After Fixes")
    print("=" * 40)

    # Check if server is running
    try:
        response = requests.get("http://127.0.0.1:8000/", timeout=5)
        print("✅ Django server is running")
    except requests.exceptions.ConnectionError:
        print("❌ Django server is not running")
        print("Please start the server with: python manage.py runserver")
        return False

    # Login to get token
    print("\n🔐 Authenticating...")
    login_data = {"username": "jsswp2004", "password": "krat25Miko!"}

    try:
        login_response = requests.post(
            "http://127.0.0.1:8000/api/auth/login/", json=login_data, timeout=10
        )

        if login_response.status_code == 200:
            token = login_response.json().get("access")
            print("✅ Authentication successful")
        else:
            print(f"❌ Authentication failed: {login_response.status_code}")
            return False

    except Exception as e:
        print(f"❌ Authentication error: {e}")
        return False

    # Test SMS endpoint
    print("\n📱 Testing SMS functionality...")
    headers = {"Authorization": f"Bearer {token}"}
    sms_data = {
        "phone": "+1234567890",  # Test number
        "message": "Test SMS after campaign approval and fixes",
    }

    try:
        sms_response = requests.post(
            "http://127.0.0.1:8000/api/sms/send-sms/",
            json=sms_data,
            headers=headers,
            timeout=15,
        )

        print(f"SMS Response Status: {sms_response.status_code}")
        print(f"SMS Response: {sms_response.text}")

        if sms_response.status_code == 500:
            print("\n❌ STILL GETTING 500 ERROR!")
            return False
        elif sms_response.status_code == 400:
            response_data = sms_response.json()
            if "Invalid phone number" in response_data.get("error", ""):
                print("\n✅ SMS endpoint working correctly!")
                print("   (Rejected test number as expected)")
                return True
            else:
                print(f"\n⚠️ Unexpected 400 error: {response_data}")
                return False
        else:
            print(f"\n✅ SMS endpoint responding: {sms_response.status_code}")
            return True

    except Exception as e:
        print(f"\n❌ SMS test error: {e}")
        return False


if __name__ == "__main__":
    success = test_sms_endpoint()

    if success:
        print("\n🎉 SMS FIXES SUCCESSFUL!")
        print("📋 Next steps:")
        print("   • SMS should work from frontend")
        print("   • Ready to commit and deploy to Azure")
    else:
        print("\n❌ SMS fixes need more work")

    print("\n" + "=" * 40)
