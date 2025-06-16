#!/usr/bin/env python3
"""
Test WebSocket with real JWT token
"""
import asyncio
import websockets
import json
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth import get_user_model

async def test_websocket_with_auth():
    # Get a real user and generate token
    User = get_user_model()
    user = User.objects.first()
    token = AccessToken.for_user(user)
    
    uri = f"ws://localhost:9001/ws/presence/?token={str(token)}"
    print(f"🔗 Testing with user: {user.username} (ID: {user.id})")
    print(f"🔑 Token (first 50 chars): {str(token)[:50]}...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected successfully with authentication!")
            
            # Send get_online_users message
            test_message = {"type": "get_online_users"}
            await websocket.send(json.dumps(test_message))
            print("📤 Sent:", test_message)
            
            # Wait for response
            response = await websocket.recv()
            print("📥 Received:", response)
            
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket_with_auth())
