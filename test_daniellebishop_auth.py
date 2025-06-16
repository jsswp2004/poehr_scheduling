#!/usr/bin/env python3
"""
Test daniellebishop authentication and WebSocket connection
"""
import asyncio
import websockets
import json
import requests

async def test_daniellebishop_auth():
    # Test daniellebishop login
    login_url = "http://localhost:8000/api/auth/login/"
    login_data = {"username": "daniellebishop", "password": "krat27Miko!"}
    
    print("🔐 Testing daniellebishop login...")
    try:
        response = requests.post(login_url, json=login_data)
        print(f"📤 Login response status: {response.status_code}")
        
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data.get('access')
            print(f"✅ Login successful! Token: {access_token[:50]}...")
            
            # Test WebSocket connection
            uri = f"ws://localhost:9001/ws/presence/?token={access_token}"
            print(f"🔗 Testing WebSocket connection...")
            
            try:
                async with websockets.connect(uri) as websocket:
                    print("✅ WebSocket connected for daniellebishop!")
                    
                    # Send a heartbeat to trigger online status update
                    heartbeat_msg = {
                        "type": "heartbeat",
                        "timestamp": "2025-06-16T18:45:00.000Z"
                    }
                    await websocket.send(json.dumps(heartbeat_msg))
                    print("📤 Sent heartbeat message")
                    
                    # Wait for any responses
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                        print(f"📥 Received: {response}")
                    except asyncio.TimeoutError:
                        print("⏰ No immediate response (this is normal)")
                    
                    # Keep connection open for a few seconds to allow status update
                    print("💤 Keeping connection open for 5 seconds...")
                    await asyncio.sleep(5)
                    
            except Exception as e:
                print(f"❌ WebSocket connection failed: {e}")
                
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_daniellebishop_auth())
