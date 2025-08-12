#!/usr/bin/env python3
"""
Test script for offline message delivery system
This script tests the new API endpoints for chat offline messages
"""

import os
import sys
import django
import requests
from datetime import datetime

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling.settings")
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from users.models import ChatRoom, ChatMessage

User = get_user_model()


def test_offline_message_apis():
    """Test the offline message API endpoints"""
    print("🧪 Testing Offline Message API Endpoints")
    print("=" * 50)

    # Get test users
    admin_user = User.objects.filter(role="admin").first()
    registrar_user = User.objects.filter(role="registrar").first()

    if not admin_user or not registrar_user:
        print("❌ Need admin and registrar users for testing")
        print("Available users:")
        for user in User.objects.all()[:5]:
            print(f"  - {user.username} ({user.role})")
        return

    print(f"👤 Admin User: {admin_user.username} (ID: {admin_user.id})")
    print(f"👤 Registrar User: {registrar_user.username} (ID: {registrar_user.id})")

    # Get or create tokens
    admin_token, _ = Token.objects.get_or_create(user=admin_user)
    registrar_token, _ = Token.objects.get_or_create(user=registrar_user)

    print(f"🔑 Admin Token: {admin_token.key[:20]}...")
    print(f"🔑 Registrar Token: {registrar_token.key[:20]}...")

    # Create a test chat room and message
    room, created = ChatRoom.objects.get_or_create(
        name=f"Test Room {admin_user.username}-{registrar_user.username}",
        defaults={"room_type": "direct"},
    )

    if created:
        room.participants.add(admin_user, registrar_user)
        print(f"🏠 Created test room: {room.name}")
    else:
        print(f"🏠 Using existing room: {room.name}")

    # Create an unread message from admin to registrar
    test_message = ChatMessage.objects.create(
        room=room,
        sender=admin_user,
        recipient=registrar_user,
        message="🧪 Test offline message - Admin to Registrar",
        is_read=False,
    )

    print(f"💬 Created test message: ID {test_message.id}")

    # Test API endpoints
    base_url = "http://127.0.0.1:8000/api/users"

    # Test 1: Get unread messages for registrar
    print("\n📥 Testing GET unread messages...")
    headers = {"Authorization": f"Bearer {registrar_token.key}"}

    try:
        response = requests.get(
            f"{base_url}/unread-messages/", headers=headers, timeout=10
        )
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Found {data['count']} unread messages")
            if data["unread_messages"]:
                for msg in data["unread_messages"]:
                    print(f"  📨 From {msg['sender_name']}: {msg['content']}")
        else:
            print(f"❌ Error: {response.text}")
    except Exception as e:
        print(f"❌ Request failed: {e}")

    # Test 2: Mark messages as read
    print("\n✅ Testing mark messages as read...")
    try:
        response = requests.post(
            f"{base_url}/mark-messages-read/",
            headers=headers,
            json={"message_ids": [test_message.id]},
            timeout=10,
        )
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(
                f"✅ {data['message']} - Marked {data['marked_read']} messages as read"
            )
        else:
            print(f"❌ Error: {response.text}")
    except Exception as e:
        print(f"❌ Request failed: {e}")

    # Test 3: Get chat rooms with unread counts
    print("\n🏠 Testing GET chat rooms with unread counts...")
    try:
        response = requests.get(f"{base_url}/chat-rooms/", headers=headers, timeout=10)
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Found {len(data['chat_rooms'])} chat rooms")
            print(f"📊 Total unread: {data['total_unread']}")
            for room_data in data["chat_rooms"]:
                print(f"  🏠 {room_data['name']}: {room_data['unread_count']} unread")
        else:
            print(f"❌ Error: {response.text}")
    except Exception as e:
        print(f"❌ Request failed: {e}")

    # Cleanup
    print("\n🧹 Cleaning up test data...")
    test_message.delete()
    print("✅ Test complete!")


if __name__ == "__main__":
    try:
        test_offline_message_apis()
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback

        traceback.print_exc()
