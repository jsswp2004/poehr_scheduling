#!/usr/bin/env python3
"""
Test WebSocket connections to verify the ASGI server is working correctly.
"""
import asyncio
import websockets
import json

async def test_presence_websocket():
    """Test presence WebSocket connection"""
    uri = "ws://127.0.0.1:8000/ws/presence/"
    
    try:
        print(f"🔍 Attempting to connect to {uri}")
        async with websockets.connect(uri) as websocket:
            print("✅ Successfully connected to presence WebSocket!")
            
            # Send a test message
            test_message = {
                "type": "get_online_users"
            }
            await websocket.send(json.dumps(test_message))
            print(f"📤 Sent: {test_message}")
            
            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Received: {response}")
            except asyncio.TimeoutError:
                print("⏰ No response received within 5 seconds")
                
    except Exception as e:
        print(f"❌ Failed to connect to presence WebSocket: {e}")

async def test_chat_websocket():
    """Test chat WebSocket connection"""
    uri = "ws://127.0.0.1:8000/ws/chat/"
    
    try:
        print(f"🔍 Attempting to connect to {uri}")
        async with websockets.connect(uri) as websocket:
            print("✅ Successfully connected to chat WebSocket!")
            
            # Wait for connection confirmation
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Connection response: {response}")
            except asyncio.TimeoutError:
                print("⏰ No connection response received within 5 seconds")
                
    except Exception as e:
        print(f"❌ Failed to connect to chat WebSocket: {e}")

async def main():
    print("🚀 Testing WebSocket connections...")
    print("=" * 50)
    
    await test_presence_websocket()
    print()
    await test_chat_websocket()
    
    print("=" * 50)
    print("✅ WebSocket connection tests completed!")

if __name__ == "__main__":
    asyncio.run(main())
