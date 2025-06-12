#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.test import RequestFactory, TestCase
from django.contrib.auth.models import User
from communicator.views import MessageLogViewSet
from rest_framework.test import APIRequestFactory
from rest_framework.response import Response
import json

def test_messagelog_api():
    # Create API request factory
    factory = APIRequestFactory()
    
    # Create a test user
    user = User.objects.first()
    if not user:
        user = User.objects.create_user('testuser', 'test@example.com', 'pass')
    
    # Test the API endpoint
    print("Testing MessageLog API endpoint...")
    
    # Test 1: Get all logs
    request = factory.get('/api/communicator/logs/')
    request.user = user
    
    view = MessageLogViewSet()
    view.action = 'list'
    view.request = request
    view.format_kwarg = None
    
    try:
        queryset = view.get_queryset()
        print(f"Total logs in queryset: {queryset.count()}")
        
        # Test 2: Filter by email type
        request_email = factory.get('/api/communicator/logs/', {'message_type': 'email'})
        request_email.user = user
        view.request = request_email
        
        filtered_queryset = view.filter_queryset(view.get_queryset())
        print(f"Email logs in filtered queryset: {filtered_queryset.count()}")
        
        # Test 3: Check serialization
        if filtered_queryset.exists():
            print("\nSample log data:")
            sample_log = filtered_queryset.first()
            print(f"  ID: {sample_log.id}")
            print(f"  Created: {sample_log.created_at}")
            print(f"  Type: {sample_log.message_type}")
            print(f"  Status: {sample_log.status}")
            print(f"  Recipient: {sample_log.recipient}")
            print(f"  Subject: {sample_log.subject}")
        
    except Exception as e:
        print(f"Error testing API: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_messagelog_api()
