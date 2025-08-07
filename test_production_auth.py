"""
Test authentication and email endpoint in production environment
"""

import requests
import json


def test_production_authentication():
    """Test authentication flow against production server"""

    base_url = (
        "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"
    )

    print("=== Testing Production Authentication ===")

    # Test 1: Check if the API endpoints are accessible
    try:
        response = requests.get(f"{base_url}/api/")
        print(f"API root endpoint status: {response.status_code}")
    except Exception as e:
        print(f"❌ Cannot reach API: {e}")
        return False

    # Test 2: Check if email endpoint exists (without auth)
    try:
        response = requests.post(f"{base_url}/api/messages/send-email/", json={})
        print(f"Email endpoint response (no auth): {response.status_code}")
        if response.status_code == 401:
            print("✅ Email endpoint exists and correctly requires authentication")
        elif response.status_code == 404:
            print("❌ Email endpoint not found (404)")
            return False
        else:
            print(f"Unexpected response: {response.text}")
    except Exception as e:
        print(f"❌ Error testing email endpoint: {e}")
        return False

    # Test 3: Check URL routing variations
    endpoints_to_test = [
        "/api/messages/send-email/",
        "/api/users/send-email/",
        "/messages/send-email/",
        "/users/send-email/",
    ]

    for endpoint in endpoints_to_test:
        try:
            response = requests.post(f"{base_url}{endpoint}", json={})
            print(f"{endpoint}: {response.status_code}")
        except Exception as e:
            print(f"{endpoint}: Error - {e}")

    return True


def test_token_refresh_endpoint():
    """Test token refresh endpoint"""

    base_url = (
        "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"
    )

    print("\n=== Testing Token Refresh Endpoint ===")

    try:
        # Test with invalid refresh token
        response = requests.post(
            f"{base_url}/api/auth/token/refresh/", json={"refresh": "invalid_token"}
        )
        print(f"Token refresh endpoint status: {response.status_code}")
        print(f"Response: {response.text}")

        if response.status_code in [400, 401]:
            print("✅ Token refresh endpoint exists and validates tokens")
            return True
        else:
            print("❌ Unexpected token refresh response")
            return False

    except Exception as e:
        print(f"❌ Error testing token refresh: {e}")
        return False


if __name__ == "__main__":
    print("Testing production email endpoint and authentication...")

    auth_ok = test_production_authentication()
    token_ok = test_token_refresh_endpoint()

    print("\n=== Summary ===")
    print(f"Production API accessibility: {'✅' if auth_ok else '❌'}")
    print(f"Token refresh endpoint: {'✅' if token_ok else '❌'}")

    if auth_ok and token_ok:
        print(
            "\n✅ Production endpoints are accessible. Issue might be with token handling in frontend."
        )
    else:
        print("\n❌ Production endpoint issues detected.")
