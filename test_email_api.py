#!/usr/bin/env python
"""Test the email API endpoint to debug the 500 error"""

import requests
import json

def test_email_api():
    """Test the email API endpoint"""
    
    # Base URL for the deployed application
    base_url = "https://poehr-scheduling-750584621883.us-central1.run.app"
    
    print("🔍 Testing email API endpoint...")
    
    # Test authentication first
    login_url = f"{base_url}/api/auth/login/"
    login_data = {
        "username": "jsswp2004",
        "password": "krat25Miko!"
    }
    
    try:
        print(f"🔐 Testing authentication at {login_url}")
        response = requests.post(login_url, json=login_data, timeout=30)
        print(f"Authentication response status: {response.status_code}")
        
        if response.status_code == 200:
            auth_data = response.json()
            token = auth_data.get('access')
            print(f"✅ Authentication successful, got token: {token[:20]}...")
            
            # Test the email API endpoint - CORRECT URL!
            email_url = f"{base_url}/api/users/send-email/"
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
            
            # Sample email data with CORRECT field names
            email_data = {
                "email": "test@example.com",
                "subject": "Test Email",
                "message": "This is a test email message."
            }
            
            print(f"📧 Testing email API endpoint: {email_url}")
            print(f"Email data: {json.dumps(email_data, indent=2)}")
            
            email_response = requests.post(email_url, json=email_data, headers=headers, timeout=30)
            print(f"Email API response status: {email_response.status_code}")
            
            if email_response.status_code == 200:
                data = email_response.json()
                print(f"✅ Email API successful!")
                print(f"Response data: {json.dumps(data, indent=2)}")
            else:
                print(f"❌ Email API failed with status {email_response.status_code}")
                print(f"Response text: {email_response.text}")
                
        else:
            print(f"❌ Authentication failed with status {response.status_code}")
            print(f"Response text: {response.text}")
            
    except Exception as e:
        print(f"❌ Error testing email API: {e}")

if __name__ == "__main__":
    test_email_api()
