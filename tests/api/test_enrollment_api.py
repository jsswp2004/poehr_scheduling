#!/usr/bin/env python
"""
Test script to validate the enrollment flow with different subscription tiers
"""
import requests
import json

API_BASE_URL = "http://127.0.0.1:8000"

def test_enrollment_flow():
    print("🧪 Testing Enrollment Flow with Different Subscription Tiers")
    print("=" * 70)
    
    # Test data for different tiers
    test_cases = [
        {
            "tier": "basic",
            "expected_display": "Personal",
            "user": {
                "username": "testuser_basic",
                "email": "testuser_basic@example.com",
                "password": "testpass123",
                "first_name": "Test",
                "last_name": "Basic",
                "organization_name": "Test Org Basic",
                "organization_type": "personal",
                "subscription_tier": "basic",
                "payment_method_id": "pm_card_visa"  # Stripe test payment method
            }
        },
        {
            "tier": "premium", 
            "expected_display": "Clinic",
            "user": {
                "username": "testuser_premium",
                "email": "testuser_premium@example.com", 
                "password": "testpass123",
                "first_name": "Test",
                "last_name": "Premium",
                "organization_name": "Test Org Premium",
                "organization_type": "clinic",
                "subscription_tier": "premium",
                "payment_method_id": "pm_card_visa"
            }
        },
        {
            "tier": "enterprise",
            "expected_display": "Group", 
            "user": {
                "username": "testuser_enterprise",
                "email": "testuser_enterprise@example.com",
                "password": "testpass123", 
                "first_name": "Test",
                "last_name": "Enterprise",
                "organization_name": "Test Org Enterprise",
                "organization_type": "group",
                "subscription_tier": "enterprise",
                "payment_method_id": "pm_card_visa"
            }
        }
    ]
    
    for test_case in test_cases:
        tier = test_case["tier"]
        expected_display = test_case["expected_display"]
        user_data = test_case["user"]
        
        print(f"\n🎯 Testing {tier} tier (expecting '{expected_display}' display name)")
        print("-" * 50)
        
        try:
            # Send registration request
            response = requests.post(
                f"{API_BASE_URL}/api/auth/register/",
                json=user_data,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"📤 Request sent for {tier} tier")
            print(f"📥 Response status: {response.status_code}")
            
            if response.status_code == 201:
                data = response.json()
                print("✅ Registration successful!")
                print(f"   User ID: {data.get('user_id')}")
                print(f"   Subscription Tier: {data.get('subscription_tier')}")
                print(f"   Subscription Status: {data.get('subscription_status')}")
                print(f"   Trial End Date: {data.get('trial_end_date')}")
                
                # Verify tier display name
                if data.get('subscription_tier') == expected_display:
                    print(f"✅ Tier display name correct: {expected_display}")
                else:
                    print(f"❌ Tier display name mismatch: expected '{expected_display}', got '{data.get('subscription_tier')}'")
                
            else:
                print(f"❌ Registration failed: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Error text: {response.text}")
                    
        except Exception as e:
            print(f"❌ Request failed: {str(e)}")
        
        print()

if __name__ == "__main__":
    test_enrollment_flow()
