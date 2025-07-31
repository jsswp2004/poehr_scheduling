#!/usr/bin/env python
"""Test the deployed application API endpoint"""

import requests
import json

def test_api_endpoint():
    """Test the deployed API endpoint"""
    
    # Base URL for the deployed application
    base_url = "https://poehr-scheduling-750584621883.us-central1.run.app"
    
    print("🔍 Testing deployed API endpoint...")
    
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
            
            # Test the problematic API endpoint
            api_url = f"{base_url}/api/doctors/22/available-dates/"
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            }
            
            print(f"🎯 Testing API endpoint: {api_url}")
            api_response = requests.get(api_url, headers=headers, timeout=30)
            print(f"API endpoint response status: {api_response.status_code}")
            
            if api_response.status_code == 200:
                data = api_response.json()
                print(f"✅ API endpoint successful!")
                print(f"Response data: {json.dumps(data, indent=2)}")
            else:
                print(f"❌ API endpoint failed with status {api_response.status_code}")
                print(f"Response text: {api_response.text}")
                
        else:
            print(f"❌ Authentication failed with status {response.status_code}")
            print(f"Response text: {response.text}")
            
    except Exception as e:
        print(f"❌ Error testing API: {e}")

if __name__ == "__main__":
    test_api_endpoint()
