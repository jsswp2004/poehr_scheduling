#!/usr/bin/env python
"""
Test script to verify the registration fix:
- Patient registration should work without Stripe
- Service enrollment should trigger Stripe integration
"""

import requests
import json

API_BASE_URL = "http://127.0.0.1:8000"

def test_patient_registration():
    """Test patient registration without Stripe (should work)"""
    print("🧪 Testing Patient Registration (without Stripe)")
    print("=" * 50)
    
    patient_data = {
        "username": "test_patient_001",
        "email": "test_patient_001@example.com",
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "Patient",
        "role": "patient",
        "organization_name": "Test Clinic"
        # No is_enrollment flag = should skip Stripe
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/auth/register/",
            json=patient_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"📤 Request sent for patient registration")
        print(f"📥 Response status: {response.status_code}")
        
        if response.status_code == 201:
            data = response.json()
            print("✅ Patient registration successful!")
            print(f"   User ID: {data.get('user_id')}")
            print(f"   Message: {data.get('message')}")
            print(f"   Username: {data.get('username')}")
            print(f"   Email: {data.get('email')}")
            
            # Should NOT have Stripe-related fields
            if 'subscription_tier' not in data:
                print("✅ Correctly skipped Stripe integration for patient registration")
            else:
                print("❌ Unexpected: Stripe data found in patient registration")
                
        else:
            print(f"❌ Patient registration failed: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Error: {json.dumps(error_data, indent=2)}")
            except:
                print(f"   Error text: {response.text}")
                
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")

def test_service_enrollment():
    """Test service enrollment with Stripe (should use Stripe)"""
    print("\n🧪 Testing Service Enrollment (with Stripe)")
    print("=" * 50)
    
    enrollment_data = {
        "username": "test_enrollment_001",
        "email": "test_enrollment_001@example.com",
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "Enrollment",
        "organization_name": "Test Organization",
        "organization_type": "clinic",
        "subscription_tier": "premium",
        "payment_method_id": "pm_card_visa",  # Stripe test payment method
        "is_enrollment": True  # This should trigger Stripe integration
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/auth/register/",
            json=enrollment_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"📤 Request sent for service enrollment")
        print(f"📥 Response status: {response.status_code}")
        
        if response.status_code == 201:
            data = response.json()
            print("✅ Service enrollment successful!")
            print(f"   User ID: {data.get('user_id')}")
            print(f"   Message: {data.get('message')}")
            print(f"   Subscription Tier: {data.get('subscription_tier')}")
            print(f"   Subscription Status: {data.get('subscription_status')}")
            print(f"   Trial End Date: {data.get('trial_end_date')}")
            
            # Should have Stripe-related fields
            if 'subscription_tier' in data:
                print("✅ Correctly used Stripe integration for service enrollment")
            else:
                print("❌ Unexpected: No Stripe data found in service enrollment")
                
        else:
            print(f"⚠️ Service enrollment status: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Response: {json.dumps(error_data, indent=2)}")
                
                # Check if it's expected Stripe error (which is fine for testing)
                error_msg = str(error_data)
                if "stripe" in error_msg.lower() or "payment" in error_msg.lower():
                    print("ℹ️ This appears to be a Stripe-related error, which means:")
                    print("   ✅ The is_enrollment flag correctly triggered Stripe integration")
                    print("   ❌ Stripe configuration/setup issue (expected in test environment)")
                else:
                    print("❌ Unexpected error type")
                    
            except:
                print(f"   Error text: {response.text}")
                
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")

if __name__ == "__main__":
    print("🔧 Testing Registration Fix - Patient vs Service Enrollment")
    print("=" * 70)
    
    # Test 1: Patient registration (should skip Stripe)
    test_patient_registration()
    
    # Test 2: Service enrollment (should use Stripe)
    test_service_enrollment()
    
    print("\n📝 Test Summary:")
    print("- Patient registration should work without Stripe errors")
    print("- Service enrollment should attempt Stripe integration")
    print("- The is_enrollment flag controls whether Stripe is used")
