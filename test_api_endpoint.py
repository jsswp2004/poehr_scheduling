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

def test_api_endpoint():
    print("Testing MessageLog API endpoint...")
    
    # Get a user and create token
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
        response = requests.get(url, headers=headers, timeout=5)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Total logs returned: {len(data)}")
            
            # Test filtering by email type
            email_url = f"{url}?message_type=email"
            email_response = requests.get(email_url, headers=headers, timeout=5)
            
            if email_response.status_code == 200:
                email_data = email_response.json()
                print(f"✅ Email logs returned: {len(email_data)}")
                
                # Show sample data
                if email_data:
                    print("\nSample email logs:")
                    for log in email_data[:3]:
                        print(f"  - {log.get('created_at')}: to {log.get('recipient')}")
                    print("✅ SUCCESS: Email logs are now visible in the API!")
                else:
                    print("⚠️  No email logs returned")
            else:
                print(f"❌ Email filter failed: {email_response.status_code}")
        else:
            print(f"❌ API request failed: {response.status_code}")
            print(response.text)
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to Django server. Make sure it's running on port 8000")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == '__main__':
    test_api_endpoint()
