#!/usr/bin/env python3
"""
Test script to verify the chat badge system is working correctly.
This script will help verify that:
1. Users appear online
2. Chat functionality works
3. Badge counts increment/decrement properly
4. Messages are delivered correctly
"""

import requests
import json

def test_user_login(username, password):
    """Test user login and get their token"""
    login_url = "http://localhost:8000/api/login/"
    data = {
        "username": username,
        "password": password
    }
    
    try:
        response = requests.post(login_url, json=data)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ {username} login successful")
            print(f"   Token: {result.get('access_token', '')[:50]}...")
            print(f"   User ID: {result.get('user_id')}")
            print(f"   User details: {result.get('user', {})}")
            return result
        else:
            print(f"❌ {username} login failed: {response.text}")
            return None
    except Exception as e:
        print(f"❌ {username} login error: {e}")
        return None

def test_user_online_status():
    """Test if we can check online users"""
    status_url = "http://localhost:8000/api/online_users/"
    
    try:
        response = requests.get(status_url)
        if response.status_code == 200:
            users = response.json()
            print(f"✅ Online users API working")
            print(f"   Online users: {users}")
            return users
        else:
            print(f"❌ Online users API failed: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Online users API error: {e}")
        return None

def main():
    print("🚀 Testing Chat Badge System")
    print("=" * 50)
    
    # Test login for both users
    print("\n1. Testing User Logins:")
    markabram_result = test_user_login("markabram", "password123")
    daniellebishop_result = test_user_login("daniellebishop", "password123")
    
    print("\n2. Testing Online Status:")
    online_users = test_user_online_status()
    
    print("\n3. Badge System Test Instructions:")
    print("Now test the badge system manually:")
    print("1. Open the app in two browser windows/tabs")
    print("2. Login as markabram in first window")
    print("3. Login as daniellebishop in second window")
    print("4. Verify both users appear online")
    print("5. Send a message from one user to another")
    print("6. Check that the chat icon shows a badge with unread count")
    print("7. Open the chat and verify badge clears")
    
    # Test the simulate function in browser console
    print("\n4. Browser Console Test:")
    print("You can also test the badge system using the browser console:")
    print("In the browser console, run:")
    print("window.simulateIncomingMessage('Test message from console')")
    print("This should increment the badge count.")
    
    print("\n✅ Test setup complete!")
    print("Check the frontend application to verify badge functionality.")

if __name__ == "__main__":
    main()
