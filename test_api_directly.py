#!/usr/bin/env python3

import requests
import json

def test_api_directly():
    """Test the API endpoint directly to understand the issue"""
    
    # Login to get JWT token
    login_url = "https://poehr-scheduling-750584621883.us-central1.run.app/api/auth/login/"
    login_data = {
        "username": "jsswp2004",
        "password": "krat25Miko!"
    }
    
    print("=== TESTING API DIRECTLY ===")
    print(f"1. Logging in to {login_url}")
    
    try:
        login_response = requests.post(login_url, json=login_data)
        print(f"Login response status: {login_response.status_code}")
        
        if login_response.status_code == 200:
            login_result = login_response.json()
            access_token = login_result.get('access')
            print(f"✓ Login successful, token obtained (length: {len(access_token) if access_token else 0})")
            
            # Test available dates endpoint
            test_url = "https://poehr-scheduling-750584621883.us-central1.run.app/api/doctors/22/available-dates/"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            print(f"\n2. Testing {test_url}")
            
            dates_response = requests.get(test_url, headers=headers)
            print(f"Available dates response status: {dates_response.status_code}")
            print(f"Response headers: {dict(dates_response.headers)}")
            
            if dates_response.status_code == 500:
                print("❌ 500 Internal Server Error")
                print(f"Response text: {dates_response.text}")
            elif dates_response.status_code == 200:
                print("✓ Success!")
                result = dates_response.json()
                print(f"Response: {json.dumps(result, indent=2)}")
            else:
                print(f"❌ Unexpected status code: {dates_response.status_code}")
                print(f"Response text: {dates_response.text}")
                
        else:
            print(f"❌ Login failed: {login_response.text}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_api_directly()
