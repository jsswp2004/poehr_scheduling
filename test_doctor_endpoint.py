#!/usr/bin/env python3
"""
Test script to check the doctor available-dates endpoint directly
"""
import requests
import json
import sys

def test_endpoint():
    """Test the problematic endpoint directly"""
    url = "https://poehr-scheduling-750584621883.us-central1.run.app/api/doctors/22/available-dates/"
    
    print(f"Testing endpoint: {url}")
    
    try:
        response = requests.get(url, timeout=30)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"Response Data: {json.dumps(data, indent=2)}")
                print("✅ Endpoint is working correctly!")
            except json.JSONDecodeError:
                print(f"Response Text: {response.text}")
                print("⚠️ Response is not valid JSON")
        else:
            print(f"Response Text: {response.text}")
            print(f"❌ Endpoint returned error: {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False
    
    return response.status_code == 200

if __name__ == "__main__":
    success = test_endpoint()
    sys.exit(0 if success else 1)
