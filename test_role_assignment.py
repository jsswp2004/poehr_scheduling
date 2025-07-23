#!/usr/bin/env python
"""
Django shell script to test enrollment role assignment
Run with: docker exec -it poehr_scheduling-web-1 python manage.py shell < test_role_assignment.py
"""

from users.models import CustomUser, Organization
from django.test import RequestFactory
from users.views import RegisterView
import json

def test_enrollment_role_assignment():
    """Test that enrollment sets role to admin"""
    print("🧪 Testing enrollment role assignment...")
    
    # Create a mock request for enrollment
    factory = RequestFactory()
    enrollment_data = {
        "username": "shell_test_admin",
        "email": "shell_admin@example.com",
        "password": "testpass123",
        "first_name": "Shell",
        "last_name": "Admin",
        "phone_number": "555-0125",
        "organization_name": "Shell Test Org",
        "organization_type": "clinic",
        "subscription_tier": "premium",
        "is_enrollment": True,  # This should trigger admin role assignment
    }
    
    # Clean up any existing test user
    CustomUser.objects.filter(email="shell_admin@example.com").delete()
    
    # Create request
    request = factory.post('/api/auth/register/', 
                          data=json.dumps(enrollment_data),
                          content_type='application/json')
    request.user = None  # Anonymous user
    
    # Test the view
    view = RegisterView()
    view.request = request
    
    try:
        response = view.create(request)
        
        if response.status_code == 201:
            print("✅ Enrollment successful!")
            
            # Check the created user's role
            user = CustomUser.objects.get(email="shell_admin@example.com")
            print(f"👤 Created user: {user.username}")
            print(f"🎭 User role: {user.role}")
            print(f"🏢 Organization: {user.organization.name}")
            print(f"💳 Subscription tier: {user.subscription_tier}")
            
            if user.role == 'admin':
                print("✅ SUCCESS: Role correctly set to 'admin' for enrollment!")
            else:
                print(f"❌ FAILED: Expected role 'admin', got '{user.role}'")
                
        else:
            print(f"❌ Enrollment failed with status {response.status_code}")
            print(f"📝 Error: {response.data}")
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
    
    finally:
        # Clean up test user
        try:
            CustomUser.objects.filter(email="shell_admin@example.com").delete()
            print("🧹 Cleaned up test user")
        except:
            pass

def test_patient_registration_role():
    """Test that patient registration keeps default role"""
    print("\n🧪 Testing patient registration role (should stay default)...")
    
    # Create a mock request for patient registration
    factory = RequestFactory()
    patient_data = {
        "username": "shell_test_patient",
        "email": "shell_patient@example.com",
        "password": "testpass123",
        "first_name": "Shell",
        "last_name": "Patient",
        "phone_number": "555-0126",
        "organization_name": "Shell Patient Org",
        "is_enrollment": False,  # This should NOT trigger admin role assignment
    }
    
    # Clean up any existing test user
    CustomUser.objects.filter(email="shell_patient@example.com").delete()
    
    # Create request
    request = factory.post('/api/auth/register/', 
                          data=json.dumps(patient_data),
                          content_type='application/json')
    request.user = None  # Anonymous user
    
    # Test the view
    view = RegisterView()
    view.request = request
    
    try:
        response = view.create(request)
        
        if response.status_code == 201:
            print("✅ Patient registration successful!")
            
            # Check the created user's role
            user = CustomUser.objects.get(email="shell_patient@example.com")
            print(f"👤 Created user: {user.username}")
            print(f"🎭 User role: {user.role}")
            print(f"🏢 Organization: {user.organization.name}")
            
            if user.role == 'none':
                print("✅ SUCCESS: Role correctly kept as 'none' for patient registration!")
            else:
                print(f"❌ UNEXPECTED: Expected role 'none', got '{user.role}'")
                
        else:
            print(f"❌ Patient registration failed with status {response.status_code}")
            print(f"📝 Error: {response.data}")
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
    
    finally:
        # Clean up test user
        try:
            CustomUser.objects.filter(email="shell_patient@example.com").delete()
            print("🧹 Cleaned up test patient")
        except:
            pass

if __name__ == "__main__":
    print("🚀 DJANGO SHELL ROLE ASSIGNMENT TEST")
    print("=" * 50)
    
    # Test enrollment (should get admin role)
    test_enrollment_role_assignment()
    
    # Test patient registration (should keep default role)
    test_patient_registration_role()
    
    print("\n" + "=" * 50)
    print("✅ Role assignment tests completed!")
    print("\n🔍 To manually verify in Django shell:")
    print("from users.models import CustomUser")
    print("CustomUser.objects.all().values('username', 'email', 'role')")
