#!/usr/bin/env python3
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, OnlineUser

print("=== Checking Online Status for daniellebishop (ID: 4) ===")

# Check if daniellebishop exists
try:
    user = CustomUser.objects.get(id=4)
    print(f"✅ User found: {user.username} ({user.email})")
    
    # Check online status
    try:
        online_user = OnlineUser.objects.get(user_id=4)
        print(f"📊 Online Status:")
        print(f"   - Is Online: {online_user.is_online}")
        print(f"   - Last Seen: {online_user.last_seen}")
        print(f"   - Updated: {online_user.updated_at}")
    except OnlineUser.DoesNotExist:
        print("❌ No online status record found for daniellebishop")
        print("   This means they haven't connected to WebSocket yet")
        
except CustomUser.DoesNotExist:
    print("❌ User with ID 4 not found")

print("\n=== All Online Users ===")
online_users = OnlineUser.objects.all()
for ou in online_users:
    try:
        user = CustomUser.objects.get(id=ou.user_id)
        status = "🟢 ONLINE" if ou.is_online else "🔴 OFFLINE"
        print(f"{status} | {user.username} (ID: {user.id}) | Last seen: {ou.last_seen}")
    except CustomUser.DoesNotExist:
        print(f"❓ Unknown user ID: {ou.user_id}")
