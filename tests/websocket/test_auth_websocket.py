#!/usr/bin/env python3
"""
Test WebSocket authentication with real user credentials
"""
import asyncio
import websockets
import json
import requests

async def test_authenticated_websocket():    # First, get a real JWT token by logging in
    login_url = "http://localhost:8000/api/auth/login/"
    login_data = {
        "username": "jsswp2004",
        "password": "krat27Miko!"
    }
    
    print("🔐 Logging in to get JWT token...")
    try:
        response = requests.post(login_url, json=login_data)
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data.get('access')
            print(f"✅ Login successful! Token: {access_token[:50]}...")
            
            # Now test WebSocket with the real token
            uri = f"ws://localhost:9001/ws/presence/?token={access_token}"
            print(f"🔗 Connecting to WebSocket with real token...")
            
            async with websockets.connect(uri) as websocket:
                print("✅ WebSocket connected with authenticated user!")
                
                # Send a test message
                test_message = {
                    "type": "get_online_users"
                }
                await websocket.send(json.dumps(test_message))
                print("📤 Sent test message:", test_message)
                
                # Wait for response
                response = await websocket.recv()
                print("📥 Received response:", response)
                
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_authenticated_websocket())
