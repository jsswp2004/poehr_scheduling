import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


class PresenceConsumer(AsyncWebsocketConsumer):    
    async def connect(self):
        """Handle WebSocket connection"""
        self.user = self.scope["user"]
        self.is_test_user = False
        
        print(f"🔍 WebSocket connection attempt - User: {self.user}, Type: {type(self.user)}")
          # Handle anonymous users - allow but mark as test
        from django.contrib.auth.models import AnonymousUser
        if isinstance(self.user, AnonymousUser):
            print("⚠️ WebSocket connection from anonymous user - ALLOWING FOR TESTING")
            # Create a fake user for testing
            self.user = type('TestUser', (), {
                'id': 999,
                'username': 'test_user',
                'first_name': 'Test',
                'last_name': 'User'
            })()
            self.is_test_user = True
        
        print(f"✅ WebSocket connection accepted - User: {getattr(self.user, 'username', 'unknown')} (ID: {getattr(self.user, 'id', 'unknown')})")
        
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
            print(f"🔄 Setting user {self.user.username} (ID: {self.user.id}) as ONLINE")
            success = await self.set_user_online(True)
            print(f"✅ Set online result: {success}")
            
            # Broadcast user's online status to all connected clients
            await self.broadcast_user_status()
        else:
            print("🧪 Test user - skipping online status update")
        
        # Start heartbeat task
        self.heartbeat_task = asyncio.create_task(self.heartbeat_loop())
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        # Cancel heartbeat task
        if hasattr(self, 'heartbeat_task'):
            self.heartbeat_task.cancel()
          # Set user as offline (only for real users)
        if not self.is_test_user:
            print(f"🔄 Setting user {getattr(self.user, 'username', 'unknown')} (ID: {getattr(self.user, 'id', 'unknown')}) as OFFLINE")
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
        print(f"📨 Received WebSocket message: {text_data}")
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            print(f"🔍 Message type: {message_type}")
            
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
                
            # 🆕 Phase 2: Chat Message Handling
            elif message_type == 'send_message':
                print("🚀 Handling send_message")
                await self.handle_send_message(data)
                
            elif message_type == 'typing_start':
                print("🚀 Handling typing_start")
                await self.handle_typing_indicator(data, True)
                
            elif message_type == 'typing_stop':
                print("🚀 Handling typing_stop")
                await self.handle_typing_indicator(data, False)
                
            elif message_type == 'mark_message_read':
                print("🚀 Handling mark_message_read")
                await self.handle_mark_message_read(data)
                
            elif message_type == 'get_chat_history':
                print("🚀 Handling get_chat_history")
                await self.handle_get_chat_history(data)
                
            elif message_type == 'create_chat_room':
                print("🚀 Handling create_chat_room")
                await self.handle_create_chat_room(data)
            else:
                print(f"❓ Unknown message type: {message_type}")
        
        except json.JSONDecodeError:
            print("❌ Invalid JSON received")
            # Invalid JSON received
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))
        except Exception as e:
            print(f"❌ Error in receive: {e}")
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
            print(f"🔄 Database operation: Setting user {self.user.id} online status to {is_online}")
            user = CustomUser.objects.get(id=self.user.id)
            user.set_online_status(is_online)
            print(f"✅ Successfully set user {self.user.id} online status to {is_online}")
            return True
        except CustomUser.DoesNotExist:
            print(f"❌ User {self.user.id} does not exist in database")
            return False
        except Exception as e:
            print(f"❌ Error setting online status for user {self.user.id}: {e}")
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
            print(f"❌ Error updating last seen for user {self.user.id}: {e}")
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

    # 🆕 Phase 2: Chat Message Handling Methods
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
        print(f"👋 User {self.user.id} left chat room group: {room_group}")

    async def handle_send_message(self, data):
        """Handle sending a chat message"""
        print(f"📨 Received send_message request: {data}")
        
        if self.is_test_user:
            return
            
        try:
            room_id = data.get('room_id')
            message_text = data.get('message', '').strip()
            recipient_id = data.get('recipient_id')
            
            print(f"📋 Message details: room_id={room_id}, text='{message_text}', recipient={recipient_id}")
            
            if not message_text:
                await self.send_error('Message cannot be empty')
                return
                
            # Ensure user is in the chat room group
            await self.join_chat_room(room_id)
            
            # Save message to database
            message_data = await database_sync_to_async(self.save_chat_message)(room_id, message_text, recipient_id)
            print(f"💾 Saved message data: {message_data}")
            
            if message_data:
                # Broadcast message to room participants
                await self.broadcast_chat_message(message_data)
                
                # Send confirmation to sender
                await self.send(text_data=json.dumps({
                    'type': 'message_sent',
                    'message': message_data
                }))
                print(f"✅ Message sent and broadcasted")
            else:
                await self.send_error('Failed to send message')
                print(f"❌ Failed to save message")
                
        except Exception as e:
            print(f"❌ Error handling send_message: {e}")
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
            print(f"❌ Error handling typing indicator: {e}")

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
            print(f"❌ Error marking message as read: {e}")
            
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
            print(f"❌ Error getting chat history: {e}")
            await self.send_error('Failed to load chat history')

    async def handle_create_chat_room(self, data):
        """Handle creating a new chat room"""
        if self.is_test_user:
            return
            
        try:
            participant_ids = data.get('participant_ids', [])
            room_name = data.get('room_name', '')
            room_type = data.get('room_type', 'direct')
            
            if not participant_ids:
                await self.send_error('Participants required')
                return
                  # Create chat room
            room_data = await database_sync_to_async(self.create_chat_room)(participant_ids, room_name, room_type)
            
            if room_data:
                # Join the user to the newly created room
                await self.join_chat_room(room_data['id'])
                await self.send(text_data=json.dumps({
                    'type': 'chat_room_created',
                    'room': room_data
                }))
            else:
                await self.send_error('Failed to create chat room')
                
        except Exception as e:
            print(f"❌ Error creating chat room: {e}")
            await self.send_error('Failed to create chat room')    # Database operations for chat
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
            print(f"❌ Error saving chat message: {e}")
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
            print(f"❌ Error getting chat messages: {e}")
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
            print(f"❌ Error creating chat room: {e}")
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
            print(f"❌ Error updating typing status: {e}")
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
            print(f"❌ Error marking message as read: {e}")
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
