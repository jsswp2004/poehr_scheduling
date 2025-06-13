#!/usr/bin/env python3
"""
Test WebSocket connection to check online status messages
"""
import asyncio
import websockets
import json
import sys
import os

# Add the project root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

async def test_websocket():
    # You'll need a valid JWT token - get this from the browser's localStorage
    # For now, let's test without auth to see what happens
    uri = "ws://127.0.0.1:8005/ws/presence/"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to WebSocket")
            
            # Send get_online_users request
            await websocket.send(json.dumps({
                "type": "get_online_users"
            }))
            print("📤 Sent get_online_users request")
            
            # Listen for responses
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(message)
                    print(f"📥 Received: {json.dumps(data, indent=2)}")
                    
                    if data.get('type') == 'online_users_list':
                        print(f"🟢 Online users count: {len(data.get('users', []))}")
                        for user in data.get('users', []):
                            status = "ONLINE" if user.get('is_online') else "OFFLINE"
                            print(f"  👤 {user.get('username', 'Unknown')} ({user.get('id')}) - {status}")
                        break
                        
                except asyncio.TimeoutError:
                    print("⏰ Timeout waiting for response")
                    break
                    
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")

if __name__ == "__main__":
    print("🔍 Testing WebSocket online status...")
    asyncio.run(test_websocket())
