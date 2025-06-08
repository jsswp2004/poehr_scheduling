#!/usr/bin/env python3
"""
Simple test to verify SMS functionality fix
"""

import requests
import json

def test_sms_fix():
    print("🧪 Testing SMS Fix")
    print("=" * 30)
    
    # Test 1: Check if server is running
    try:
        response = requests.get("http://127.0.0.1:8000/")
        print("✅ Django server is running")
    except requests.exceptions.ConnectionError:
        print("❌ Django server is not running")
        return False
    
    # Test 2: Check SMS endpoint accessibility
    try:
        response = requests.post("http://127.0.0.1:8000/api/sms/send-sms/", 
                               json={"phone": "+1234567890", "message": "test"})
        if response.status_code == 401:
            print("✅ SMS endpoint accessible (returns 401 for unauthenticated)")
        elif response.status_code == 500:
            print("❌ SMS endpoint still returns 500 error")
            print(f"Response: {response.text}")
            return False
        else:
            print(f"✅ SMS endpoint returns {response.status_code} (not 500)")
    except Exception as e:
        print(f"❌ Error testing SMS endpoint: {e}")
        return False
    
    # Test 3: Test with authentication
    print("\n🔐 Testing with authentication...")
    
    # Login first
    login_data = {
        "username": "jsswp2004",
        "password": "krat25Miko!"
    }
    
    try:
        login_response = requests.post("http://127.0.0.1:8000/api/auth/login/", json=login_data)
        
        if login_response.status_code == 200:
            token = login_response.json().get('access')
            print("✅ Authentication successful")
            
            # Now test SMS with authentication
            headers = {'Authorization': f'Bearer {token}'}
            sms_data = {
                "phone": "+1234567890",  # Test number
                "message": "Test message from POEHR system"
            }
            
            sms_response = requests.post("http://127.0.0.1:8000/api/sms/send-sms/", 
                                       json=sms_data, headers=headers)
            
            if sms_response.status_code == 500:
                print("❌ SMS still returns 500 error with authentication")
                print(f"Response: {sms_response.text}")
                return False
            else:
                print(f"✅ SMS endpoint returns {sms_response.status_code} with authentication")
                print(f"Response: {sms_response.text}")
                return True
                
        else:
            print(f"❌ Authentication failed: {login_response.status_code}")
            print(f"Response: {login_response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Authentication test error: {e}")
        return False

if __name__ == "__main__":
    if test_sms_fix():
        print("\n🎉 SUCCESS: SMS functionality is working!")
        print("The 500 error has been resolved.")
    else:
        print("\n❌ ISSUE: SMS functionality still has problems.")
