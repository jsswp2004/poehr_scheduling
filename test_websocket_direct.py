import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:8005/ws/presence/"
    
    try:
        print(f"🔗 Attempting to connect to {uri}")
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected successfully!")
            
            # Send a test message
            test_message = {
                "type": "get_online_users"
            }
            await websocket.send(json.dumps(test_message))
            print(f"📤 Sent message: {test_message}")
            
            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Received response: {response}")
            except asyncio.TimeoutError:
                print("⏰ No response received within 5 seconds")
                
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())
