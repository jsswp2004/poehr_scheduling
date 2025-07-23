#!/usr/bin/env python3
"""
Test script for both welcome email and admin notification functionality
Tests the complete enrollment email system
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

def test_enrollment_emails():
    """Test both welcome email and admin notification"""
    print("🧪 Testing Complete Enrollment Email System")
    print("=" * 60)
    
    # Test enrollment data
    test_data = {
        "username": "testclinic_admin",
        "email": "clinic.admin@testorganization.com",
        "password": "SecurePassword123!",
        "first_name": "Sarah",
        "last_name": "Johnson",
        "phone_number": "555-987-6543",
        "organization_name": "Test Medical Clinic",
        "organization_type": "clinic",
        "subscription_tier": "premium",
        "is_enrollment": True,
        "payment_method_id": "pm_test_enrollment_123"
    }
    
    api_url = "http://127.0.0.1:8000/api/auth/register/"
    
    try:
        print(f"📤 Sending enrollment request to: {api_url}")
        print(f"🏢 Organization: {test_data['organization_name']}")
        print(f"👤 Admin: {test_data['first_name']} {test_data['last_name']}")
        print(f"📧 Email: {test_data['email']}")
        print(f"📊 Plan: {test_data['subscription_tier']}")
        print()
        
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
            print(f"   Status: {data.get('subscription_status')}")
            print()
            print("📧 Email Notifications:")
            print("   ✅ Welcome email should have been sent to enrollee")
            print("   ✅ Admin notification should have been sent to system admins")
            print()
            print("🔍 Check your email logs to verify both emails were sent!")
            
        else:
            print("❌ Enrollment failed!")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Test failed with error: {str(e)}")

def check_email_logs():
    """Check email logs via API to verify emails were sent"""
    print("\n🔍 Checking Email Logs...")
    print("=" * 40)
    
    try:
        # This would require authentication, so just provide instructions
        print("To verify emails were sent:")
        print("1. Check Django admin panel at: http://127.0.0.1:8000/admin/")
        print("2. Navigate to Communicator > Message logs")
        print("3. Filter by message_type = 'email'")
        print("4. Look for recent entries with:")
        print("   - Welcome email to enrollee")
        print("   - Admin notification to system admins")
        print()
        print("Or check your email server logs if configured.")
        
    except Exception as e:
        print(f"❌ Error checking logs: {str(e)}")

if __name__ == "__main__":
    print("🔧 Prerequisites:")
    print("• Django server running on http://127.0.0.1:8000")
    print("• Email settings configured in Django")
    print("• At least one system_admin user in database")
    print()
    
    response = input("Press Enter to run the enrollment email test (or 'q' to quit): ")
    if response.lower() != 'q':
        test_enrollment_emails()
        check_email_logs()
    else:
        print("Test cancelled.")
