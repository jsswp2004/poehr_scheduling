#!/usr/bin/env python3
"""
Script to test the analytics API endpoint with authentication
to diagnose the "Error Loading Report" issue with real auth token
"""

import requests
import json
import os
from datetime import datetime, timedelta

# API configuration
API_BASE_URL = "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"
LOGIN_ENDPOINT = f"{API_BASE_URL}/api/auth/login/"
ANALYTICS_ENDPOINT = f"{API_BASE_URL}/api/analytics/reports/"

def get_auth_token():
    """Get authentication token using test credentials"""
    print("🔐 Attempting to get authentication token...")
    
    # Use test credentials (adjust as needed)
    login_data = {
        "username": "jsswp2004",  # Use the system admin user
        "password": "krat25Miko!"  # The admin password
    }
    
    try:
        response = requests.post(LOGIN_ENDPOINT, json=login_data, timeout=10)
        print(f"Login Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            access_token = data.get('access')
            if access_token:
                print("✅ Successfully obtained authentication token")
                return access_token
            else:
                print("❌ No access token in response")
                print(f"Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ Login failed: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Login request failed: {str(e)}")
    
    return None

def test_analytics_with_auth():
    """Test analytics endpoint with authentication"""
    print(f"🔍 Testing Analytics API Endpoint: {ANALYTICS_ENDPOINT}")
    
    # Get authentication token
    access_token = get_auth_token()
    if not access_token:
        print("❌ Cannot proceed without authentication token")
        return False
    
    # Prepare headers
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    # Test parameters similar to what frontend sends
    test_params = {
                'report_type': 'Upcoming Appointments Report',  # Use exact name from frontend
        'start_date': (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'),
        'end_date': (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
        'provider': ''  # Empty string for all providers
    }
    
    print(f"📋 Test Parameters: {json.dumps(test_params, indent=2)}")
    
    try:
        print("\n🚀 Testing with authentication...")
        response = requests.get(ANALYTICS_ENDPOINT, params=test_params, headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            print("✅ Request successful!")
            try:
                data = response.json()
                print(f"Response structure: {type(data)}")
                if isinstance(data, dict):
                    print(f"Response keys: {list(data.keys())}")
                    # Print first few items for debugging
                    for key, value in list(data.items())[:3]:
                        print(f"  {key}: {type(value)} ({len(str(value)) if value else 0} chars)")
                elif isinstance(data, list):
                    print(f"Response is a list with {len(data)} items")
                    if data:
                        print(f"First item keys: {list(data[0].keys()) if isinstance(data[0], dict) else 'Not a dict'}")
                
                print(f"Raw response (first 500 chars): {response.text[:500]}...")
                
            except json.JSONDecodeError:
                print("❌ Response is not valid JSON")
                print(f"Raw response: {response.text[:500]}...")
        else:
            print(f"❌ Request failed with status {response.status_code}")
            print(f"Response: {response.text[:500]}...")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {str(e)}")
        return False
    
    return True

if __name__ == "__main__":
    print("🚀 Starting Analytics API Test with Authentication")
    print("=" * 60)
    test_analytics_with_auth()
    print("\n" + "=" * 60)
    print("✅ Test completed")
