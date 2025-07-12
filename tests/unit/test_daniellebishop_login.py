#!/usr/bin/env python3
import requests
import json

# Test login for daniellebishop
url = "http://localhost:8000/api/auth/login/"
data = {
    "username": "daniellebishop",
    "password": "krat27Miko!"
}

print("Testing login for daniellebishop...")
print(f"URL: {url}")
print(f"Data: {data}")

try:
    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        token_data = response.json()
        print("✅ Login successful!")
        print("Response data:")
        print(json.dumps(token_data, indent=2))
        
        # Try to decode the access token to see its contents
        access_token = token_data.get('access')
        if access_token:
            print(f"\n🔍 Access token (first 50 chars): {access_token[:50]}...")
            
            # Let's decode it
            import base64
            try:
                # JWT tokens have 3 parts separated by dots
                header, payload, signature = access_token.split('.')
                
                # Add padding if needed
                payload += '=' * (4 - len(payload) % 4)
                
                # Decode the payload
                decoded_payload = base64.urlsafe_b64decode(payload)
                payload_data = json.loads(decoded_payload)
                
                print("\n🔍 JWT Token Payload:")
                print(json.dumps(payload_data, indent=2))
                
            except Exception as e:
                print(f"❌ Error decoding token: {e}")
    else:
        print("❌ Login failed!")
        print(f"Response: {response.text}")
        
except Exception as e:
    print(f"❌ Error making request: {e}")
