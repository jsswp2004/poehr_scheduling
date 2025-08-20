#!/usr/bin/env python3
"""
Script to test the analytics API endpoint directly
to diagnose the "Error Loading Report" issue
"""

import requests
import json
import os
from datetime import datetime, timedelta

# API configuration
API_BASE_URL = "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"
ANALYTICS_ENDPOINT = f"{API_BASE_URL}/api/analytics/reports/"

def test_analytics_endpoint():
    print(f"🔍 Testing Analytics API Endpoint: {ANALYTICS_ENDPOINT}")
    
    # Test parameters similar to what frontend sends
    test_params = {
        'report_type': 'upcoming_appointments',
        'start_date': (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'),
        'end_date': (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
        'provider': ''  # Empty string for all providers
    }
    
    print(f"📋 Test Parameters: {json.dumps(test_params, indent=2)}")
    
    try:
        # Test without authentication first
        print("\n1️⃣ Testing without authentication...")
        response = requests.get(ANALYTICS_ENDPOINT, params=test_params, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 401:
            print("❌ Authentication required - this is expected")
        elif response.status_code == 200:
            print("✅ Request successful without auth (unexpected)")
            print(f"Response: {response.text[:500]}...")
        else:
            print(f"❓ Unexpected status code: {response.status_code}")
            print(f"Response: {response.text[:500]}...")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {str(e)}")
        return False
    
    # Test different report types
    report_types = ['upcoming_appointments', 'past_appointments', 'provider_schedule']
    
    for report_type in report_types:
        print(f"\n2️⃣ Testing report type: {report_type}")
        test_params['report_type'] = report_type
        
        try:
            response = requests.get(ANALYTICS_ENDPOINT, params=test_params, timeout=10)
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 401:
                print("❌ Authentication required")
            elif response.status_code == 200:
                print("✅ Request successful")
                try:
                    data = response.json()
                    print(f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
                except:
                    print("❓ Response not valid JSON")
            else:
                print(f"❓ Status {response.status_code}: {response.text[:200]}...")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {str(e)}")
    
    return True

if __name__ == "__main__":
    print("🚀 Starting Analytics API Test")
    print("=" * 50)
    test_analytics_endpoint()
    print("\n" + "=" * 50)
    print("✅ Test completed")
