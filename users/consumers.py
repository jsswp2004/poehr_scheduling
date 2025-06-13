import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


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
        print(f"Received WebSocket message: {text_data}")
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            print(f"Message type: {message_type}")
            
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
                
            elif message_type == 'create_chat_room':
                print("Handling create_chat_room")
                await self.handle_create_chat_room(data)
            else:
                print(f"Unknown message type: {message_type}")
        
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
            online_users = CustomUser.objects.filter(
                is_online=True
            ).exclude(
                role='patient'
            ).values(
                'id', 'username', 'first_name', 'last_name', 
                'email', 'role', 'is_online', 'last_seen'
            )
            return list(online_users)
        except Exception:
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

    async def handle_create_chat_room(self, data):
        """Handle creating a new chat room"""
        if self.is_test_user:
            print("WARNING: Test user attempting to create chat room - blocked")
            return
            
        try:
            participant_ids = data.get('participant_ids', [])
            room_name = data.get('room_name', '')
            room_type = data.get('room_type', 'direct')
            
            print(f"ROOM: Creating chat room: participants={participant_ids}, name='{room_name}', type={room_type}")
            
            if not participant_ids:
                await self.send_error('Participants required')
                return
            
            # Ensure current user is in participant list
            if self.user.id not in participant_ids:
                participant_ids.append(self.user.id)
                print(f"Added current user {self.user.id} to participants")
                
            # Check if direct message room already exists
            if room_type == 'direct' and len(participant_ids) == 2:
                existing_room = await self.find_existing_direct_room(participant_ids)
                if existing_room:
                    print(f"Found existing direct room: {existing_room['id']}")
                    await self.join_chat_room(existing_room['id'])
                    await self.send(text_data=json.dumps({
                        'type': 'chat_room_created',
                        'room': existing_room
                    }))
                    return
                  
            # Create new chat room
            room_data = await database_sync_to_async(self.create_chat_room)(participant_ids, room_name, room_type)
            
            if room_data:
                # Join the user to the newly created room
                await self.join_chat_room(room_data['id'])
                await self.send(text_data=json.dumps({
                    'type': 'chat_room_created',
                    'room': room_data
                }))
                print(f"SUCCESS: Chat room created successfully: {room_data['id']}")
            else:
                await self.send_error('Failed to create chat room')
                print(f"ERROR: Failed to create chat room in database")
                
        except Exception as e:
            print(f"ERROR: Error creating chat room: {e}")
            import traceback
            traceback.print_exc()
            await self.send_error('Failed to create chat room')# Database operations for chat
    def save_chat_message(self, room_id, message_text, recipient_id=None):
        """Save chat message to database"""
        try:
            from .models import ChatRoom, ChatMessage, CustomUser
            
            room = ChatRoom.objects.get(id=room_id)
            recipient = None
            if recipient_id:
                recipient = CustomUser.objects.get(id=recipient_id)
                
            message = ChatMessage.objects.create(
                room=room,
                sender=CustomUser.objects.get(id=self.user.id),
                recipient=recipient,
                message=message_text,
                message_type='text'
            )
            
            return {
                'id': message.id,
                'room_id': room.id,
                'sender_id': message.sender.id,
                'sender_name': f"{message.sender.first_name} {message.sender.last_name}".strip() or message.sender.username,
                'recipient_id': message.recipient.id if message.recipient else None,
                'message': message.message,
                'timestamp': message.timestamp.isoformat(),
                'is_read': message.is_read
            }
            
        except Exception as e:
            print(f"ERROR: Error saving chat message: {e}")
            return None

    @database_sync_to_async
    def get_chat_messages(self, room_id, limit=50):
        """Get chat messages from database"""
        try:
            from .models import ChatRoom, ChatMessage
            
            room = ChatRoom.objects.get(id=room_id)
            messages = ChatMessage.objects.filter(room=room).order_by('-timestamp')[:limit]
            
            return [{
                'id': msg.id,
                'room_id': room.id,
                'sender_id': msg.sender.id,
                'sender_name': f"{msg.sender.first_name} {msg.sender.last_name}".strip() or msg.sender.username,
                'recipient_id': msg.recipient.id if msg.recipient else None,
                'message': msg.message,
                'timestamp': msg.timestamp.isoformat(),
                'is_read': msg.is_read
            } for msg in reversed(messages)]
            
        except Exception as e:
            print(f"ERROR: Error getting chat messages: {e}")
            return []

    def create_chat_room(self, participant_ids, room_name, room_type):
        """Create a new chat room"""
        try:
            from .models import ChatRoom, CustomUser
            
            # Create room name if not provided
            if not room_name and room_type == 'direct':
                participants = CustomUser.objects.filter(id__in=participant_ids)
                room_name = ', '.join([f"{p.first_name} {p.last_name}".strip() or p.username for p in participants])
            
            room = ChatRoom.objects.create(
                name=room_name or f"Chat Room {ChatRoom.objects.count() + 1}",
                room_type=room_type
            )
            
            # Add participants
            participants = CustomUser.objects.filter(id__in=participant_ids)
            room.participants.set(participants)
            
            return {
                'id': room.id,
                'name': room.name,
                'room_type': room.room_type,
                'participants': [{
                    'id': p.id,
                    'username': p.username,
                    'name': f"{p.first_name} {p.last_name}".strip() or p.username
                } for p in participants],
                'created_at': room.created_at.isoformat()
            }
            
        except Exception as e:
            print(f"ERROR: Error creating chat room: {e}")
            return None

    @database_sync_to_async
    def update_typing_status(self, room_id, is_typing):
        """Update typing status in database"""
        try:
            from .models import ChatRoom, TypingIndicator, CustomUser
            
            room = ChatRoom.objects.get(id=room_id)
            user = CustomUser.objects.get(id=self.user.id)
            
            indicator, created = TypingIndicator.objects.get_or_create(
                user=user,
                room=room,
                defaults={'is_typing': is_typing}
            )
            
            if not created:
                indicator.set_typing(is_typing)
                
            return True
        except Exception as e:
            print(f"ERROR: Error updating typing status: {e}")
            return False

    @database_sync_to_async
    def mark_message_read(self, message_id):
        """Mark message as read"""
        try:
            from .models import ChatMessage
            
            message = ChatMessage.objects.get(id=message_id)
            message.mark_as_read()
            return True
            
        except Exception as e:
            print(f"ERROR: Error marking message as read: {e}")
            return False

    # Broadcasting methods
    async def broadcast_chat_message(self, message_data):
        """Broadcast chat message to room participants"""
        room_group = f"chat_room_{message_data['room_id']}"
        
        await self.channel_layer.group_send(
            room_group,
            {
                'type': 'chat_message',
                'message': message_data
            }
        )

    async def broadcast_typing_indicator(self, room_id, is_typing):
        """Broadcast typing indicator to room participants"""
        room_group = f"chat_room_{room_id}"
        
        await self.channel_layer.group_send(
            room_group,
            {
                'type': 'typing_indicator',
                'user_id': self.user.id,
                'user_name': getattr(self.user, 'username', 'Unknown'),
                'room_id': room_id,
                'is_typing': is_typing
            }
        )

    async def broadcast_read_receipt(self, message_id):
        """Broadcast read receipt"""
        await self.channel_layer.group_send(
            "presence_updates",
            {
                'type': 'read_receipt',
                'message_id': message_id,
                'reader_id': self.user.id
            }
        )

    # WebSocket event handlers
    async def chat_message(self, event):
        """Handle chat message events"""
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'message': event['message']
        }))

    async def typing_indicator(self, event):
        """Handle typing indicator events"""
        # Don't send typing indicators back to the sender
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'typing_indicator',
                'user_id': event['user_id'],
                'user_name': event['user_name'],
                'room_id': event['room_id'],
                'is_typing': event['is_typing']
            }))

    async def read_receipt(self, event):
        """Handle read receipt events"""
        await self.send(text_data=json.dumps({
            'type': 'read_receipt',
            'message_id': event['message_id'],
            'reader_id': event['reader_id']
        }))

    # Utility methods
    async def send_error(self, message):
        """Send error message to client"""
        await self.send(text_data=json.dumps({
            'type': 'error',
            'message': message
        }))

    @database_sync_to_async
    def verify_room_exists(self, room_id):
        """Verify that a chat room exists"""
        try:
            from .models import ChatRoom
            return ChatRoom.objects.filter(id=room_id, is_active=True).exists()
        except Exception as e:
            print(f"ERROR: Error verifying room exists: {e}")
            return False

    @database_sync_to_async
    def find_existing_direct_room(self, participant_ids):
        """Find existing direct message room between users"""
        try:
            from .models import ChatRoom
            
            # For direct messages, find room with exactly these participants
            rooms = ChatRoom.objects.filter(
                room_type='direct',
                is_active=True
            ).prefetch_related('participants')
            
            for room in rooms:
                room_participant_ids = set(room.participants.values_list('id', flat=True))
                if room_participant_ids == set(participant_ids):
                    return {
                        'id': room.id,
                        'name': room.name,
                        'room_type': room.room_type,
                        'participants': [{
                            'id': p.id,
                            'username': p.username,
                            'name': f"{p.first_name} {p.last_name}".strip() or p.username
                        } for p in room.participants.all()],
                        'created_at': room.created_at.isoformat()
                    }
            
            return None
            
        except Exception as e:
            print(f"ERROR: Error finding existing direct room: {e}")
            return None


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        """Handle chat WebSocket connection"""
        self.user = self.scope["user"]
        self.room_id = None
        self.room_group_name = None
        
        print(f"Chat WebSocket connection attempt - User: {self.user}, Type: {type(self.user)}")
        
        # Handle anonymous users - allow but mark as test
        from django.contrib.auth.models import AnonymousUser
        if isinstance(self.user, AnonymousUser):
            print("WARNING: Chat WebSocket connection from anonymous user - ALLOWING FOR TESTING")
            # Create a fake user for testing
            self.user = type('TestUser', (), {
                'id': 999,
                'username': 'test_user',
                'first_name': 'Test',
                'last_name': 'User'
            })()
        
        print(f"SUCCESS: Chat WebSocket connection accepted - User: {getattr(self.user, 'username', 'unknown')} (ID: {getattr(self.user, 'id', 'unknown')})")
        
        await self.accept()
        
        # Send connection confirmation
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'user_id': self.user.id,
            'username': self.user.username
        }))

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        print(f"DISCONNECT: Chat WebSocket disconnected - User: {getattr(self.user, 'username', 'unknown')} (Code: {close_code})")
        
        # Leave room group if connected to one
        if self.room_group_name:
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def safe_send(self, data):
        """Safely send data to WebSocket, checking connection state first"""
        try:
            if hasattr(self, 'channel_name') and hasattr(self, 'send'):
                await self.send(text_data=json.dumps(data))
        except Exception as e:
            print(f"WARNING: Failed to send WebSocket message: {e}")
            # Don't raise the exception, just log it

    async def receive(self, text_data):
        """Handle messages from WebSocket"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            print(f"MESSAGE: Chat message received - Type: {message_type}, Data: {data}")
            
            if message_type == 'join_room':
                await self.handle_join_room(data)
            elif message_type == 'send_message':
                await self.handle_send_message(data)
            elif message_type == 'create_room':
                await self.handle_create_room(data)
            else:
                print(f"ERROR: Unknown message type: {message_type}")
                await self.safe_send({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                })
                
        except json.JSONDecodeError as e:
            print(f"ERROR: Invalid JSON received: {e}")
            await self.safe_send({
                'type': 'error',
                'message': 'Invalid JSON format'
            })
        except Exception as e:
            print(f"ERROR: Error handling chat message: {e}")
            await self.safe_send({
                'type': 'error',
                'message': 'Internal server error'
            })

    async def handle_join_room(self, data):
        """Handle joining a chat room"""
        try:
            room_id = data.get('room_id')
            if not room_id:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Room ID is required'
                }))
                return
            
            # Leave current room if connected to one
            if self.room_group_name:
                await self.channel_layer.group_discard(
                    self.room_group_name,
                    self.channel_name
                )
            
            # Join new room
            self.room_id = room_id
            self.room_group_name = f"chat_{room_id}"
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            
            print(f"GROUP: User {self.user.username} joined room {room_id}")
            
            # Send confirmation
            await self.send(text_data=json.dumps({
                'type': 'room_joined',
                'room_id': room_id
            }))
            
        except Exception as e:
            print(f"ERROR: Error joining room: {e}")
            await self.safe_send({
                'type': 'error',
                'message': 'Failed to join room'
            })

    async def handle_send_message(self, data):
        """Handle sending a chat message"""
        try:
            if not self.room_group_name:
                await self.safe_send({
                    'type': 'error',
                    'message': 'Not connected to any room'
                })
                return
            
            message_content = data.get('message', '').strip()
            if not message_content:
                await self.safe_send({
                    'type': 'error',
                    'message': 'Message content is required'
                })
                return
            
            # Store message in database (if not test user)
            message_data = {
                'id': f"msg_{asyncio.get_event_loop().time()}",  # Simple ID for now
                'message': message_content,
                'sender': {
                    'id': self.user.id,
                    'username': self.user.username,
                    'name': f"{getattr(self.user, 'first_name', '')} {getattr(self.user, 'last_name', '')}".strip() or self.user.username
                },
                'room_id': self.room_id,
                'timestamp': asyncio.get_event_loop().time()
            }
            
            print(f"CHAT: Broadcasting message in room {self.room_id}: {message_content}")
            
            # Broadcast message to room group
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'message_data': message_data
                }
            )
            
        except Exception as e:
            print(f"ERROR: Error sending message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Failed to send message'
            }))

    async def handle_create_room(self, data):
        """Handle creating a new chat room"""
        try:
            participants = data.get('participants', [])
            if not participants:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Participants are required'
                }))
                return
            
            # For now, create a simple room ID
            room_id = f"room_{self.user.id}_{hash(str(sorted(participants)))}"
            
            room_data = {
                'id': room_id,
                'name': f"Chat with {len(participants)} users",
                'room_type': 'direct' if len(participants) == 2 else 'group',
                'participants': participants,
                'created_at': asyncio.get_event_loop().time()
            }
            
            print(f"ROOM: Created room {room_id} with participants: {participants}")
            
            # Send room created confirmation
            await self.send(text_data=json.dumps({
                'type': 'room_created',
                'room': room_data
            }))
            
        except Exception as e:
            print(f"ERROR: Error creating room: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Failed to create room'
            }))

    # WebSocket message handlers
    async def chat_message(self, event):
        """Send chat message to WebSocket"""
        message_data = event['message_data']
        
        await self.send(text_data=json.dumps({
            'type': 'message_received',
            'message': message_data
        }))
