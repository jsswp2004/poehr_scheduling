#!/usr/bin/env python
"""
WebSocket Test Script for Phase 1 Online Status System
Run this to test if the WebSocket connections are working properly.
"""

import os
import django
import sys

# Add the project directory to the Python path
project_path = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_path)

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from channels.testing import WebsocketCommunicator
from poehr_scheduling_backend.asgi import application
from users.models import CustomUser
from rest_framework_simplejwt.tokens import AccessToken

async def test_websocket_connection():
    """Test WebSocket connection and authentication"""
    try:
        # Get a test user (or create one)
        user = CustomUser.objects.filter(role='admin').first()
        if not user:
            print("❌ No admin user found for testing")
            return False
            
        # Generate a test token
        token = AccessToken.for_user(user)
        
        # Create WebSocket communicator
        communicator = WebsocketCommunicator(
            application,
            f"/ws/presence/?token={token}"
        )
        
        # Test connection
        connected, subprotocol = await communicator.connect()
        
        if connected:
            print(f"✅ WebSocket connected successfully for user: {user.username}")
            
            # Test sending a message
            await communicator.send_json_to({
                "type": "get_online_users"
            })
            
            # Test receiving a response
            response = await communicator.receive_json_from(timeout=5)
            print(f"✅ Received response: {response.get('type', 'unknown')}")
            
            await communicator.disconnect()
            return True
        else:
            print("❌ WebSocket connection failed")
            return False
            
    except Exception as e:
        print(f"❌ WebSocket test error: {e}")
        return False

if __name__ == "__main__":
    import asyncio
    
    print("🧪 Testing WebSocket Connection...")
    result = asyncio.run(test_websocket_connection())
    
    if result:
        print("\n🎉 WebSocket test PASSED! Phase 1 is ready.")
        print("\n📝 Next steps:")
        print("1. Start Django with ASGI: daphne poehr_scheduling_backend.asgi:application")
        print("2. Start React frontend: npm start")
        print("3. Test online status in the Team tab")
    else:
        print("\n💥 WebSocket test FAILED. Check the configuration.")
        print("\n🔧 Troubleshooting:")
        print("1. Ensure Redis is running")
        print("2. Check Django settings for Channels configuration")
        print("3. Verify JWT authentication setup")
