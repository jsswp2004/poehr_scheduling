#!/usr/bin/env python
import asyncio
import websockets
import json

async def test_connection():
    """Test basic WebSocket connection without authentication"""
    uri = "ws://localhost:8005/ws/presence/"
    
    print(f"🔗 Testing basic connection to {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connection established!")
            
            # Send a test message
            test_message = {"type": "test", "message": "hello"}
            await websocket.send(json.dumps(test_message))
            print("📤 Sent test message")
            
            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Received: {response}")
            except asyncio.TimeoutError:
                print("⏰ No response received within 5 seconds")
            
    except ConnectionRefusedError:
        print("❌ Connection refused - server may not be running or wrong port")
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
