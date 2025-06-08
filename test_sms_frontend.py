#!/usr/bin/env python3
"""
Test SMS API endpoint from frontend perspective
This simulates the exact request that PatientsPage.js would make
"""

import requests
import json
import sys

def test_sms_api():
    """Test the SMS API endpoint with authentication"""
    
    # First, get an authentication token
    login_url = "http://127.0.0.1:8000/api/auth/login/"
    login_data = {
        "username": "admin",  # Replace with actual username
        "password": "admin123"  # Replace with actual password
    }
    
    print("🔐 Getting authentication token...")
    try:
        login_response = requests.post(login_url, json=login_data)
        if login_response.status_code != 200:
            print(f"❌ Login failed: {login_response.status_code}")
            print(f"❌ Response: {login_response.text}")
            return False
            
        token = login_response.json().get('access')
        if not token:
            print("❌ No access token in login response")
            return False
            
        print("✅ Authentication successful")
        
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to Django server. Is it running on http://127.0.0.1:8000?")
        return False
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False
    
    # Now test the SMS API endpoint
    sms_url = "http://127.0.0.1:8000/api/sms/send-sms/"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Test data (same format as frontend)
    sms_data = {
        "phone": "+1234567890",  # Test phone number
        "message": "Hello Test, this is a reminder from your provider."
    }
    
    print("📱 Testing SMS API endpoint...")
    print(f"   URL: {sms_url}")
    print(f"   Data: {sms_data}")
    
    try:
        response = requests.post(sms_url, json=sms_data, headers=headers)
        
        print(f"📊 Response Status: {response.status_code}")
        print(f"📊 Response Headers: {dict(response.headers)}")
        
        try:
            response_json = response.json()
            print(f"📊 Response Body: {json.dumps(response_json, indent=2)}")
        except:
            print(f"📊 Response Text: {response.text}")
        
        if response.status_code == 200:
            print("✅ SMS API endpoint working correctly!")
            return True
        else:
            print(f"❌ SMS API failed with status {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to SMS endpoint. Check if Django server is running.")
        return False
    except Exception as e:
        print(f"❌ SMS API error: {e}")
        return False

def check_server_status():
    """Check if Django server is running"""
    try:
        response = requests.get("http://127.0.0.1:8000/api/", timeout=5)
        print("✅ Django server is running")
        return True
    except requests.exceptions.ConnectionError:
        print("❌ Django server is not running or not accessible")
        return False
    except Exception as e:
        print(f"❌ Server check error: {e}")
        return False

if __name__ == "__main__":
    print("🧪 SMS API Frontend Test")
    print("=" * 50)
    
    # Check if server is running
    if not check_server_status():
        print("\n💡 To start Django server, run:")
        print("   python manage.py runserver")
        sys.exit(1)
    
    # Test SMS API
    success = test_sms_api()
    
    if success:
        print("\n🎉 SMS functionality is working from frontend perspective!")
    else:
        print("\n💥 SMS functionality needs debugging")
        
    print("\n" + "=" * 50)
