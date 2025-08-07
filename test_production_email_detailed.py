"""
Test the production email endpoint to get detailed error information
"""

import requests
import json


def test_production_email_with_auth():
    """Test production email endpoint with real authentication"""

    base_url = (
        "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"
    )

    print("=== Testing Production Email Endpoint ===")

    # First, let's try to get a token by testing the login endpoint
    print("1. Testing login endpoint to get authentication token...")

    try:
        # Test login endpoint exists
        login_response = requests.post(
            f"{base_url}/api/auth/login/",
            json={"username": "test_user", "password": "test_password"},
        )
        print(f"Login endpoint status: {login_response.status_code}")
        print(f"Login response: {login_response.text[:200]}...")

    except Exception as e:
        print(f"Error testing login: {e}")

    # Test the email endpoint with invalid auth to see the actual error
    print("\n2. Testing email endpoint with invalid token to see error details...")

    try:
        email_response = requests.post(
            f"{base_url}/api/users/send-email/",
            json={
                "email": "test@example.com",
                "subject": "Test Email",
                "message": "This is a test message",
            },
            headers={
                "Authorization": "Bearer invalid_token_for_testing",
                "Content-Type": "application/json",
            },
        )

        print(f"Email endpoint status: {email_response.status_code}")
        print(f"Email response headers: {dict(email_response.headers)}")
        print(f"Email response body: {email_response.text}")

        # Try to parse JSON response
        try:
            error_data = email_response.json()
            print(f"Error data: {json.dumps(error_data, indent=2)}")
        except:
            print("Response is not valid JSON")

    except Exception as e:
        print(f"Error testing email endpoint: {e}")

    # Test if we can reach the health check or any other endpoint
    print("\n3. Testing API health...")

    try:
        health_response = requests.get(f"{base_url}/api/")
        print(f"API root status: {health_response.status_code}")
        print(f"API root response: {health_response.text[:200]}...")
    except Exception as e:
        print(f"Error testing API health: {e}")


def test_email_backend_dependencies():
    """Test if email backend dependencies are properly configured"""

    print("\n=== Testing Email Dependencies ===")

    # Test different email-related endpoints to understand the backend state
    base_url = (
        "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"
    )

    endpoints_to_test = [
        "/api/users/send-email/",
        "/api/messages/send-email/",
        "/api/messages/contact-email/",
        "/api/users/send-sms-email/",
    ]

    for endpoint in endpoints_to_test:
        try:
            response = requests.post(f"{base_url}{endpoint}", json={"test": "data"})
            print(f"{endpoint}: Status {response.status_code}")
            if response.status_code == 500:
                print(f"  500 Error details: {response.text[:100]}...")
        except Exception as e:
            print(f"{endpoint}: Exception - {e}")


if __name__ == "__main__":
    test_production_email_with_auth()
    test_email_backend_dependencies()
