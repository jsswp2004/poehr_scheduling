#!/usr/bin/env python3
"""
Get a valid JWT token for testing WebSocket authentication
"""
import requests
import json
import asyncio
import websockets

def get_jwt_token():
    """Get JWT token by logging in"""
    login_url = "http://localhost:8000/api/auth/login/"
    
    # Test credentials - you may need to adjust these
    credentials = {
        "username": "admin",  # Replace with actual username
        "password": "admin123"  # Replace with actual password
    }
    
    try:
        print(f"🔐 Attempting login to: {login_url}")
        response = requests.post(login_url, json=credentials)
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('access_token') or data.get('token')
            if token:
                print("✅ Login successful!")
                print(f"🔑 Token (first 50 chars): {token[:50]}...")
                return token
        
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return None
        
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

async def test_websocket_with_token(token):
    """Test WebSocket connection with JWT token"""
    if not token:
        print("❌ No token provided, skipping WebSocket test")
        return
    
    uri = f"ws://localhost:9001/ws/presence/?token={token}"
    print(f"🔗 Testing WebSocket with token...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket connected with authentication!")
            
            # Send test message
            test_message = {"type": "get_online_users"}
            await websocket.send(json.dumps(test_message))
            
            # Get response
            response = await websocket.recv()
            data = json.loads(response)
            print("📥 Response:", data)
            
            # Test chat message
            chat_test = {
                "type": "create_chat_room",
                "participant_id": 1  # Test with user ID 1
            }
            await websocket.send(json.dumps(chat_test))
            
            # Get chat response
            chat_response = await websocket.recv()
            print("💬 Chat test response:", chat_response)
            
    except Exception as e:
        print(f"❌ WebSocket test failed: {e}")

def main():
    print("🚀 JWT Authentication Test for WebSocket Chat")
    print("=" * 50)
    
    # Try to get a token
    token = get_jwt_token()
    
    if token:
        # Test WebSocket with token
        asyncio.run(test_websocket_with_token(token))
    else:
        print("\n💡 Unable to get token automatically.")
        print("Please provide token manually:")
        print("1. Open your web app in browser")
        print("2. Login successfully") 
        print("3. Open Developer Tools > Application > Local Storage")
        print("4. Copy the 'token' or 'access_token' value")
        print("5. Run this test manually with that token")
        
        manual_token = input("\nPaste token here (or press Enter to skip): ").strip()
        if manual_token:
            asyncio.run(test_websocket_with_token(manual_token))

if __name__ == "__main__":
    main()
