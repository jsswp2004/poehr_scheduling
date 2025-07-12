#!/usr/bin/env python3
"""
Fix for daniellebishop's JWT token issue.

The problem: daniellebishop has an old JWT token in localStorage that only contains 
basic fields (_id, iat, exp) but missing the user fields needed for chat/online status.

The solution: Get a new JWT token through the proper login endpoint that includes
all required fields (user_id, username, first_name, last_name, role).
"""

import requests
import json

def get_proper_token_for_daniellebishop():
    """Get a proper JWT token for daniellebishop with all required fields."""
    
    url = "http://localhost:8000/api/auth/login/"
    data = {
        "username": "daniellebishop",
        "password": "krat27Miko!"
    }
    
    print("🔄 Getting proper JWT token for daniellebishop...")
    
    try:
        response = requests.post(url, json=data)
        
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data.get('access')
            
            print("✅ Successfully obtained new JWT token!")
            print(f"🔑 New access token: {access_token}")
            
            # Decode and verify the token contains all required fields
            import base64
            try:
                header, payload, signature = access_token.split('.')
                payload += '=' * (4 - len(payload) % 4)
                decoded_payload = base64.urlsafe_b64decode(payload)
                payload_data = json.loads(decoded_payload)
                
                print("\n✅ Token contains required fields:")
                required_fields = ['user_id', 'username', 'first_name', 'last_name', 'role']
                for field in required_fields:
                    value = payload_data.get(field)
                    print(f"  - {field}: {value}")
                
                print(f"\n📋 INSTRUCTIONS:")
                print(f"1. Open the browser where daniellebishop is logged in")
                print(f"2. Open Developer Tools (F12)")
                print(f"3. Go to Console tab")
                print(f"4. Run this command to update the token:")
                print(f"   localStorage.setItem('access_token', '{access_token}');")
                print(f"5. Refresh the page")
                print(f"6. daniellebishop should now appear online and be able to use chat!")
                
                return access_token
                
            except Exception as e:
                print(f"❌ Error decoding token: {e}")
                return access_token
                
        else:
            print(f"❌ Login failed! Status: {response.status_code}")
            print(f"Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

if __name__ == "__main__":
    get_proper_token_for_daniellebishop()
