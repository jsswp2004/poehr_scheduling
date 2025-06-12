#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from communicator.models import MessageLog
from django.utils import timezone
from datetime import timedelta

def check_message_logs():
    # Check if there are any MessageLog entries
    total_logs = MessageLog.objects.count()
    print(f'Total MessageLog entries: {total_logs}')

    # Check for email logs specifically
    email_logs = MessageLog.objects.filter(message_type='email').count()
    print(f'Email MessageLog entries: {email_logs}')

    # Check for recent logs (last 7 days)
    recent_logs = MessageLog.objects.filter(
        created_at__gte=timezone.now() - timedelta(days=7)
    ).count()
    print(f'Recent MessageLog entries (last 7 days): {recent_logs}')

    # Show a few recent entries if they exist
    if total_logs > 0:
        print('\nRecent MessageLog entries:')
        recent = MessageLog.objects.order_by('-created_at')[:5]
        for log in recent:
            print(f'  {log.created_at} - {log.message_type} - {log.status} - {log.recipient}')
    else:
        print('No MessageLog entries found')

    return total_logs > 0

if __name__ == '__main__':
    check_message_logs()
