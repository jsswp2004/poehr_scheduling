#!/usr/bin/env python3
"""
Manual SMS Test - Directly call using cURL equivalent
"""

import subprocess
import json

def test_sms_manual():
    print("🧪 Manual SMS Test")
    print("=" * 30)
    
    # Test credentials
    auth_data = {
        "username": "jsswp2004",
        "password": "krat25Miko!"
    }
    
    print("🔐 Getting authentication token...")
    
    # Get token using curl equivalent
    import requests
    
    try:
        # Login
        login_response = requests.post(
            "http://127.0.0.1:8000/api/auth/login/",
            json=auth_data
        )
        
        print(f"Login status: {login_response.status_code}")
        
        if login_response.status_code == 200:
            token = login_response.json().get('access')
            print("✅ Got authentication token")
            
            # Test SMS
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
            
            sms_data = {
                "phone": "+13018806015",  # Test number
                "message": "Test SMS from POEHR - Fix verification"
            }
            
            print("\n📱 Sending SMS...")
            sms_response = requests.post(
                "http://127.0.0.1:8000/api/sms/send-sms/",
                json=sms_data,
                headers=headers
            )
            
            print(f"SMS Response Status: {sms_response.status_code}")
            print(f"SMS Response: {sms_response.text}")
            
            if sms_response.status_code == 500:
                print("\n❌ STILL GETTING 500 ERROR!")
                return False
            else:
                print("\n✅ SMS endpoint working (no 500 error)")
                return True
                
        else:
            print(f"❌ Login failed: {login_response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    if test_sms_manual():
        print("\n🎉 SUCCESS: SMS fix confirmed!")
    else:
        print("\n❌ SMS still has issues")
