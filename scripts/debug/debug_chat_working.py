#!/usr/bin/env python
"""
Debug script to verify chat functionality is working
"""
import os
import sys
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import ChatRoom, ChatMessage, CustomUser

def debug_chat_status():
    print("🔍 Chat System Debug Report")
    print("=" * 50)
    
    # Check if chat rooms exist
    rooms = ChatRoom.objects.all()
    print(f"📁 Total Chat Rooms: {rooms.count()}")
    
    for room in rooms:
        print(f"   Room ID: {room.id}")
        print(f"   Name: {room.name}")
        print(f"   Type: {room.room_type}")
        print(f"   Participants: {[str(p) for p in room.participants.all()]}")
        print(f"   Messages: {room.messages.count()}")
        print(f"   Created: {room.created_at}")
        print("   ---")
    
    # Check recent messages
    messages = ChatMessage.objects.all().order_by('-timestamp')[:10]
    print(f"💬 Recent Messages: {messages.count()}")
    
    for msg in messages:
        print(f"   [{msg.timestamp}] {msg.sender.username}: {msg.message[:50]}...")
    
    # Check users who have chat rooms
    users_with_chats = CustomUser.objects.filter(chat_rooms__isnull=False).distinct()
    print(f"👥 Users with chat rooms: {users_with_chats.count()}")
    
    for user in users_with_chats:
        room_count = user.chat_rooms.count()
        print(f"   {user.username} (ID: {user.id}): {room_count} rooms")

if __name__ == '__main__':
    debug_chat_status()
