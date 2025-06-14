import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
# Corrected import: ChatRoom and Message are in users.models
from .models import OnlineUser, ChatRoom, ChatMessage
from django.utils import timezone
import logging # Added for explicit logging if needed

CustomUser = get_user_model()
logger = logging.getLogger(__name__)

class PresenceConsumer(AsyncWebsocketConsumer):    
    async def connect(self):
        """Handle WebSocket connection"""
        self.user = self.scope["user"]
        self.is_test_user = False
        
        print(f"WebSocket connection attempt - User: {self.user}, Type: {type(self.user)}")
          # Handle anonymous users - allow but mark as test
        from django.contrib.auth.models import AnonymousUser
        if isinstance(self.user, AnonymousUser):
            print("WARNING: WebSocket connection from anonymous user - ALLOWING FOR TESTING")
            # Create a fake user for testing
            self.user = type('TestUser', (), {
                'id': 999,
                'username': 'test_user',
                'first_name': 'Test',
                'last_name': 'User'
            })()
            self.is_test_user = True
        
        print(f"WebSocket connection accepted - User: {getattr(self.user, 'username', 'unknown')} (ID: {getattr(self.user, 'id', 'unknown')})")
        
        # Join user to their personal presence group
        self.user_group_name = f"user_{self.user.id}"
        await self.channel_layer.group_add(
            self.user_group_name,
            self.channel_name
        )
        
        # Join global presence group to receive all user status updates
        await self.channel_layer.group_add(
            "presence_updates",
            self.channel_name
        )
        
        await self.accept()
        
        # Set user as online (only for real users)
        if not self.is_test_user:
            print(f"Setting user {self.user.username} (ID: {self.user.id}) as ONLINE")
            success = await self.set_user_online(True)
            print(f"SUCCESS: Set online result: {success}")
            
            # Broadcast user's online status to all connected clients
            await self.broadcast_user_status()
        else:
            print("TEST: Test user - skipping online status update")
        
        # Start heartbeat task
        self.heartbeat_task = asyncio.create_task(self.heartbeat_loop())
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        # Cancel heartbeat task
        if hasattr(self, 'heartbeat_task'):
            self.heartbeat_task.cancel()
          # Set user as offline (only for real users)
        if not self.is_test_user:
            print(f"Setting user {getattr(self.user, 'username', 'unknown')} (ID: {getattr(self.user, 'id', 'unknown')}) as OFFLINE")
            await self.set_user_online(False)
            await self.broadcast_user_status()
        
        # Leave groups
        if hasattr(self, 'user_group_name'):
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name
            )
        
        await self.channel_layer.group_discard(
            "presence_updates",
            self.channel_name
        )

    async def receive(self, text_data):
        """Handle incoming WebSocket messages"""
        print(f"DEBUG_CHAT_RECEIVE: Raw message received: {text_data}") # Log raw message data
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            print(f"DEBUG_CHAT_RECEIVE: Parsed message_type: {message_type}") # Log parsed message type
            
            if message_type == 'heartbeat':
                # Update user's last seen timestamp
                await self.update_user_last_seen()
                # Send heartbeat response
                await self.send(text_data=json.dumps({
                    'type': 'heartbeat_response',
                    'timestamp': data.get('timestamp')
                }))
            elif message_type == 'get_online_users':
                # Send list of online users
                online_users = await self.get_online_users()
                await self.send(text_data=json.dumps({
                    'type': 'online_users_list',
                    'users': online_users
                }))
                
            # Phase 2: Chat Message Handling
            elif message_type == 'send_message':
                print("Handling send_message")
                await self.handle_send_message(data)
                
            elif message_type == 'typing_start':
                print("Handling typing_start")
                await self.handle_typing_indicator(data, True)
                
            elif message_type == 'typing_stop':
                print("Handling typing_stop")
                await self.handle_typing_indicator(data, False)
                
            elif message_type == 'mark_message_read':
                print("Handling mark_message_read")
                await self.handle_mark_message_read(data)
                
            elif message_type == 'get_chat_history':
                print("Handling get_chat_history")
                await self.handle_get_chat_history(data)
            
            # Add a specific log before create_chat_room handler
            elif message_type == 'create_chat_room':
                print(f"DEBUG_CHAT_RECEIVE: Routing to handle_create_chat_room for data: {data}")
                await self.handle_create_chat_room(data)
            else:
                print(f"DEBUG_CHAT_RECEIVE: Unknown message type: {message_type}, Data: {data}")
        
        except json.JSONDecodeError:
            print("ERROR: Invalid JSON received")
            # Invalid JSON received
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            print(f"ERROR: Error in receive: {e}")
            import traceback
            traceback.print_exc()
    
    async def heartbeat_loop(self):
        """Send periodic heartbeat to keep connection alive"""
        try:
            while True:
                await asyncio.sleep(30)  # Send heartbeat every 30 seconds
                await self.update_user_last_seen()
        except asyncio.CancelledError:
            pass
    
    async def user_status_update(self, event):
        """Handle user status update events"""
        await self.send(text_data=json.dumps({
            'type': 'user_status_update',
            'user_id': event['user_id'],
            'is_online': event['is_online'],
            'last_seen': event['last_seen']        }))
    
    @database_sync_to_async
    def set_user_online(self, is_online):
        """Set user's online status in database"""
        try:
            from .models import CustomUser
            print(f"Database operation: Setting user {self.user.id} online status to {is_online}")
            user = CustomUser.objects.get(id=self.user.id)
            user.set_online_status(is_online)
            print(f"SUCCESS: Successfully set user {self.user.id} online status to {is_online}")
            return True
        except CustomUser.DoesNotExist:
            print(f"ERROR: User {self.user.id} does not exist in database")
            return False
        except Exception as e:
            print(f"ERROR: Error setting online status for user {self.user.id}: {e}")
            return False
    
    @database_sync_to_async
    def update_user_last_seen(self):
        """Update user's last seen timestamp"""
        try:
            from .models import CustomUser
            user = CustomUser.objects.get(id=self.user.id)
            user.update_last_seen()
            return True
        except CustomUser.DoesNotExist:
            return False
        except Exception as e:
            print(f"ERROR: Error updating last seen for user {self.user.id}: {e}")
            return False
    
    @database_sync_to_async
    def get_online_users(self):
        """Get list of online users (excluding patients)"""
        try:
            from .models import CustomUser
            online_users_qs = CustomUser.objects.filter(
                is_online=True
            ).exclude(
                role='patient'
            ).values(
                'id', 'username', 'first_name', 'last_name', 
                'email', 'role', 'is_online', 'last_seen'
            )
            # Convert datetime objects to ISO strings
            online_users = []
            for user in online_users_qs:
                if user['last_seen']:
                    user['last_seen'] = user['last_seen'].isoformat()
                online_users.append(user)
            return online_users
        except Exception as e:
            print(f"ERROR: Error in get_online_users: {e}")
            return []
    
    async def broadcast_user_status(self):
        """Broadcast user's status change to all connected clients"""
        user_data = await self.get_user_data()
        
        await self.channel_layer.group_send(
            "presence_updates",
            {
                'type': 'user_status_update',
                'user_id': self.user.id,
                'is_online': user_data['is_online'],
                'last_seen': user_data['last_seen']
            }
        )
    
    @database_sync_to_async
    def get_user_data(self):
        """Get user's current status data"""
        try:
            from .models import CustomUser
            user = CustomUser.objects.get(id=self.user.id)
            return {
                'id': user.id,
                'is_online': user.is_online,
                'last_seen': user.last_seen.isoformat() if user.last_seen else None
            }
        except CustomUser.DoesNotExist:
            return {'id': self.user.id, 'is_online': False, 'last_seen': None}

    # Phase 2: Chat Message Handling Methods
    async def join_chat_room(self, room_id):
        """Join a chat room group"""
        room_group = f"chat_room_{room_id}"
        await self.channel_layer.group_add(
            room_group,
            self.channel_name
        )
        print(f"User {self.user} joined group {room_group}")

    async def leave_chat_room(self, room_id):
        """Leave a chat room group"""
        room_group = f"chat_room_{room_id}"
        await self.channel_layer.group_discard(
            room_group,
            self.channel_name
        )
        print(f"User {self.user.id} left chat room group: {room_group}")

    async def handle_send_message(self, data):
        """Handle sending a chat message"""
        print(f"MESSAGE: Received send_message request: {data}")
        
        if self.is_test_user:
            print("WARNING: Test user attempting to send message - blocked")
            return
            
        try:
            room_id = data.get('room_id')
            message_text = data.get('message', '').strip()
            recipient_id = data.get('recipient_id')
            
            print(f"Message details: room_id={room_id}, text='{message_text[:50]}...', recipient={recipient_id}")
            
            if not room_id:
                print("ERROR: No room_id provided")
                await self.send_error('Room ID is required')
                return
                
            if not message_text:
                print("ERROR: Empty message text")
                await self.send_error('Message cannot be empty')
                return
            
            # Verify room exists
            room_exists = await self.verify_room_exists(room_id)
            if not room_exists:
                print(f"ERROR: Room {room_id} does not exist")
                await self.send_error(f'Chat room {room_id} does not exist')
                return
                
            # Ensure user is in the chat room group
            await self.join_chat_room(room_id)
            
            # Save message to database
            message_data = await database_sync_to_async(self.save_chat_message)(room_id, message_text, recipient_id)
            print(f"Saved message data: {message_data}")
            
            if message_data:
                # Broadcast message to room participants
                await self.broadcast_chat_message(message_data)
                
                # Send confirmation to sender
                await self.send(text_data=json.dumps({
                    'type': 'message_sent',
                    'message': message_data
                }))
                print(f"SUCCESS: Message sent and broadcasted successfully")
            else:
                await self.send_error('Failed to save message to database')
                print(f"ERROR: Failed to save message to database")
                
        except Exception as e:
            print(f"ERROR: Error handling send_message: {e}")
            import traceback
            traceback.print_exc()
            await self.send_error('Failed to process message')

    async def handle_typing_indicator(self, data, is_typing):
        """Handle typing indicators"""
        if self.is_test_user:
            return
            
        try:
            room_id = data.get('room_id')
            if not room_id:
                return
                
            # Update typing status in database
            await self.update_typing_status(room_id, is_typing)
            
            # Broadcast typing indicator to room participants
            await self.broadcast_typing_indicator(room_id, is_typing)
            
        except Exception as e:
            print(f"ERROR: Error handling typing indicator: {e}")

    async def handle_mark_message_read(self, data):
        """Handle marking message as read"""
        if self.is_test_user:
            return
            
        try:
            message_id = data.get('message_id')
            if not message_id:
                return
                  # Mark message as read in database
            success = await self.mark_message_read(message_id)
            
            if success:
                # Broadcast read receipt
                await self.broadcast_read_receipt(message_id)
                
        except Exception as e:
            print(f"ERROR: Error marking message as read: {e}")
            
    async def handle_get_chat_history(self, data):
        """Handle getting chat history"""
        try:
            room_id = data.get('room_id')
            limit = data.get('limit', 50)
            
            if not room_id:
                await self.send_error('Room ID required')
                return
                
            # Join the chat room to receive future messages
            await self.join_chat_room(room_id)
            
            # Get chat history from database
            messages = await self.get_chat_messages(room_id, limit)
            
            await self.send(text_data=json.dumps({
                'type': 'chat_history',
                'room_id': room_id,
                'messages': messages
            }))
            
        except Exception as e:
            print(f"ERROR: Error getting chat history: {e}")
            await self.send_error('Failed to load chat history')

    async def handle_create_chat_room(self, event):
        print("Handling create_chat_room") # Existing log
        print(f"DEBUG_CHAT: handle_create_chat_room received event: {event}")
        participant_ids = event.get('participants', [])
        print(f"DEBUG_CHAT: Extracted participant_ids from event.get: {participant_ids}")

        if not participant_ids or not isinstance(participant_ids, list) or len(participant_ids) != 2: # Direct chats are 1-on-1
            error_message = "Failed to create chat room: Exactly two participant IDs are required."
            print(f"DEBUG_CHAT: Validation failed. IDs: {participant_ids}. Error: {error_message}")
            await self.send_error(error_message)
            return

        try:
            participant_ids_int = [int(pid) for pid in participant_ids]
            print(f"DEBUG_CHAT: Converted participant_ids to int: {participant_ids_int}")
        except ValueError:
            error_message = "Invalid participant ID format. IDs must be integers."
            print(f"DEBUG_CHAT: Invalid participant ID format in {participant_ids}. Error: {error_message}")
            await self.send_error(error_message)
            return

        # Ensure the current user is one of the participants
        if self.scope['user'].id not in participant_ids_int:
            error_message = "User initiating chat must be one of the participants."
            print(f"DEBUG_CHAT: Current user {self.scope['user'].id} not in participant_ids_int {participant_ids_int}. Error: {error_message}")
            await self.send_error(error_message)
            return
        
        # Prevent user from creating a chat room with themselves
        if len(set(participant_ids_int)) < 2:
            error_message = "Cannot create a chat room with yourself."
            print(f"DEBUG_CHAT: Attempt to create chat with self. IDs: {participant_ids_int}. Error: {error_message}")
            await self.send_error(error_message)
            return

        room = await self._get_or_create_direct_chat_room(participant_ids_int)

        if room:
            print(f"DEBUG_CHAT: Chat room {'created' if getattr(room, '_created_in_consumer', False) else 'retrieved'}: ID {room.id}, Name: {room.name}")
            
            # Join the chat room group to receive messages
            await self.join_chat_room(room.id)
            
            participant_objs = await self._get_participant_objs(room)
            print(f"DEBUG: Sending chat_room_created to user {self.scope['user'].id} on channel {self.channel_name}")
            await self.send(text_data=json.dumps({
                'type': 'chat_room_created',
                'room_id': room.id,
                'name': room.name,
                'participants': participant_objs, # Now sending objects with id and username
                'chat_type': room.room_type
            }))
        else:
            print(f"DEBUG_CHAT: Failed to create or retrieve chat room for participants: {participant_ids_int}. An error should have been sent.")

    @database_sync_to_async
    def _get_participant_objs(self, room):
        return [
            {'id': p.id, 'username': p.username, 'first_name': p.first_name, 'last_name': p.last_name}
            for p in room.participants.all()
        ]

    @database_sync_to_async
    def _get_or_create_direct_chat_room(self, participant_ids_int):
        print(f"DEBUG_CHAT: _get_or_create_direct_chat_room entered with participant_ids_int: {participant_ids_int}")

        user1_id, user2_id = sorted(participant_ids_int) # Sort to ensure consistent lookup/creation if manager relies on order

        user1 = CustomUser.objects.filter(id=user1_id).first()
        user2 = CustomUser.objects.filter(id=user2_id).first()

        print(f"DEBUG_CHAT: _get_or_create_direct_chat_room: Fetched user1 (ID {user1_id}): {'Found' if user1 else 'NOT FOUND'}")
        print(f"DEBUG_CHAT: _get_or_create_direct_chat_room: Fetched user2 (ID {user2_id}): {'Found' if user2 else 'NOT FOUND'}")

        if not user1 or not user2:
            print(f"DEBUG_CHAT: _get_or_create_direct_chat_room: One or both users not found. Cannot create chat room.")
            # No explicit self.send_error here as this is a sync function. Calling function handles it.
            return None

        participants_for_room = [user1, user2]
        
        # Use the manager method that expects a list of user *objects*
        # This assumes your ChatRoomManager has a method like get_or_create_direct_room_for_participants
        try:
            # Assuming your manager method is robust.
            # The log `ROOM: Creating chat room: participants=[]...` comes from your chat.models.ChatRoomManager.
            # We are now ensuring `participants_for_room` is correctly populated.
            print(f"DEBUG_CHAT: _get_or_create_direct_chat_room: Calling ChatRoom.objects.get_or_create_direct_room_for_participants with: {[p.username for p in participants_for_room]}")
            
            room, created = ChatRoom.objects.get_or_create_direct_room_for_participants(
                participants=participants_for_room
            )
            # Add a flag to indicate if it was created by this call, for logging in the calling async method
            room._created_in_consumer = created 
            
            print(f"DEBUG_CHAT: _get_or_create_direct_chat_room: Room {'created' if created else 'retrieved'} by manager: ID {room.id if room else 'None'}, Name {room.name if room else 'None'}")
            return room
        except Exception as e:
            print(f"DEBUG_CHAT: _get_or_create_direct_chat_room: Error during ChatRoom.objects.get_or_create_direct_room_for_participants: {e}")
            print(f"DEBUG_CHAT: Participants at error: {[p.username for p in participants_for_room] if all(participants_for_room) else 'Error with participants list'}")
            return None

    async def send_error(self, message, error_type="error"):
        print(f"DEBUG_WEBSOCKET: Sending error: {message}")
        await self.send(text_data=json.dumps({
            'type': error_type,
            'message': message
        }))

    async def get_chat_messages(self, room_id, limit=50):
        # Fetch chat messages for a room, ordered by timestamp descending, limited to 'limit' messages
        messages = await self._get_chat_messages_from_db(room_id, limit)
        return messages

    @database_sync_to_async
    def _get_chat_messages_from_db(self, room_id, limit):
        qs = ChatMessage.objects.filter(room_id=room_id).order_by('-timestamp')[:limit]
        # Return as list of dicts for JSON serialization
        return [
            {
                'id': m.id,
                'sender': m.sender.username,
                'sender_id': m.sender.id,
                'recipient_id': m.recipient.id if m.recipient else None,
                'message': m.message,
                'message_type': m.message_type,
                'timestamp': m.timestamp.isoformat(),
                'is_read': m.is_read
            }
            for m in qs
        ]
    
    async def broadcast_chat_message(self, message_data):
        """Broadcast a chat message to all participants in the room"""
        print(f"BROADCAST: Broadcasting message to room {message_data.get('room_id')}")
        
        try:
            room_id = message_data.get('room_id')
            if not room_id:
                print("ERROR: No room_id in message_data for broadcasting")
                return
                
            # Send to all participants in the chat room
            room_group_name = f"chat_room_{room_id}"
            
            await self.channel_layer.group_send(
                room_group_name,
                {
                    'type': 'chat_message_broadcast',
                    'message': message_data
                }
            )
            print(f"SUCCESS: Message broadcasted to group {room_group_name}")
            
        except Exception as e:
            print(f"ERROR: Failed to broadcast message: {e}")
            import traceback
            traceback.print_exc()
    
    async def chat_message_broadcast(self, event):
        """Handle broadcasting a chat message to WebSocket clients"""
        try:
            message_data = event['message']
            print(f"BROADCAST_HANDLER: Sending message to WebSocket client: {message_data}")
            
            await self.send(text_data=json.dumps({
                'type': 'new_message',
                'message': message_data
            }))
            
        except Exception as e:
            print(f"ERROR: Failed to send broadcasted message to client: {e}")
            import traceback
            traceback.print_exc()
    
    def save_chat_message(self, room_id, message_text, recipient_id=None):
        """Save a chat message to the database"""
        try:
            print(f"SAVE_MESSAGE: Saving message to room {room_id}")
            
            # Get the chat room
            room = ChatRoom.objects.get(id=room_id)
            # Create the message
            # Get the recipient (other participant in the room)
            room_participants = room.participants.exclude(id=self.user.id)
            recipient = room_participants.first() if room_participants.exists() else None

            # Create the message
            message = ChatMessage.objects.create(
                room=room,
                sender=self.user,
                recipient=recipient,
                message=message_text,
                
            )
            
            print(f"SAVE_MESSAGE: Message saved with ID {message.id}")
            
            # Return message data for broadcasting
            return {
                'id': message.id,
                'room_id': room_id,
                'sender_id': self.user.id,
                'sender_name': f"{self.user.first_name} {self.user.last_name}".strip() or self.user.username,
                'content': message.message,
                'timestamp': message.timestamp.isoformat(),
                'is_read': False
            }
            
        except ChatRoom.DoesNotExist:
            print(f"ERROR: Chat room {room_id} does not exist")
            return None
        except Exception as e:
            print(f"ERROR: Failed to save message: {e}")
            import traceback
            traceback.print_exc()
            return None
            
    @database_sync_to_async
    def verify_room_exists(self, room_id):
        """Verify that a chat room exists"""
        try:
            ChatRoom.objects.get(id=room_id)
            return True
        except ChatRoom.DoesNotExist:
            return False
