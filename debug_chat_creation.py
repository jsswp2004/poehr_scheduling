#!/usr/bin/env python3
"""
Test WebSocket authentication with a fresh token
"""
import asyncio
import websockets
import json
import requests

async def test_websocket_auth():
    # Get fresh token
    login_url = "http://localhost:8000/api/auth/login/"
    login_data = {"username": "jsswp2004", "password": "krat27Miko!"}
    
    print("🔐 Getting fresh token...")
    response = requests.post(login_url, json=login_data)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        return
        
    token_data = response.json()
    access_token = token_data.get('access')
    print(f"✅ Got token: {access_token[:50]}...")
    
    # Test WebSocket connection
    uri = f"ws://localhost:9001/ws/presence/?token={access_token}"
    print(f"🔗 Connecting to WebSocket...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket connected!")
            
            # Test creating a chat room
            create_room_msg = {
                "type": "create_chat_room",
                "participants": [4, 1]  # Your user ID (4) and another user
            }
            print(f"📤 Sending create_chat_room: {create_room_msg}")
            await websocket.send(json.dumps(create_room_msg))
            
            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=15.0)
                print(f"📥 Received: {response}")
            except asyncio.TimeoutError:
                print("⏰ No response received within 15 seconds")
                
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket_auth())
