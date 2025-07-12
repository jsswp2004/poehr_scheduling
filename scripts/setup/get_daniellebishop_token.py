#!/usr/bin/env python3
"""
Get Danielle Bishop's complete token info
"""
import requests
import json

def get_daniellebishop_token():
    login_data = {
        'username': 'daniellebishop',
        'password': 'krat27Miko!'
    }
    
    response = requests.post("http://localhost:8000/api/auth/login/", json=login_data)
    if response.status_code == 200:
        data = response.json()
        print("✅ Danielle Bishop Login Successful!")
        print("=" * 60)
        print(f"Full response: {json.dumps(data, indent=2)}")
        
        # Decode the token
        token = data.get('access')
        if token:
            import base64
            try:
                parts = token.split('.')
                payload = base64.b64decode(parts[1] + '===')
                decoded = json.loads(payload)
                print("\n" + "=" * 60)
                print("🔍 Decoded Token Info:")
                print(json.dumps(decoded, indent=2))
                
                print("\n" + "=" * 60)
                print("🌐 Browser Console Commands for Danielle:")
                print(f"localStorage.setItem('authToken', '{token}');")
                print(f"localStorage.setItem('access_token', '{token}');")
                print("window.location.reload();")
                
            except Exception as e:
                print(f"Error decoding token: {e}")
        
        return data
    else:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return None

if __name__ == "__main__":
    get_daniellebishop_token()
