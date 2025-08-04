#!/usr/bin/env python3
"""
Direct WebSocket connection test to verify the Cloud Run WebSocket endpoint.
This bypasses the React app and tests the WebSocket directly.
"""

import asyncio
import websockets
import json
import sys

# Test WebSocket connection to Cloud Run
WS_URL = "wss://poehr-scheduling-mjf5efdj3a-uc.a.run.app/ws/presence/"

async def test_websocket_connection():
    """Test WebSocket connection without authentication first"""
    print(f"🔌 Testing WebSocket connection to: {WS_URL}")
    
    try:
        # Test without token first (should connect but be anonymous)
        print("📡 Attempting connection without token...")
        async with websockets.connect(WS_URL) as websocket:
            print("✅ WebSocket connected successfully!")
            print(f"🔍 Connection state: {websocket.state}")
            
            # Send a test message
            test_message = {
                "type": "heartbeat",
                "timestamp": "2025-08-03T10:30:00Z"
            }
            
            print(f"📤 Sending test message: {test_message}")
            await websocket.send(json.dumps(test_message))
            
            # Try to receive a response (with timeout)
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Received response: {response}")
            except asyncio.TimeoutError:
                print("⏰ No response received within 5 seconds (this might be normal)")
            
            print("🔌 Test completed successfully!")
            
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")
        print(f"🔍 Error type: {type(e).__name__}")
        return False
    
    return True

if __name__ == "__main__":
    print("🧪 WebSocket Direct Connection Test")
    print("=" * 50)
    
    try:
        result = asyncio.run(test_websocket_connection())
        if result:
            print("\n✅ WebSocket server is working correctly!")
            sys.exit(0)
        else:
            print("\n❌ WebSocket connection test failed!")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted by user")
        sys.exit(1)
