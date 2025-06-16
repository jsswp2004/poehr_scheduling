#!/usr/bin/env python3
"""
Test badge functionality with correct credentials
"""
import requests
import json

# Test credentials
USERNAME = "markabram"
PASSWORD = "krat27Miko!"
BASE_URL = "http://localhost:8000"

def test_login():
    """Test login functionality"""
    print("🔐 Testing login...")
    
    login_data = {
        'username': USERNAME,
        'password': PASSWORD
    }
    
    try:        response = requests.post(f"{BASE_URL}/api/auth/login/", json=login_data)
        print(f"Login response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Login successful!")
            print(f"Full response: {json.dumps(data, indent=2)}")
            
            # Check different possible token field names
            token = data.get('access_token') or data.get('token') or data.get('access')
            if token:
                print(f"Token: {token[:50]}...")
            else:
                print("❌ No token found in response")
                
            print(f"User info: {data.get('user', {})}")
            return token
        else:
            print(f"❌ Login failed: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_user_endpoints(token):
    """Test user-related endpoints"""
    if not token:
        print("❌ No token available for user endpoint tests")
        return
        
    headers = {'Authorization': f'Bearer {token}'}
    
    # Test various endpoints to see what's available
    endpoints = [
        '/api/users/',
        '/api/users/me/',
        '/api/users/online/',
        '/api/chat/',
        '/api/auth/user/',
    ]
    
    for endpoint in endpoints:
        try:
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
            print(f"📡 {endpoint}: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    print(f"   First item: {data[0]}")
                elif isinstance(data, dict):
                    print(f"   Data keys: {list(data.keys())}")
            elif response.status_code != 404:
                print(f"   Error: {response.text[:100]}")
        except Exception as e:
            print(f"   Exception: {e}")

def main():
    print("🚀 Testing badge functionality...")
    print("=" * 50)
    
    # Test login
    token = test_login()
    
    if token:
        print("\n" + "=" * 50)
        print("🔍 Testing API endpoints...")
        test_user_endpoints(token)
    
    print("\n" + "=" * 50)
    print("✅ Test completed!")

if __name__ == "__main__":
    main()
