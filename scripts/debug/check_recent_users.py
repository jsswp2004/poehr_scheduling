#!/usr/bin/env python
"""
Simple test script to check recent users with subscription tiers
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

def check_recent_users():
    print("Checking Recent Users and Their Subscription Tiers")
    print("=" * 60)
    
    # Get the last 5 users
    users = CustomUser.objects.all().order_by('-id')[:5]
    
    if not users:
        print("No users found in the database.")
        return
    
    print(f"Found {users.count()} recent users:")
    print()
    
    for user in users:
        print(f"User: {user.username} ({user.email})")
        print(f"   Name: {user.first_name} {user.last_name}")
        print(f"   Role: {user.role}")
        print(f"   Subscription Tier: {user.subscription_tier}")
        print(f"   Subscription Status: {user.subscription_status}")
        print(f"   Trial Start: {user.trial_start_date}")
        print(f"   Trial End: {user.trial_end_date}")
        print(f"   Registered: {user.registered}")
        print("-" * 40)

if __name__ == "__main__":
    check_recent_users()
