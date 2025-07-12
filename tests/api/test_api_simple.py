#!/usr/bin/env python
"""
Simple API test script to check user endpoint
"""
import requests
import json

def test_api_directly():
    """Test the API endpoint directly"""
    
    # First, let's try to login and get a token
    login_url = "http://127.0.0.1:8000/api/auth/login/"
    login_data = {
        "username": "jsswp2004",
        "password": "Jamsheed2004!"  # Replace with actual password
    }
    
    print("🔐 Attempting login...")
    try:
        login_response = requests.post(login_url, json=login_data)
        print(f"Login Status: {login_response.status_code}")
        
        if login_response.status_code == 200:
            tokens = login_response.json()
            access_token = tokens.get('access')
            
            if access_token:
                print("✅ Login successful, got token")
                
                # Now test the user endpoint
                headers = {
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json'
                }
                
                # We need to get the user ID from the token first
                import base64
                import json
                
                # Decode the JWT payload (not verifying signature, just reading)
                token_parts = access_token.split('.')
                if len(token_parts) >= 2:
                    payload = token_parts[1]
                    # Add padding if needed
                    payload += '=' * (4 - len(payload) % 4)
                    decoded = base64.b64decode(payload)
                    token_data = json.loads(decoded)
                    user_id = token_data.get('user_id')
                    
                    print(f"🔍 Found user ID: {user_id}")
                    
                    # Test the user endpoint
                    user_url = f"http://127.0.0.1:8000/api/users/{user_id}/"
                    print(f"📡 Testing: {user_url}")
                    
                    user_response = requests.get(user_url, headers=headers)
                    print(f"User API Status: {user_response.status_code}")
                    
                    if user_response.status_code == 200:
                        user_data = user_response.json()
                        print("✅ User API Response:")
                        print(f"   Username: {user_data.get('username')}")
                        print(f"   Organization ID: {user_data.get('organization')}")
                        print(f"   Organization Name: {user_data.get('organization_name')}")
                        print(f"   Organization Logo: {user_data.get('organization_logo')}")
                        
                        # Test the logo URL
                        logo_url = user_data.get('organization_logo')
                        if logo_url:
                            print(f"\n🖼️  Testing logo URL: {logo_url}")
                            logo_response = requests.get(logo_url)
                            print(f"   Logo Status: {logo_response.status_code}")
                            if logo_response.status_code == 200:
                                print(f"   ✅ Logo accessible")
                                print(f"   Content-Type: {logo_response.headers.get('content-type')}")
                            else:
                                print(f"   ❌ Logo not accessible")
                        else:
                            print("   ⚠️  No logo URL in response")
                    else:
                        print(f"❌ User API Error: {user_response.text}")
                        
            else:
                print("❌ No access token in login response")
        else:
            print(f"❌ Login failed: {login_response.text}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == '__main__':
    test_api_directly()
