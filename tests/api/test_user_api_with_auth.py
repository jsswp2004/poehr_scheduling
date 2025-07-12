#!/usr/bin/env python3
"""
Test user API endpoint with jsswp2004 credentials to check organization data
"""
import requests
import json

def test_user_api():
    # First, get a token by logging in
    login_url = "http://127.0.0.1:8000/api/auth/login/"
    login_data = {
        "username": "jsswp2004",
        "password": "krat25Miko!"
    }
    
    try:
        # Login to get token
        print("Logging in...")
        login_response = requests.post(login_url, json=login_data)
        print(f"Login Status Code: {login_response.status_code}")
        
        if login_response.status_code == 200:
            token_data = login_response.json()
            print("Login successful!")
            print(f"Token data: {json.dumps(token_data, indent=2)}")
            
            access_token = token_data.get('access')
            if access_token:
                # Decode token to get user ID (we'll just look at the response)
                # For now, let's try getting the current user info
                user_url = "http://127.0.0.1:8000/api/users/me/"  # Try 'me' endpoint first
                headers = {"Authorization": f"Bearer {access_token}"}
                
                user_response = requests.get(user_url, headers=headers)
                print(f"\nUser 'me' endpoint Status Code: {user_response.status_code}")
                
                if user_response.status_code == 404:
                    # If 'me' doesn't work, we need to find the user ID another way
                    # Let's try looking at the JWT payload
                    import base64
                    import json as json_lib
                    
                    # Decode JWT payload (without verification for debugging)
                    token_parts = access_token.split('.')
                    if len(token_parts) >= 2:
                        payload = token_parts[1]
                        # Add padding if needed
                        payload += '=' * (4 - len(payload) % 4)
                        decoded_payload = base64.b64decode(payload)
                        payload_data = json_lib.loads(decoded_payload)
                        print(f"\nJWT Payload: {json.dumps(payload_data, indent=2)}")
                        
                        user_id = payload_data.get('user_id')
                        if user_id:
                            # Try with specific user ID
                            user_url = f"http://127.0.0.1:8000/api/users/{user_id}/"
                            user_response = requests.get(user_url, headers=headers)
                            print(f"\nUser {user_id} endpoint Status Code: {user_response.status_code}")
                
                if user_response.status_code == 200:
                    user_data = user_response.json()
                    print(f"\nUser data: {json.dumps(user_data, indent=2)}")
                    
                    # Check for organization fields
                    org_logo = user_data.get('organization_logo')
                    org_name = user_data.get('organization_name')
                    org_id = user_data.get('organization')
                    
                    print(f"\n--- Organization Data ---")
                    print(f"Organization ID: {org_id}")
                    print(f"Organization Name: {org_name}")
                    print(f"Organization Logo: {org_logo}")
                    
                    if org_logo:
                        print(f"\nTesting logo URL: {org_logo}")
                        logo_response = requests.get(org_logo)
                        print(f"Logo URL Status: {logo_response.status_code}")
                else:
                    print(f"Failed to get user data: {user_response.text}")
            else:
                print("No access token in response")
        else:
            print(f"Login failed: {login_response.text}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    test_user_api()
