#!/usr/bin/env python
import os
import django
from datetime import datetime, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

def check_online_status():
    """Check current online status of all users"""
    print("=== ONLINE STATUS CHECK ===")
    print(f"Current time: {datetime.now()}")
    print()
    
    # Get all users with their online status
    users = CustomUser.objects.all().order_by('-last_seen')
    
    if not users.exists():
        print("No users found in database")
        return
    
    print(f"Total users: {users.count()}")
    print()
    
    online_users = []
    offline_users = []
    
    for user in users:
        status = "ONLINE" if user.is_online else "OFFLINE"
        last_seen_str = user.last_seen.strftime("%Y-%m-%d %H:%M:%S") if user.last_seen else "Never"
        
        print(f"ID: {user.id:3d} | {user.email:30s} | {status:7s} | Last seen: {last_seen_str}")
        
        if user.is_online:
            online_users.append(user)
        else:
            offline_users.append(user)
    
    print()
    print(f"Online users: {len(online_users)}")
    print(f"Offline users: {len(offline_users)}")
    
    # Check for recently active users (last 5 minutes)
    recent_threshold = datetime.now() - timedelta(minutes=5)
    recent_users = users.filter(last_seen__gte=recent_threshold)
    
    print(f"Recently active (last 5 min): {recent_users.count()}")
    
    if recent_users.exists():
        print("Recent users:")
        for user in recent_users:
            status = "ONLINE" if user.is_online else "OFFLINE"
            last_seen_str = user.last_seen.strftime("%Y-%m-%d %H:%M:%S")
            print(f"  - {user.email} ({status}) - {last_seen_str}")

if __name__ == "__main__":
    check_online_status()
