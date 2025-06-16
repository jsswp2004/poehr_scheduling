#!/usr/bin/env python3
"""
Test WebSocket connection to the presence endpoint
"""
import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:9001/ws/presence/"
    print(f"🔗 Connecting to {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected successfully!")
            
            # Send a test message
            test_message = {
                "type": "get_online_users"
            }
            await websocket.send(json.dumps(test_message))
            print("📤 Sent test message:", test_message)
            
            # Wait for response
            response = await websocket.recv()
            print("📥 Received response:", response)
            
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())
