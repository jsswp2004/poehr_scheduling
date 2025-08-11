#!/usr/bin/env python3

"""
WebSocket Connection Diagnostics
Tests WebSocket connectivity to both local and Azure environments
"""

import asyncio
import websockets
import json
import requests
import sys


async def test_websocket_connection(url, token=None):
    """Test WebSocket connection to a given URL"""
    print(f"\n🔗 Testing WebSocket connection to: {url}")

    headers = {}
    if token:
        print(f"🔑 Using token: {token[:50]}...")
        # Add token to URL as query parameter
        if "?" in url:
            url += f"&token={token}"
        else:
            url += f"?token={token}"

    try:
        print(f"📡 Connecting to: {url}")

        # Set a shorter timeout for Azure testing
        async with websockets.connect(
            url,
            timeout=10,
            ping_interval=None,  # Disable ping for simpler testing
            ping_timeout=None,
        ) as websocket:
            print("✅ WebSocket connection established!")

            # Test sending a simple message
            test_message = {"type": "ping", "timestamp": "test"}

            print("📤 Sending ping message...")
            await websocket.send(json.dumps(test_message))

            # Wait for response with timeout
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Received response: {response}")
                return True
            except asyncio.TimeoutError:
                print("⏰ No response received within 5 seconds")
                return True  # Connection was established, just no response

    except websockets.exceptions.ConnectionClosed as e:
        print(f"❌ WebSocket connection closed: {e.code} - {e.reason}")
        return False
    except websockets.exceptions.InvalidStatusCode as e:
        print(f"❌ Invalid status code: {e.status_code}")
        return False
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")
        return False


def get_test_token():
    """Get a test JWT token by logging in"""
    print("🔐 Getting test token...")

    # Try to login to get a token
    login_url = "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/auth/login/"
    login_data = {
        "username": "adminsuny",  # Corrected username
        "password": "krat27Miko!",
    }

    try:
        response = requests.post(login_url, json=login_data, timeout=10)
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data.get("access")
            if access_token:
                print(f"✅ Token obtained: {access_token[:50]}...")
                return access_token
            else:
                print("❌ No access token in response")
                return None
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error getting token: {e}")
        return None


async def main():
    print("🧪 WebSocket Connection Diagnostics")
    print("=" * 50)

    # Get a real token for testing
    token = get_test_token()

    if not token:
        print(
            "❌ Could not obtain authentication token. Testing without authentication..."
        )

    # Test URLs
    test_urls = [
        # Local development
        "ws://localhost:8080/ws/presence/",
        # Azure production
        "wss://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/ws/presence/",
    ]

    results = {}

    for url in test_urls:
        try:
            result = await test_websocket_connection(url, token)
            results[url] = result
        except Exception as e:
            print(f"❌ Test failed for {url}: {e}")
            results[url] = False

    # Summary
    print("\n📊 Test Results Summary:")
    print("=" * 50)
    for url, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {url}")

    # Analysis
    print("\n🔍 Analysis:")
    local_success = results.get("ws://localhost:8080/ws/presence/", False)
    azure_success = results.get(
        "wss://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/ws/presence/",
        False,
    )

    if local_success and not azure_success:
        print(
            "🏠 Local WebSocket works but Azure fails - likely Azure configuration issue"
        )
    elif not local_success and not azure_success:
        print("🔧 Neither works - likely WebSocket/Django configuration issue")
    elif local_success and azure_success:
        print("🎉 Both work - WebSocket configuration is correct!")
    else:
        print("🤔 Mixed results - need further investigation")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()
