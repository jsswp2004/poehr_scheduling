#!/usr/bin/env python3

"""
Azure Deployment Monitor
Monitors Azure Container Apps deployment and tests WebSocket connectivity
"""

import time
import requests
import asyncio
import websockets
import json

AZURE_URL = "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"


def test_http_endpoint():
    """Test if the HTTP endpoint is responding"""
    try:
        response = requests.get(f"{AZURE_URL}/admin/", timeout=10)
        return response.status_code in [200, 302]  # 302 is redirect to login
    except Exception:
        return False


def test_websocket_handshake():
    """Test if WebSocket endpoint accepts handshake"""
    import subprocess

    try:
        # Use curl to test WebSocket handshake
        result = subprocess.run(
            [
                "curl",
                "-I",
                "-H",
                "Connection: Upgrade",
                "-H",
                "Upgrade: websocket",
                "-H",
                "Sec-WebSocket-Version: 13",
                "-H",
                "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
                f'{AZURE_URL.replace("https://", "https://")}/ws/presence/',
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        # Look for WebSocket upgrade response
        return "101 Switching Protocols" in result.stdout or "101" in result.stdout
    except Exception as e:
        print(f"WebSocket handshake test error: {e}")
        return False


async def test_websocket_connection():
    """Test actual WebSocket connection"""
    try:
        ws_url = AZURE_URL.replace("https://", "wss://") + "/ws/presence/"

        async with websockets.connect(ws_url, timeout=5) as websocket:
            # Send a ping
            await websocket.send(json.dumps({"type": "ping"}))

            # Try to receive a response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=3)
                return True
            except asyncio.TimeoutError:
                return True  # Connection established, even if no response

    except Exception as e:
        print(f"WebSocket connection error: {e}")
        return False


def main():
    print("🔍 Azure Deployment Monitor")
    print("=" * 50)
    print(f"Monitoring: {AZURE_URL}")
    print("\nWaiting for deployment to complete...")

    attempt = 0
    max_attempts = 30  # 15 minutes with 30-second intervals

    while attempt < max_attempts:
        attempt += 1
        print(f"\n⏰ Attempt {attempt}/{max_attempts}")

        # Test HTTP endpoint
        http_ok = test_http_endpoint()
        print(f"HTTP endpoint: {'✅ OK' if http_ok else '❌ FAIL'}")

        if http_ok:
            # Test WebSocket handshake
            ws_handshake_ok = test_websocket_handshake()
            print(f"WebSocket handshake: {'✅ OK' if ws_handshake_ok else '❌ FAIL'}")

            if ws_handshake_ok:
                # Test actual WebSocket connection
                try:
                    ws_connection_ok = asyncio.run(test_websocket_connection())
                    print(
                        f"WebSocket connection: {'✅ OK' if ws_connection_ok else '❌ FAIL'}"
                    )

                    if ws_connection_ok:
                        print("\n🎉 SUCCESS: Azure WebSocket deployment is working!")
                        print("\n🧪 You can now test in your browser:")
                        print("1. Open your application")
                        print("2. Open browser console (F12)")
                        print("3. Run the WebSocket test command from earlier")
                        return

                except Exception as e:
                    print(f"WebSocket connection test error: {e}")

        if attempt < max_attempts:
            print("⏳ Waiting 30 seconds before next check...")
            time.sleep(30)

    print(f"\n⏰ Timeout: Deployment not ready after {max_attempts} attempts")
    print("💡 Check Azure Container Apps logs for issues")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Monitoring stopped by user")
    except Exception as e:
        print(f"\n❌ Monitor failed: {e}")
        import traceback

        traceback.print_exc()
