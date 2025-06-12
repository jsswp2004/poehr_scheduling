#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from communicator.models import MessageLog
from django.contrib.auth import get_user_model

User = get_user_model()

def check_user_associations():
    print("Checking MessageLog user associations...")
    
    # Get all users
    users = User.objects.all()
    print(f"Total users in system: {users.count()}")
    
    # Check MessageLog entries and their user associations
    logs = MessageLog.objects.all()
    print(f"Total MessageLog entries: {logs.count()}")
    
    # Check which users have logs
    for user in users:
        user_logs = MessageLog.objects.filter(user=user).count()
        print(f"  User '{user.username}' ({user.email}): {user_logs} logs")
    
    # Check logs without user association
    logs_without_user = MessageLog.objects.filter(user__isnull=True).count()
    print(f"Logs without user association: {logs_without_user}")
    
    # Show sample log details
    print("\nSample MessageLog entries:")
    for log in MessageLog.objects.order_by('-created_at')[:3]:
        print(f"  ID: {log.id}")
        print(f"  User: {log.user}")
        print(f"  Recipient: {log.recipient}")
        print(f"  Type: {log.message_type}")
        print(f"  Created: {log.created_at}")
        print("  ---")

if __name__ == '__main__':
    check_user_associations()
