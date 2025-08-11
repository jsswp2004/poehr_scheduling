"""
Test script to verify Azure WebSocket endpoint behavior
"""

import requests
import json


def test_azure_websocket_endpoint():
    """Test the Azure WebSocket endpoint to see what's happening"""
    base_url = (
        "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"
    )

    print("🧪 Testing Azure WebSocket Endpoint Behavior")
    print("=" * 50)

    # Test 1: Check if the endpoint is reachable
    print("\n📡 Test 1: Basic endpoint reachability")
    try:
        response = requests.get(f"{base_url}/ws/presence/", timeout=10)
        print(f"   Status Code: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        print(f"   Content (first 200 chars): {response.text[:200]}")

        if response.status_code == 404:
            print("   ❌ 404 - Endpoint not found (ASGI WebSocket routing not working)")
        elif response.status_code == 200:
            if "<!doctype html>" in response.text.lower():
                print("   ❌ Returning HTML (Django catch-all pattern still active)")
            else:
                print("   ✅ Non-HTML response (potential WebSocket upgrade point)")
        else:
            print(f"   ⚠️  Unexpected status code: {response.status_code}")

    except requests.exceptions.RequestException as e:
        print(f"   ❌ Request failed: {e}")
        return False

    # Test 2: Check WebSocket upgrade headers
    print("\n🔌 Test 2: WebSocket upgrade headers test")
    try:
        headers = {
            "Upgrade": "websocket",
            "Connection": "Upgrade",
            "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
            "Sec-WebSocket-Version": "13",
        }

        response = requests.get(f"{base_url}/ws/presence/", headers=headers, timeout=10)
        print(f"   Status Code: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")

        if response.status_code == 101:
            print("   ✅ WebSocket upgrade successful!")
        elif response.status_code == 404:
            print("   ❌ 404 - WebSocket routing not configured")
        elif response.status_code == 400:
            print("   ⚠️  400 - WebSocket upgrade rejected (may need authentication)")
        else:
            print(
                f"   ⚠️  Unexpected response to WebSocket upgrade: {response.status_code}"
            )

    except requests.exceptions.RequestException as e:
        print(f"   ❌ WebSocket upgrade test failed: {e}")

    # Test 3: Check if ASGI is working by testing other endpoints
    print("\n🔧 Test 3: ASGI application verification")
    try:
        # Test the health endpoint
        response = requests.get(f"{base_url}/health/", timeout=10)
        print(f"   Health endpoint status: {response.status_code}")

        if response.status_code == 200:
            print("   ✅ ASGI application is responding")
            try:
                health_data = response.json()
                print(f"   Health data: {health_data}")
            except:
                print("   ⚠️  Health endpoint not returning JSON")
        else:
            print("   ❌ ASGI application health check failed")

    except requests.exceptions.RequestException as e:
        print(f"   ❌ Health check failed: {e}")

    print("\n🔍 Diagnosis:")
    print("   If all tests show 404 for /ws/presence/, the issue is:")
    print("   1. ASGI WebSocket routing not properly configured")
    print("   2. ProtocolTypeRouter not being used (falling back to basic Django ASGI)")
    print("   3. WebSocket URL patterns not being loaded")
    print("   4. Dependencies (channels, redis) not available in Azure environment")

    return True


if __name__ == "__main__":
    test_azure_websocket_endpoint()
