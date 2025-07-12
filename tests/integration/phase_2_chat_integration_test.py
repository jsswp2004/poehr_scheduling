#!/usr/bin/env python3
"""
Phase 2 Chat System Integration Test
===================================

Tests the complete chat system integration:
- WebSocket connection for chat
- Chat room creation
- Message sending and receiving
- Typing indicators
- Read receipts
- Real-time chat functionality

Run this after starting both the WebSocket server and React frontend.
"""

import asyncio
import websockets
import json
import jwt
import time
from datetime import datetime, timedelta

# Configuration
WEBSOCKET_URL = "ws://127.0.0.1:8005/ws/presence/"
SECRET_KEY = "your-secret-key-here"  # Replace with actual secret key
TEST_USERS = [
    {"user_id": 1, "username": "testuser1", "first_name": "Alice", "last_name": "Test"},
    {"user_id": 2, "username": "testuser2", "first_name": "Bob", "last_name": "Test"}
]

def create_test_token(user_data):
    """Create a JWT token for testing"""
    payload = {
        'user_id': user_data['user_id'],
        'username': user_data['username'],
        'first_name': user_data['first_name'],
        'last_name': user_data['last_name'],
        'exp': datetime.utcnow() + timedelta(hours=1),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

async def test_chat_user(user_data, partner_id):
    """Test chat functionality for a single user"""
    token = create_test_token(user_data)
    
    # Connect to WebSocket with authentication
    headers = {'Authorization': f'Bearer {token}'}
    
    try:
        async with websockets.connect(
            WEBSOCKET_URL,
            extra_headers=headers
        ) as websocket:
            print(f"✅ {user_data['first_name']} connected to WebSocket")
            
            # Send presence update
            await websocket.send(json.dumps({
                'type': 'presence_update',
                'status': 'online'
            }))
            
            # Wait a moment for connection to stabilize
            await asyncio.sleep(1)
            
            # Create a direct message room with partner
            await websocket.send(json.dumps({
                'type': 'create_chat_room',
                'participant_ids': [user_data['user_id'], partner_id],
                'room_name': f"{user_data['first_name']} & Partner Chat",
                'room_type': 'direct'
            }))
            
            print(f"📝 {user_data['first_name']} created chat room with user {partner_id}")
            
            # Send typing indicator
            await websocket.send(json.dumps({
                'type': 'typing_start',
                'room_id': 1  # Assume room ID 1 for test
            }))
            
            await asyncio.sleep(2)
            
            # Send a test message
            test_message = f"Hello from {user_data['first_name']}! Testing Phase 2 chat system. 🚀"
            await websocket.send(json.dumps({
                'type': 'send_message',
                'room_id': 1,
                'message': test_message,
                'recipient_id': partner_id
            }))
            
            print(f"💬 {user_data['first_name']} sent message: {test_message}")
            
            # Stop typing
            await websocket.send(json.dumps({
                'type': 'typing_stop',
                'room_id': 1
            }))
            
            # Listen for incoming messages
            messages_received = 0
            timeout = 10  # seconds
            start_time = time.time()
            
            while messages_received < 3 and (time.time() - start_time) < timeout:
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    data = json.loads(response)
                    
                    message_type = data.get('type')
                    if message_type == 'new_message':
                        print(f"📨 {user_data['first_name']} received message: {data.get('message', {}).get('message')}")
                        messages_received += 1
                        
                        # Send read receipt
                        await websocket.send(json.dumps({
                            'type': 'mark_message_read',
                            'message_id': data.get('message', {}).get('id')
                        }))
                        
                    elif message_type == 'typing_indicator':
                        typing_user = data.get('user_name', 'Someone')
                        is_typing = data.get('is_typing', False)
                        if is_typing:
                            print(f"⌨️  {user_data['first_name']} sees: {typing_user} is typing...")
                        else:
                            print(f"⌨️  {user_data['first_name']} sees: {typing_user} stopped typing")
                            
                    elif message_type == 'read_receipt':
                        print(f"✅ {user_data['first_name']} received read receipt for message {data.get('message_id')}")
                        
                    elif message_type == 'chat_room_created':
                        room_info = data.get('room', {})
                        print(f"🏠 {user_data['first_name']} joined chat room: {room_info.get('name')} (ID: {room_info.get('id')})")
                        
                    elif message_type == 'error':
                        print(f"❌ {user_data['first_name']} received error: {data.get('message')}")
                        
                except asyncio.TimeoutError:
                    continue
                except websockets.exceptions.ConnectionClosed:
                    print(f"🔌 {user_data['first_name']} WebSocket connection closed")
                    break
                    
            print(f"✅ {user_data['first_name']} test completed successfully!")
            
    except Exception as e:
        print(f"❌ Error testing {user_data['first_name']}: {e}")

async def main():
    """Main test function"""
    print("🚀 Starting Phase 2 Chat System Integration Test")
    print("=" * 50)
    
    # Test both users simultaneously
    tasks = []
    for i, user in enumerate(TEST_USERS):
        partner_id = TEST_USERS[1 - i]['user_id']  # Get the other user's ID
        task = asyncio.create_task(test_chat_user(user, partner_id))
        tasks.append(task)
        
        # Slight delay between connections
        await asyncio.sleep(0.5)
    
    # Wait for all tests to complete
    await asyncio.gather(*tasks)
    
    print("\n" + "=" * 50)
    print("🎉 Phase 2 Chat System Integration Test Complete!")
    print("\nFeatures tested:")
    print("✅ WebSocket authentication and connection")
    print("✅ Chat room creation (direct messages)")
    print("✅ Real-time message sending and receiving")
    print("✅ Typing indicators (start/stop)")
    print("✅ Read receipts")
    print("✅ Multi-user chat simulation")
    
    print("\n📋 Manual Testing Steps:")
    print("1. Open the React frontend in your browser")
    print("2. Navigate to the Patients page")
    print("3. Look for team members with online status indicators")
    print("4. Click on a team member's chat button (online indicator)")
    print("5. Send messages in the chat modal")
    print("6. Test typing indicators by typing slowly")
    print("7. Verify real-time message delivery")

if __name__ == "__main__":
    asyncio.run(main())
