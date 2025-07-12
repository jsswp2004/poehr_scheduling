#!/usr/bin/env python
import requests
import json
from django.conf import settings
import os
import sys

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling.settings')

import django
django.setup()

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()

def test_user_api():
    """Test the user API endpoint that frontend should be using"""
    
    # Get a test user
    try:
        user = User.objects.filter(username='jsswp2004').first()
        if not user:
            print("❌ User 'jsswp2004' not found")
            return
        
        print(f"✅ Found user: {user.username}")
        print(f"   Organization: {user.organization}")
        print(f"   Organization name: {getattr(user.organization, 'name', 'N/A') if user.organization else 'N/A'}")
        print(f"   Organization logo: {getattr(user.organization, 'logo', 'N/A') if user.organization else 'N/A'}")
        
        # Generate a token for this user
        access_token = AccessToken.for_user(user)
        token_str = str(access_token)
        
        print(f"\n🔑 Generated token: {token_str[:50]}...")
        
        # Test the API endpoint
        headers = {
            'Authorization': f'Bearer {token_str}',
            'Content-Type': 'application/json'
        }
        
        url = f'http://127.0.0.1:8000/api/users/{user.id}/'
        print(f"\n📡 Testing API: {url}")
        
        try:
            response = requests.get(url, headers=headers)
            
            print(f"   Status Code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ API Response:")
                print(f"      - Username: {data.get('username')}")
                print(f"      - Organization ID: {data.get('organization')}")
                print(f"      - Organization Name: {data.get('organization_name')}")
                print(f"      - Organization Logo: {data.get('organization_logo')}")
                
                # Test the logo URL if it exists
                logo_url = data.get('organization_logo')
                if logo_url:
                    print(f"\n🖼️  Testing logo URL: {logo_url}")
                    try:
                        logo_response = requests.get(logo_url)
                        print(f"   Logo Status Code: {logo_response.status_code}")
                        if logo_response.status_code == 200:
                            print(f"   ✅ Logo is accessible")
                            print(f"   Content-Type: {logo_response.headers.get('content-type', 'unknown')}")
                        else:
                            print(f"   ❌ Logo not accessible")
                    except Exception as e:
                        print(f"   ❌ Error accessing logo: {e}")
                else:
                    print(f"   ⚠️  No logo URL in response")
                    
            else:
                print(f"   ❌ API Error: {response.text}")
                
        except Exception as e:
            print(f"   ❌ Request failed: {e}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == '__main__':
    test_user_api()
