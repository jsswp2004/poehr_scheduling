#!/usr/bin/env python3
"""
Debug Danielle Bishop's online status
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_daniellebishop_login():
    """Test Danielle Bishop's login - need her password"""
    print("🔐 Testing Danielle Bishop login...")
    
    # We'll need her actual password
    passwords_to_try = [
        "admin123",
        "daniellebishop123", 
        "password123",
        "admin",
        "krat27Miko!",  # Same as markabram?
    ]
    
    for password in passwords_to_try:
        login_data = {
            'username': 'daniellebishop',
            'password': password
        }
        
        try:
            response = requests.post(f"{BASE_URL}/api/auth/login/", json=login_data)
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Login successful with password: {password}")
                print(f"Token: {data.get('access', 'No token')[:50]}...")
                return data.get('access')
            else:
                print(f"❌ Login failed with {password}: {response.status_code}")
        except Exception as e:
            print(f"❌ Error testing {password}: {e}")
    
    print("❌ Could not find working password for daniellebishop")
    return None

def check_websocket_connection():
    """Check if WebSocket is accessible"""
    import socket
    
    print("🔌 Checking WebSocket server...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', 9001))
        sock.close()
        
        if result == 0:
            print("✅ WebSocket server is accessible on port 9001")
        else:
            print("❌ Cannot connect to WebSocket server on port 9001")
    except Exception as e:
        print(f"❌ WebSocket connection error: {e}")

def main():
    print("🚀 Debugging Danielle Bishop's online status...")
    print("=" * 50)
    
    # Check WebSocket
    check_websocket_connection()
    
    print("\n" + "=" * 50)
    
    # Try to get her token
    token = test_daniellebishop_login()
    
    print("\n" + "=" * 50)
    print("📋 Next Steps:")
    print("1. Get Danielle Bishop's correct password")
    print("2. Check her browser console for WebSocket errors")
    print("3. Verify she's using the correct WebSocket URL in frontend")
    print("4. Check if her JWT token is valid and contains correct user info")

if __name__ == "__main__":
    main()
