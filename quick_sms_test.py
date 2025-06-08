#!/usr/bin/env python3
"""
Quick SMS API test to verify the 500 error is fixed
"""

import requests
import json

def test_sms_quick():
    """Quick test of SMS API with minimal authentication"""
    
    print("🧪 Quick SMS API Test")
    print("=" * 30)
    
    # Check server availability
    try:
        response = requests.get("http://127.0.0.1:8000/api/", timeout=5)
        print("✅ Django server is accessible")
    except:
        print("❌ Cannot reach Django server")
        return False
    
    # Test SMS endpoint without auth (should get 401, not 500)
    sms_url = "http://127.0.0.1:8000/api/sms/send-sms/"
    sms_data = {
        "phone": "+1234567890",
        "message": "Test message"
    }
    
    try:
        response = requests.post(sms_url, json=sms_data)
        print(f"📊 SMS endpoint status: {response.status_code}")
        
        if response.status_code == 401:
            print("✅ SMS endpoint working (returns 401 for unauthenticated request)")
            return True
        elif response.status_code == 500:
            print("❌ 500 error still present!")
            print(f"Response: {response.text}")
            return False
        else:
            print(f"🤔 Unexpected status: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error testing SMS endpoint: {e}")
        return False

if __name__ == "__main__":
    test_sms_quick()
