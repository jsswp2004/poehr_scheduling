#!/usr/bin/env python
import os
import django
import requests
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

User = get_user_model()

def test_message_logs_api():
    print("Testing Message Logs API endpoint...")
    
    # Get a user and create/get token
    user = User.objects.first()
    if not user:
        print("❌ No users found")
        return
    
    token, created = Token.objects.get_or_create(user=user)
    print(f"Testing with user: {user.username}")
    
    # Test the API endpoint
    url = "http://127.0.0.1:8000/api/communicator/logs/"
    headers = {
        'Authorization': f'Bearer {token.key}',
        'Content-Type': 'application/json'
    }
    
    try:
        # Test basic endpoint
        response = requests.get(url, headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Total logs returned: {len(data)}")
            
            # Test filtering by email type
            email_url = f"{url}?message_type=email"
            email_response = requests.get(email_url, headers=headers, timeout=10)
            
            if email_response.status_code == 200:
                email_data = email_response.json()
                print(f"✅ Email logs returned: {len(email_data)}")
                
                # Show sample data
                if email_data:
                    print("\\nSample email logs:")
                    for i, log in enumerate(email_data[:3]):
                        print(f"  {i+1}. {log.get('created_at', 'No date')} - {log.get('recipient', 'No recipient')} - {log.get('subject', 'No subject')}")
                    
                    print("\\n✅ SUCCESS: Email logs are visible!")
                    return True
                else:
                    print("⚠️  No email logs returned (but API is working)")
                    return True
            else:
                print(f"❌ Email filter failed: {email_response.status_code}")
                print(email_response.text)
        else:
            print(f"❌ API request failed: {response.status_code}")
            print(response.text)
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to Django server. Make sure it's running on port 8000")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return False

if __name__ == '__main__':
    success = test_message_logs_api()
    if success:
        print("\\n🎉 API is working! The frontend should now display message logs.")
    else:
        print("\\n❌ API test failed - need to investigate further.")
