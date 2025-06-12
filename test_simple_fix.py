#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from communicator.models import MessageLog
from django.db.models import Q

User = get_user_model()

def test_fix():
    print("Testing email logs visibility fix...")
    
    # Get a test user
    user = User.objects.first()
    print(f"Testing with user: {user.username}")
    
    # Test old query (what was broken)
    old_query = MessageLog.objects.filter(user=user)
    print(f"Old query (user-specific only): {old_query.count()} results")
    
    # Test new query (what should work)
    new_query = MessageLog.objects.filter(Q(user=user) | Q(user__isnull=True))
    print(f"New query (user + system emails): {new_query.count()} results")
    
    # Show the improvement
    system_emails = MessageLog.objects.filter(user__isnull=True).count()
    print(f"System-generated emails now visible: {system_emails}")
    
    if new_query.count() > old_query.count():
        print("✅ SUCCESS: More emails are visible with the fix!")
    else:
        print("⚠️  No improvement detected")

if __name__ == '__main__':
    test_fix()
