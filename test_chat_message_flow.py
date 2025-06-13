#!/usr/bin/env python
import asyncio
import websockets
import json
import time

async def test_chat_message_flow():
    """Test the complete chat message flow"""
    uri = "ws://localhost:8005/ws/presence/"
    
    print(f"🔗 Testing chat message flow to {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connection established!")
            
            # Step 1: Create a chat room
            print("\n📝 Step 1: Creating chat room...")
            create_room_message = {
                "type": "create_chat_room",
                "participant_ids": [999, 1000],  # Test user IDs
                "room_name": "Test Room",
                "room_type": "direct"
            }
            await websocket.send(json.dumps(create_room_message))
            print("📤 Sent create_chat_room message")
            
            # Wait for room creation response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                response_data = json.loads(response)
                print(f"📥 Received: {response_data}")
                
                if response_data.get('type') == 'chat_room_created':
                    room_id = response_data['room']['id']
                    print(f"🏠 Room created with ID: {room_id}")
                    
                    # Step 2: Send a message to the room
                    print("\n📝 Step 2: Sending message to room...")
                    send_message = {
                        "type": "send_message",
                        "room_id": room_id,
                        "message": "Hello, this is a test message!",
                        "recipient_id": 1000
                    }
                    await websocket.send(json.dumps(send_message))
                    print("📤 Sent message")
                    
                    # Wait for message responses
                    print("\n📝 Step 3: Waiting for message responses...")
                    for i in range(3):  # Wait for up to 3 responses
                        try:
                            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                            response_data = json.loads(response)
                            print(f"📥 Response {i+1}: {response_data}")
                            
                            if response_data.get('type') == 'new_message':
                                print("✅ SUCCESS: Received new_message event!")
                                print(f"   Message: {response_data['message']['message']}")
                                print(f"   Room ID: {response_data['message']['room_id']}")
                                break
                        except asyncio.TimeoutError:
                            print(f"⏰ Timeout waiting for response {i+1}")
                            break
                        except json.JSONDecodeError:
                            print(f"❌ Invalid JSON in response {i+1}")
                            break
                    
                else:
                    print("❌ Failed to create room")
                    
            except asyncio.TimeoutError:
                print("⏰ No response to room creation within 5 seconds")
            except json.JSONDecodeError:
                print("❌ Invalid JSON response")
            
    except ConnectionRefusedError:
        print("❌ Connection refused - server may not be running")
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_chat_message_flow())
