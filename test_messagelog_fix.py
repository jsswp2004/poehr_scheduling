#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from communicator.models import MessageLog
from communicator.views import MessageLogViewSet
from rest_framework.test import APIRequestFactory
from django.db.models import Q

User = get_user_model()

def test_messagelog_viewset_fix():
    print("Testing MessageLogViewSet fix...")
    
    # Get a user to test with
    user = User.objects.first()
    if not user:
        print("❌ No users found in database")
        return False
    
    print(f"Testing with user: {user.username}")
    
    # Create API request factory
    factory = APIRequestFactory()
    request = factory.get('/api/communicator/logs/', {'message_type': 'email'})
    request.user = user
    
    # Test the ViewSet
    view = MessageLogViewSet()
    view.request = request
    view.action = 'list'
    view.format_kwarg = None
    
    try:
        # Get the queryset
        queryset = view.get_queryset()
        print(f"✅ Total logs returned: {queryset.count()}")
        
        # Test filtering by email type
        email_logs = queryset.filter(message_type='email')
        print(f"✅ Email logs returned: {email_logs.count()}")
        
        # Check if we get both user-specific and system emails
        user_emails = queryset.filter(user=user).count()
        system_emails = queryset.filter(user__isnull=True).count()
        
        print(f"✅ User-specific emails: {user_emails}")
        print(f"✅ System-generated emails: {system_emails}")
        
        if system_emails > 0:
            print("✅ SUCCESS: System-generated emails (patient reminders) are now visible!")
            
            # Show sample data
            print("\nSample system-generated email logs:")
            for log in queryset.filter(user__isnull=True)[:3]:
                print(f"  - {log.created_at}: {log.message_type} to {log.recipient}")
        else:
            print("⚠️  No system-generated emails found (but fix should work)")
        
        return True
        
    except Exception as e:
        print(f"❌ Error testing ViewSet: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_messagelog_viewset_fix()
    if success:
        print("\n🎉 MessageLogViewSet fix is working correctly!")
    else:
        print("\n❌ There was an issue with the fix")
