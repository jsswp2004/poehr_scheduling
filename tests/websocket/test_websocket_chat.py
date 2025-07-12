import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:8005/ws/presence/"
    async with websockets.connect(uri) as websocket:
        print("✅ Connected to WebSocket!")

        # Example: send a heartbeat message
        await websocket.send(json.dumps({"type": "heartbeat", "timestamp": "test"}))
        print("📤 Sent heartbeat")

        # Wait for a response
        try:
            response = await asyncio.wait_for(websocket.recv(), timeout=5)
            print("📥 Received:", response)
        except asyncio.TimeoutError:
            print("⏰ No response received within 5 seconds")

if __name__ == "__main__":
    asyncio.run(test_websocket())
