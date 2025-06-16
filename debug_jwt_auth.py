#!/usr/bin/env python3
"""
Debug JWT authentication for WebSocket connections
"""
import asyncio
import websockets
import json
import requests

async def test_websocket_auth():
    # First, let's get a valid JWT token by making a login request
    print("🔐 Testing JWT authentication for WebSocket...")
    
    # Test with different token sources
    test_tokens = []
    
    # You can add a real token here for testing
    # Replace with actual user credentials for testing
    login_url = "http://localhost:8000/api/auth/login/"
    
    print("💡 Please provide login credentials to test authentication:")
    print("   OR check your browser's localStorage for existing tokens")
    
    # Test connection without token first
    print("\n1️⃣ Testing WebSocket connection WITHOUT token:")
    await test_connection_with_token(None)
    
    # Test with token from localStorage (you'll need to provide this)
    print("\n2️⃣ To test WITH token, please:")
    print("   - Open your browser developer tools")
    print("   - Go to Application/Storage > Local Storage")
    print("   - Copy the 'token' or 'access_token' value")
    print("   - Then run the test again with that token")

async def test_connection_with_token(token):
    if token:
        uri = f"ws://localhost:9001/ws/presence/?token={token}"
        print(f"🔗 Connecting with token: {token[:20]}...")
    else:
        uri = "ws://localhost:9001/ws/presence/"
        print(f"🔗 Connecting without token to: {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected successfully!")
            
            # Send a test message
            test_message = {"type": "get_online_users"}
            await websocket.send(json.dumps(test_message))
            print("📤 Sent test message")
            
            # Wait for response
            response = await websocket.recv()
            print("📥 Received response:", response)
            
            # Parse response to check authentication status
            data = json.loads(response)
            if "users" in data:
                print(f"✅ Authentication appears successful - got user list with {len(data['users'])} users")
            
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket_auth())
