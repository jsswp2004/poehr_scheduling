#!/usr/bin/env python3
"""
Test script for enrollment welcome email functionality
Run this after implementing the email feature to verify it works
"""
import os
import sys
import django
import requests
import json

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

def test_enrollment_email():
    """Test enrollment with email notification"""
    print("🧪 Testing Enrollment Email Functionality")
    print("=" * 50)
    
    # Test enrollment data
    test_data = {
        "username": "testorg_admin",
        "email": "test@example.com",  # Use a test email
        "password": "TestPassword123!",
        "first_name": "John",
        "last_name": "Doe",
        "phone_number": "555-123-4567",
        "organization_name": "Test Organization",
        "organization_type": "clinic",
        "subscription_tier": "premium",
        "is_enrollment": True,
        "payment_method_id": "pm_test_123456789"  # Test payment method ID
    }
    
    api_url = "http://127.0.0.1:8000/api/auth/register/"
    
    try:
        print(f"📤 Sending enrollment request to: {api_url}")
        print(f"📋 Organization: {test_data['organization_name']}")
        print(f"📧 Email: {test_data['email']}")
        print(f"📊 Plan: {test_data['subscription_tier']}")
        
        response = requests.post(
            api_url,
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"📥 Response Status: {response.status_code}")
        
        if response.status_code == 201:
            data = response.json()
            print("✅ Enrollment successful!")
            print(f"   User ID: {data.get('user_id')}")
            print(f"   Trial End: {data.get('trial_end_date')}")
            print(f"   Subscription: {data.get('subscription_tier')}")
            print("📧 Welcome email should have been sent!")
            
        else:
            print("❌ Enrollment failed!")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Test failed with error: {str(e)}")

if __name__ == "__main__":
    print("🔧 Make sure your Django server is running on http://127.0.0.1:8000")
    print("🔧 Make sure your email settings are configured in Django settings")
    print()
    
    response = input("Press Enter to run the test (or 'q' to quit): ")
    if response.lower() != 'q':
        test_enrollment_email()
    else:
        print("Test cancelled.")
