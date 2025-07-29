#!/usr/bin/env python
"""
Quick test script to verify appointment endpoints after deployment
"""

import requests
import json

# Test the failing endpoints that were reported
API_BASE_URL = "https://poehr-scheduling-backend-api-6r2kqpuwca-uc.a.run.app"

# Headers for authentication (you'll need to update with valid token)
headers = {
    'Content-Type': 'application/json',
    # 'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE'  # Add actual token when testing
}

def test_endpoint(url, description):
    """Test a single endpoint and report results"""
    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"{description}:")
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            print(f"  ✅ SUCCESS")
            try:
                data = response.json()
                if isinstance(data, list):
                    print(f"  📊 Returned {len(data)} items")
                elif isinstance(data, dict):
                    print(f"  📊 Returned object with {len(data)} fields")
            except:
                print(f"  📊 Returned data: {len(response.text)} characters")
        else:
            print(f"  ❌ FAILED: {response.text[:200]}")
        print()
    except Exception as e:
        print(f"{description}:")
        print(f"  ❌ ERROR: {e}")
        print()

def main():
    print("🧪 Testing appointment form endpoints...")
    print("=" * 50)
    
    # Test the endpoints that were failing with 500 errors
    test_endpoints = [
        (f"{API_BASE_URL}/api/holidays/", "Holidays API"),
        (f"{API_BASE_URL}/api/settings/environment/", "Environment Settings API"),
        (f"{API_BASE_URL}/api/availability/?doctor=14", "Availability API (doctor 14)"),
        (f"{API_BASE_URL}/api/doctors/14/available-dates/", "Doctor Available Dates API"),
        (f"{API_BASE_URL}/api/clinic-events/", "Clinic Events API"),
    ]
    
    for url, description in test_endpoints:
        test_endpoint(url, description)
    
    print("🏁 Testing complete!")
    print("\nNote: Some endpoints may require authentication.")
    print("Update the headers with a valid JWT token for full testing.")

if __name__ == "__main__":
    main()
