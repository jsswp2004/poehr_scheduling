#!/usr/bin/env python
"""
Test to verify MessageLog API is working correctly
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from communicator.views import MessageLogViewSet
from communicator.models import MessageLog
from rest_framework.test import force_authenticate

User = get_user_model()

def test_messagelog_api():
    print("Testing MessageLog API backend...")
    
    # Get a user
    user = User.objects.first()
    if not user:
        print("❌ No users found")
        return
    
    print(f"Testing with user: {user.username}")
    
    # Create request factory
    factory = RequestFactory()
    
    # Test the viewset directly
    request = factory.get('/api/communicator/logs/', {'message_type': 'email'})
    force_authenticate(request, user=user)
    
    view = MessageLogViewSet.as_view({'get': 'list'})
    response = view(request)
    
    print(f"Response status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.data
        print(f"✅ API returns {len(data)} logs")
        
        if data:
            print("\\nSample log:")
            sample = data[0]
            print(f"  ID: {sample.get('id')}")
            print(f"  Recipient: {sample.get('recipient')}")
            print(f"  Subject: {sample.get('subject')}")
            print(f"  Created: {sample.get('created_at')}")
            print(f"  Type: {sample.get('message_type')}")
            
            print("\\n✅ API is working correctly!")
            return True
        else:
            print("⚠️  API works but returns no data")
            
            # Debug: check what's in the database
            total_logs = MessageLog.objects.count()
            email_logs = MessageLog.objects.filter(message_type='email').count()
            print(f"Debug: Total logs in DB: {total_logs}")
            print(f"Debug: Email logs in DB: {email_logs}")
            
            return False
    else:
        print(f"❌ API failed with status {response.status_code}")
        return False

if __name__ == '__main__':
    test_messagelog_api()
