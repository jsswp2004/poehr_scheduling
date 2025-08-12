#!/usr/bin/env python3
"""
Simple API test for offline message endpoints
Tests the new chat offline message API without Django setup
"""

import requests
import json


def test_api_endpoints():
    """Test the offline message API endpoints directly"""
    print("🧪 Testing Offline Message API Endpoints")
    print("=" * 50)

    # Test configuration
    base_url = "http://127.0.0.1:8000/api/users"

    # You'll need to get a real token from the application
    # For now, we'll just test if the endpoints are accessible
    test_token = "your_jwt_token_here"  # Replace with real token
    headers = {
        "Authorization": f"Bearer {test_token}",
        "Content-Type": "application/json",
    }

    print("📋 Testing API endpoint availability...")

    # Test endpoints without authentication first
    endpoints_to_test = [
        ("/unread-messages/", "GET"),
        ("/mark-messages-read/", "POST"),
        ("/chat-rooms/", "GET"),
    ]

    for endpoint, method in endpoints_to_test:
        url = base_url + endpoint
        print(f"\n🌐 Testing {method} {url}")

        try:
            if method == "GET":
                response = requests.get(url, timeout=5)
            else:
                response = requests.post(url, json={}, timeout=5)

            print(f"   Status: {response.status_code}")

            if response.status_code == 401:
                print("   ✅ Endpoint exists (requires authentication)")
            elif response.status_code == 404:
                print("   ❌ Endpoint not found")
            elif response.status_code == 405:
                print("   ⚠️ Method not allowed")
            else:
                print(f"   📄 Response: {response.text[:100]}...")

        except requests.exceptions.ConnectionError:
            print("   ❌ Server not running on localhost:8000")
        except Exception as e:
            print(f"   ❌ Error: {e}")

    print("\n" + "=" * 50)
    print("📝 Next steps for testing:")
    print("1. Start the Django server: python manage.py runserver")
    print("2. Login to get a JWT token")
    print("3. Replace 'your_jwt_token_here' with the real token")
    print("4. Run this script again")
    print("\n💡 You can also test via the frontend:")
    print("1. Start React app: npm start")
    print("2. Login with admin user")
    print("3. Have another user send you a message while offline")
    print("4. Check browser console for offline message logs")


if __name__ == "__main__":
    test_api_endpoints()
