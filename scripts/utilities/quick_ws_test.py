#!/usr/bin/env python3
import asyncio
import websockets
import json

async def test_with_token():
    # Use the token from our previous test
    token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzM0MzcwOTE5LCJleHAiOjE3MzQzNzQ1MTksInVzZXJfaWQiOjQsImVtYWlsIjoianNzd3AyMDA0QGdtYWlsLmNvbSIsInVzZXJuYW1lIjoianNzd3AyMDA0IiwiZmlyc3RfbmFtZSI6IkphbiIsImxhc3RfbmFtZSI6IlNhbnRvcy1XZXNsZXkiLCJvcmdhbml6YXRpb24iOiJQaWxvdCBMb2NhdGlvbiIsInJvbGUiOiJzeXN0ZW1fYWRtaW4ifQ.7AEMPs2YWP4GlEq544dYyCbb0E5S8rqcfOdw"
    
    uri = f"ws://localhost:9001/ws/presence/?token={token}"
    print(f"🔗 Testing WebSocket with token...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected successfully!")
            
            # Send a test message
            test_message = {"type": "get_online_users"}
            await websocket.send(json.dumps(test_message))
            print("📤 Sent:", test_message)
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            print("📥 Received:", response)
            
    except asyncio.TimeoutError:
        print("❌ WebSocket timed out")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")

asyncio.run(test_with_token())
