#!/usr/bin/env python
"""
Test script to check existing users and their subscription tiers
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

def check_existing_users():
    print("🔍 Checking Existing Users and Their Subscription Tiers")
    print("=" * 60)
    
    users = CustomUser.objects.all()
    
    if not users:
        print("📭 No users found in the database.")
        return
    
    print(f"👥 Found {users.count()} users:")
    print()
    
    for user in users:
        print(f"👤 User: {user.username} ({user.email})")
        print(f"   Name: {user.first_name} {user.last_name}")
        print(f"   Role: {user.role}")
        print(f"   Subscription Tier: {user.subscription_tier}")
        print(f"   Subscription Status: {user.subscription_status}")
        print(f"   Stripe Customer ID: {user.stripe_customer_id}")
        print(f"   Stripe Subscription ID: {user.stripe_subscription_id}")
        print(f"   Trial Start: {user.trial_start_date}")
        print(f"   Trial End: {user.trial_end_date}")
        print(f"   Registered: {user.registered}")
        print("-" * 40)

if __name__ == "__main__":
    check_existing_users()
