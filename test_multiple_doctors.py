#!/usr/bin/env python3
"""
Test script to authenticate and then test the doctor available-dates endpoint
"""
import requests
import json
import sys

def get_auth_token():
    """Get authentication token from the API"""
    print("Attempting to get auth token...")
    login_url = "https://poehr-scheduling-750584621883.us-central1.run.app/api/auth/login/"
    
    # Use the provided credentials
    login_data = {
        "username": "jsswp2004",
        "password": "krat25Miko!"
    }
    
    try:
        print(f"Making POST request to {login_url}")
        response = requests.post(login_url, json=login_data, timeout=30)
        print(f"Login status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Login successful")
            print(f"Response data keys: {list(data.keys())}")
            token = data.get('access_token') or data.get('access') or data.get('token')
            return token
        else:
            print(f"❌ Login failed: {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Login request failed: {e}")
        return None

def test_doctor_endpoint(token):
    """Test the problematic endpoint with authentication"""
    # Try multiple doctor IDs to see if the issue is doctor-specific
    doctor_ids = [22, 1, 2, 3]
    
    for doctor_id in doctor_ids:
        url = f"https://poehr-scheduling-750584621883.us-central1.run.app/api/doctors/{doctor_id}/available-dates/"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        
        try:
            print(f"Making GET request to {url}")
            response = requests.get(url, headers=headers, timeout=30)
            print(f"Doctor {doctor_id} - Status Code: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    print(f"✅ SUCCESS for doctor {doctor_id}: {json.dumps(data, indent=2)}")
                    return True
                except json.JSONDecodeError:
                    print(f"Response Text: {response.text}")
                    print("⚠️ Response is not valid JSON")
            elif response.status_code == 404:
                print(f"Doctor {doctor_id} not found, trying next...")
                continue
            else:
                print(f"❌ Error response for doctor {doctor_id}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed for doctor {doctor_id}: {e}")
            continue
    
    return False

def main():
    """Main test function"""
    print("=== TESTING DOCTOR AVAILABLE-DATES ENDPOINT ===")
    
    # First get auth token
    token = get_auth_token()
    if not token:
        print("❌ Could not get authentication token")
        return False
    
    print(f"✅ Got token: {token[:20]}...")
    
    # Test the endpoint
    success = test_doctor_endpoint(token)
    
    if success:
        print("\n✅ Overall test PASSED - endpoint is working!")
    else:
        print("\n❌ Overall test FAILED - endpoint has issues")
    
    return success

if __name__ == "__main__":
    print("Script starting...")
    success = main()
    print(f"Script finished with success: {success}")
    sys.exit(0 if success else 1)
