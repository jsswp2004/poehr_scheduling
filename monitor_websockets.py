#!/usr/bin/env python3
"""
Monitor WebSocket connections in real-time to debug connection issues.
"""
import asyncio
import websockets
import json
from datetime import datetime

async def monitor_websocket_activity():
    """Monitor both presence and chat WebSocket endpoints"""
    
    async def test_connection(uri, name):
        try:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Testing {name} at {uri}")
            
            async with websockets.connect(uri) as websocket:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ {name} connected successfully")
                
                # Send a test message
                test_msg = {"type": "ping", "timestamp": datetime.now().isoformat()}
                await websocket.send(json.dumps(test_msg))
                
                # Wait for any response or keep alive for a few seconds
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=3.0)
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] 📥 {name} response: {response}")
                except asyncio.TimeoutError:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] ⏰ {name} no response (expected)")
                
                print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔌 {name} closing connection")
                    
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ {name} failed: {e}")

    # Test both endpoints
    presence_uri = "ws://127.0.0.1:8000/ws/presence/"
    chat_uri = "ws://127.0.0.1:8000/ws/chat/"
    
    print("=== WebSocket Connection Monitor ===")
    print(f"Starting monitoring at {datetime.now()}")
    print("=" * 50)
    
    # Test connections sequentially to avoid interference
    await test_connection(presence_uri, "Presence WebSocket")
    await asyncio.sleep(1)
    await test_connection(chat_uri, "Chat WebSocket")
    
    print("=" * 50)
    print("✅ Monitoring completed")

if __name__ == "__main__":
    asyncio.run(monitor_websocket_activity())
