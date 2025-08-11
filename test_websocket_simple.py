#!/usr/bin/env python
"""
Simple test to verify if the WebSocket routing works with uvicorn locally
"""
import asyncio
import websockets
import json
import sys
import os

# Add the project directory to Python path
sys.path.insert(0, "/c/Users/jsswp/POWER/poehr_scheduling")

# Set Django settings
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_azure"
)


async def test_websocket():
    """Test WebSocket connection directly"""
    uri = "ws://localhost:8000/ws/presence/"

    print(f"🧪 Testing WebSocket connection to: {uri}")

    try:
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket connection successful!")

            # Send a test message
            test_message = {"type": "ping", "timestamp": "2025-08-11T18:30:00.000Z"}

            await websocket.send(json.dumps(test_message))
            print(f"📤 Sent test message: {test_message}")

            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            print(f"📥 Received response: {response}")

            return True

    except websockets.exceptions.ConnectionClosed as e:
        print(f"❌ WebSocket connection closed: {e}")
        return False
    except asyncio.TimeoutError:
        print("❌ WebSocket response timeout")
        return False
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")
        return False


if __name__ == "__main__":
    print("🔍 Simple WebSocket Test")
    print("=" * 40)

    success = asyncio.run(test_websocket())

    if success:
        print("\n✅ WebSocket test PASSED")
        sys.exit(0)
    else:
        print("\n❌ WebSocket test FAILED")
        sys.exit(1)
