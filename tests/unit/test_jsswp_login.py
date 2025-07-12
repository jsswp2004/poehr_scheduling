#!/usr/bin/env python3
"""
Test script to verify jsswp2004 login and organization logo retrieval
"""
import requests
import json
from jwt import decode as jwt_decode
import base64

# Django server URL
BASE_URL = "http://127.0.0.1:8000"

def test_jsswp_login():
    print("Testing jsswp2004 login and organization logo retrieval...")
    
    # Login credentials
    username = "jsswp2004"
    password = "krat25Miko!"
    
    # 1. Login to get token
    print(f"\n1. Attempting login with username: {username}")
    login_data = {
        "username": username,
        "password": password
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/auth/login/", json=login_data)
        print(f"Login response status: {response.status_code}")
        
        if response.status_code == 200:
            login_result = response.json()
            print("Login successful!")
            print(f"Access token exists: {bool(login_result.get('access'))}")
            
            access_token = login_result.get('access')
            
            # 2. Decode token to get user info
            print(f"\n2. Decoding access token...")
            try:
                # JWT tokens have 3 parts separated by dots
                # We need the payload (middle part)
                parts = access_token.split('.')
                if len(parts) != 3:
                    print("Invalid JWT token format")
                    return
                    
                # Add padding if needed for base64 decoding
                payload = parts[1]
                payload += '=' * (4 - len(payload) % 4)
                
                decoded_payload = base64.b64decode(payload)
                token_data = json.loads(decoded_payload)
                
                print("Token decoded successfully!")
                print(f"User ID: {token_data.get('user_id')}")
                print(f"Username: {token_data.get('username')}")
                print(f"Organization ID: {token_data.get('organization_id', 'Not in token')}")
                
                user_id = token_data.get('user_id')
                
                # 3. Fetch user details with organization info
                if user_id:
                    print(f"\n3. Fetching user details for user ID: {user_id}")
                    headers = {
                        'Authorization': f'Bearer {access_token}',
                        'Content-Type': 'application/json'
                    }
                    
                    user_response = requests.get(f"{BASE_URL}/api/users/{user_id}/", headers=headers)
                    print(f"User API response status: {user_response.status_code}")
                    
                    if user_response.status_code == 200:
                        user_data = user_response.json()
                        print("User data retrieved successfully!")
                        print(f"Organization: {user_data.get('organization')}")
                        print(f"Organization Name: {user_data.get('organization_name')}")
                        print(f"Organization Logo: {user_data.get('organization_logo')}")
                        
                        # 4. Test logo URL if available
                        logo_url = user_data.get('organization_logo')
                        if logo_url:
                            print(f"\n4. Testing organization logo URL: {logo_url}")
                            
                            # Check if it's a relative URL and convert to full URL
                            if logo_url.startswith('/'):
                                full_logo_url = f"{BASE_URL}{logo_url}"
                            else:
                                full_logo_url = logo_url
                                
                            print(f"Full logo URL: {full_logo_url}")
                            
                            try:
                                logo_response = requests.get(full_logo_url)
                                print(f"Logo URL response status: {logo_response.status_code}")
                                print(f"Logo content type: {logo_response.headers.get('content-type', 'Unknown')}")
                                print(f"Logo content length: {len(logo_response.content)} bytes")
                                
                                if logo_response.status_code == 200:
                                    print("✅ Logo is accessible!")
                                else:
                                    print("❌ Logo is not accessible")
                            except Exception as e:
                                print(f"Error testing logo URL: {e}")
                        else:
                            print("\n4. No organization logo found in user data")
                            
                    else:
                        print(f"Failed to fetch user data: {user_response.text}")
                        
            except Exception as e:
                print(f"Error decoding token: {e}")
                
        else:
            print(f"Login failed: {response.text}")
            
    except Exception as e:
        print(f"Error during login test: {e}")

if __name__ == "__main__":
    test_jsswp_login()
