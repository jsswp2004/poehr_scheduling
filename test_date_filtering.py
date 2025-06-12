#!/usr/bin/env python3
"""
Test script to verify date filtering functionality in MessageLog API
"""
import requests
import json
from datetime import datetime, timedelta

def test_date_filtering():
    # You'll need to get a valid token first by logging in
    # This is a template - replace with actual token
    base_url = "http://127.0.0.1:8000"
    
    print("Testing MessageLog API date filtering...")
    print("Note: You need to have a valid access token to run this test")
    print("Get token by logging in through the frontend first\n")
    
    # Sample token (replace with real token)
    token = "YOUR_ACCESS_TOKEN_HERE"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        # Test 1: Get all email logs
        print("1. Testing basic API call (all email logs)")
        response = requests.get(f"{base_url}/api/communicator/logs/?message_type=email", headers=headers)
        if response.status_code == 200:
            logs = response.json()
            print(f"✅ Total email logs: {len(logs)}")
            
            if logs:
                print(f"Sample log date: {logs[0].get('created_at', 'N/A')}")
                
                # Test 2: Filter by start date
                print("\n2. Testing start date filter")
                start_date = "2024-01-01"
                response = requests.get(
                    f"{base_url}/api/communicator/logs/?message_type=email&created_at__gte={start_date}",
                    headers=headers
                )
                if response.status_code == 200:
                    filtered_logs = response.json()
                    print(f"✅ Logs after {start_date}: {len(filtered_logs)}")
                else:
                    print(f"❌ Start date filter failed: {response.status_code}")
                
                # Test 3: Filter by end date
                print("\n3. Testing end date filter")
                end_date = "2025-12-31"
                response = requests.get(
                    f"{base_url}/api/communicator/logs/?message_type=email&created_at__lte={end_date}",
                    headers=headers
                )
                if response.status_code == 200:
                    filtered_logs = response.json()
                    print(f"✅ Logs before {end_date}: {len(filtered_logs)}")
                else:
                    print(f"❌ End date filter failed: {response.status_code}")
                
                # Test 4: Filter by date range
                print("\n4. Testing date range filter")
                response = requests.get(
                    f"{base_url}/api/communicator/logs/?message_type=email&created_at__gte=2024-01-01&created_at__lte=2025-12-31",
                    headers=headers
                )
                if response.status_code == 200:
                    filtered_logs = response.json()
                    print(f"✅ Logs in date range: {len(filtered_logs)}")
                else:
                    print(f"❌ Date range filter failed: {response.status_code}")
                    
            else:
                print("No logs found - cannot test date filtering")
        else:
            print(f"❌ Basic API call failed: {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

def get_auth_instructions():
    print("To get a valid access token:")
    print("1. Open browser and go to your frontend app")
    print("2. Log in as admin/registrar")
    print("3. Open browser dev tools (F12)")
    print("4. Go to Console tab")
    print("5. Type: localStorage.getItem('access_token')")
    print("6. Copy the token value and replace 'YOUR_ACCESS_TOKEN_HERE' in this script")
    print("7. Run this script again")

if __name__ == "__main__":
    print("MessageLog Date Filtering Test")
    print("=" * 40)
    get_auth_instructions()
    print("\n" + "=" * 40)
    test_date_filtering()
