#!/usr/bin/env python3
"""
Test login flow for daniellebishop user to see what JWT token is generated
"""

import os
import sys
import django
import requests
import json
from datetime import datetime
from jwt import decode as jwt_decode

# Django setup
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser
from rest_framework_simplejwt.tokens import RefreshToken

def test_daniellebishop_jwt():
    """Test JWT token generation for daniellebishop"""
    print("=" * 60)
    print("🔍 TESTING JWT TOKEN GENERATION FOR DANIELLEBISHOP")
    print("=" * 60)
    
    try:
        # Check if user exists
        user = CustomUser.objects.get(username='daniellebishop')
        print(f"✅ User found:")
        print(f"   ID: {user.id}")
        print(f"   Username: {user.username}")
        print(f"   Email: {user.email}")
        print(f"   First Name: {user.first_name}")
        print(f"   Last Name: {user.last_name}")
        print(f"   Role: {user.role}")
        print(f"   Active: {user.is_active}")
        print(f"   Organization: {user.organization}")
        
        # Generate JWT token using the same method as login
        print("\n📋 GENERATING JWT TOKEN...")
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        
        print(f"✅ Token generated successfully")
        print(f"   Token length: {len(access_token)}")
        
        # Decode the token to see what's inside
        print("\n🔓 DECODING TOKEN PAYLOAD...")
        try:
            # We need to decode without verification since we don't have the secret here
            import base64
            import json
            
            # Split the token and decode the payload
            header, payload, signature = access_token.split('.')
            
            # Add padding if needed
            payload += '=' * (4 - len(payload) % 4)
            decoded_payload = json.loads(base64.urlsafe_b64decode(payload))
            
            print("📋 JWT Payload contents:")
            for key, value in decoded_payload.items():
                if key == 'exp':
                    exp_time = datetime.fromtimestamp(value)
                    print(f"   {key}: {value} ({exp_time})")
                else:
                    print(f"   {key}: {value}")
                    
            # Check if required fields are present
            required_fields = ['user_id', 'username', 'first_name', 'last_name', 'role']
            missing_fields = [field for field in required_fields if field not in decoded_payload]
            
            if missing_fields:
                print(f"\n❌ MISSING REQUIRED FIELDS: {missing_fields}")
                return False
            else:
                print(f"\n✅ ALL REQUIRED FIELDS PRESENT")
                
        except Exception as decode_error:
            print(f"❌ Failed to decode token: {decode_error}")
            return False
            
        # Test actual login API endpoint
        print("\n🌐 TESTING LOGIN API ENDPOINT...")
        login_data = {
            'username': 'daniellebishop',
            'password': 'temp123'  # This might need to be updated
        }
        
        try:
            response = requests.post(
                'http://127.0.0.1:8000/api/auth/token/',
                json=login_data,
                headers={'Content-Type': 'application/json'}
            )
            
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                login_response = response.json()
                print("✅ Login successful!")
                print("📋 Response data:")
                for key, value in login_response.items():
                    if key in ['access', 'refresh']:
                        print(f"   {key}: {value[:50]}...")
                    else:
                        print(f"   {key}: {value}")
                        
                # Decode the access token from login
                if 'access' in login_response:
                    login_token = login_response['access']
                    header, payload, signature = login_token.split('.')
                    payload += '=' * (4 - len(payload) % 4)
                    login_decoded = json.loads(base64.urlsafe_b64decode(payload))
                    
                    print("\n📋 LOGIN TOKEN PAYLOAD:")
                    for key, value in login_decoded.items():
                        if key == 'exp':
                            exp_time = datetime.fromtimestamp(value)
                            print(f"   {key}: {value} ({exp_time})")
                        else:
                            print(f"   {key}: {value}")
                            
                    # Check required fields in login token
                    missing_login_fields = [field for field in required_fields if field not in login_decoded]
                    if missing_login_fields:
                        print(f"\n❌ LOGIN TOKEN MISSING FIELDS: {missing_login_fields}")
                    else:
                        print(f"\n✅ LOGIN TOKEN HAS ALL REQUIRED FIELDS")
                        
            else:
                print("❌ Login failed!")
                print(f"Response: {response.text}")
                
        except Exception as api_error:
            print(f"❌ API request failed: {api_error}")
            
        return True
        
    except CustomUser.DoesNotExist:
        print("❌ User 'daniellebishop' does not exist")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    test_daniellebishop_jwt()
