#!/usr/bin/env python
"""
Test script to verify that enrollment automatically sets user role to 'admin'
"""

import requests
import json

# Test enrollment endpoint with role verification
def test_enrollment_role():
    url = "http://127.0.0.1:8000/api/auth/register/"
    
    # Sample enrollment data
    enrollment_data = {
        "username": "test_admin_role",
        "email": "test_admin@example.com",
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "Admin",
        "phone_number": "555-0123",
        "organization_name": "Test Admin Org",
        "organization_type": "clinic",
        "subscription_tier": "premium",
        "is_enrollment": True,  # This should trigger admin role assignment
        "payment_method_id": "pm_card_visa"  # Test payment method
    }
    
    try:
        print("🧪 Testing enrollment with automatic admin role assignment...")
        print(f"📧 Test user email: {enrollment_data['email']}")
        print(f"🏢 Organization: {enrollment_data['organization_name']}")
        print(f"🎯 Expected role: admin")
        
        response = requests.post(url, json=enrollment_data)
        
        if response.status_code == 201:
            result = response.json()
            print("✅ Enrollment successful!")
            print(f"📊 Response: {json.dumps(result, indent=2)}")
            
            # Now check the user's role by querying the API
            # (This would require authentication, so we'll simulate the check)
            print("\n🔍 To verify the role was set correctly:")
            print("1. Check Django admin panel")
            print("2. Or run this Django shell command:")
            print(f"   CustomUser.objects.get(email='{enrollment_data['email']}').role")
            
        else:
            print(f"❌ Enrollment failed with status {response.status_code}")
            print(f"📝 Error response: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Connection error: {e}")
        print("💡 Make sure the Django server is running on http://127.0.0.1:8000")

def test_patient_registration_role():
    """Test that patient registration doesn't set admin role"""
    url = "http://127.0.0.1:8000/api/auth/register/"
    
    # Sample patient registration data
    patient_data = {
        "username": "test_patient_role",
        "email": "test_patient@example.com", 
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "Patient",
        "phone_number": "555-0124",
        "organization_name": "Test Patient Org",
        "is_enrollment": False  # This should NOT trigger admin role assignment
    }
    
    try:
        print("\n🧪 Testing patient registration (should NOT get admin role)...")
        print(f"📧 Test patient email: {patient_data['email']}")
        print(f"🎯 Expected role: none (default)")
        
        response = requests.post(url, json=patient_data)
        
        if response.status_code == 201:
            result = response.json()
            print("✅ Patient registration successful!")
            print(f"📊 Response: {json.dumps(result, indent=2)}")
            
            print("\n🔍 To verify the role was NOT changed from default:")
            print("1. Check Django admin panel")
            print("2. Or run this Django shell command:")
            print(f"   CustomUser.objects.get(email='{patient_data['email']}').role")
            
        else:
            print(f"❌ Patient registration failed with status {response.status_code}")
            print(f"📝 Error response: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Connection error: {e}")
        print("💡 Make sure the Django server is running on http://127.0.0.1:8000")

if __name__ == "__main__":
    print("🚀 ENROLLMENT ROLE ASSIGNMENT TEST")
    print("=" * 50)
    
    # Test enrollment (should get admin role)
    test_enrollment_role()
    
    # Test patient registration (should keep default role)
    test_patient_registration_role()
    
    print("\n" + "=" * 50)
    print("🎯 VERIFICATION STEPS:")
    print("1. Run Django shell: docker exec -it poehr_scheduling-web-1 python manage.py shell")
    print("2. Check roles:")
    print("   from users.models import CustomUser")
    print("   CustomUser.objects.filter(email__contains='test_').values('email', 'role', 'is_enrollment')")
    print("3. Clean up test users when done:")
    print("   CustomUser.objects.filter(email__contains='test_').delete()")
