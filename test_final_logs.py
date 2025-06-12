#!/usr/bin/env python
"""
Final test to verify the message logs are now visible
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token

User = get_user_model()

def test_final_message_logs():
    print("🧪 FINAL TEST: Message Logs Visibility")
    print("=" * 50)
    
    # Get a user and token
    user = User.objects.first()
    if not user:
        print("❌ No users found")
        return False
    
    token, created = Token.objects.get_or_create(user=user)
    print(f"Testing with user: {user.username}")
    
    # Create API client
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')
    
    # Test the API endpoint
    print("\\n1️⃣ Testing API endpoint...")
    response = client.get('/api/communicator/logs/')
    
    if response.status_code == 200:
        all_logs = response.data
        print(f"   ✅ All logs: {len(all_logs)} returned")
        
        # Test email filter
        email_response = client.get('/api/communicator/logs/?message_type=email')
        if email_response.status_code == 200:
            email_logs = email_response.data
            print(f"   ✅ Email logs: {len(email_logs)} returned")
            
            if email_logs:
                print("\\n2️⃣ Sample email log:")
                sample = email_logs[0]
                print(f"   📧 Recipient: {sample.get('recipient')}")
                print(f"   📅 Date: {sample.get('created_at')}")
                print(f"   📝 Subject: {sample.get('subject')}")
                
                print("\\n✅ SUCCESS: Message logs are now visible!")
                print("\\n📋 What was fixed:")
                print("   • MessageLogViewSet now includes system-generated emails")
                print("   • Frontend MessageLogTable has been added to MessagesPage")
                print("   • New tabs: 'Email Logs' and 'SMS Logs' are available")
                
                return True
            else:
                print("   ⚠️  No email logs returned")
        else:
            print(f"   ❌ Email filter failed: {email_response.status_code}")
    else:
        print(f"   ❌ API failed: {response.status_code}")
        print(f"   Response: {response.data}")
    
    return False

if __name__ == '__main__':
    success = test_final_message_logs()
    
    if success:
        print("\\n🎉 COMPLETE! The message logs table should now be displaying.")
        print("\\n🚀 To see the logs:")
        print("   1. Go to the Messages page")
        print("   2. Click on 'Email Logs' or 'SMS Logs' tab")
        print("   3. You should see the patient reminder emails and other system emails")
    else:
        print("\\n❌ There's still an issue that needs investigation.")
