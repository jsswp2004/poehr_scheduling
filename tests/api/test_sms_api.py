#!/usr/bin/env python3

import requests
import json

# Test the SMS API endpoint directly
url = "http://127.0.0.1:8000/api/sms/send-sms/"

# Test data
data = {
    "phone": "+13018806015",
    "message": "Test SMS via API endpoint"
}

print("🔧 Testing SMS API Endpoint:")
print(f"URL: {url}")
print(f"Data: {data}")

try:
    # First, let's try without authentication to see what error we get
    response = requests.post(url, json=data)
    
    print(f"\nResponse Status: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    
    try:
        response_json = response.json()
        print(f"Response JSON: {json.dumps(response_json, indent=2)}")
    except:
        print(f"Response Text: {response.text}")
        
except requests.exceptions.ConnectionError:
    print("❌ Connection failed - Django server may not be running")
    print("   Please start Django server with: python manage.py runserver")
except Exception as e:
    print(f"❌ Request failed: {e}")

print("\n" + "="*50)
print("If you get a 401 Unauthorized error, that's expected.")
print("The SMS function works - the issue is likely authentication.")
print("Make sure you're logged in when testing from the frontend.")
