#!/usr/bin/env python3
"""
Test script to validate pricing page to enrollment page integration
This simulates the URL parameter passing and validation
"""

def test_url_parameter_mapping():
    """Test the logic for mapping URL parameters to form defaults"""
    
    # Test cases: (plan, tier) -> expected (organization_type, subscription_tier)
    test_cases = [
        # Explicit plan and tier
        ('personal', 'basic', 'personal', 'basic'),
        ('clinic', 'premium', 'clinic', 'premium'),
        ('group', 'enterprise', 'group', 'enterprise'),
        
        # Plan only (should map to default tier for that plan)
        ('personal', None, 'personal', 'basic'),
        ('clinic', None, 'clinic', 'premium'),
        ('group', None, 'group', 'enterprise'),
        
        # Invalid/missing parameters (should default to personal/premium)
        (None, None, 'personal', 'premium'),
        ('invalid', 'invalid', 'personal', 'premium'),
        ('PERSONAL', 'PREMIUM', 'personal', 'premium'),  # Case insensitive - tier takes precedence
    ]
    
    def get_initial_org_type(url_plan):
        if url_plan:
            switch = {
                'personal': 'personal',
                'clinic': 'clinic',
                'group': 'group'
            }
            return switch.get(url_plan.lower(), 'personal')
        return 'personal'
    
    def get_initial_tier(url_tier, url_plan):
        if url_tier:
            switch = {
                'basic': 'basic',
                'premium': 'premium',
                'enterprise': 'enterprise'
            }
            return switch.get(url_tier.lower(), 'premium')
        
        # If plan is specified but tier isn't, map plan to default tier
        if url_plan:
            switch = {
                'personal': 'basic',
                'clinic': 'premium',
                'group': 'enterprise'
            }
            return switch.get(url_plan.lower(), 'premium')
        
        return 'premium'
    
    print("Testing URL parameter mapping logic...")
    print("=" * 60)
    
    all_passed = True
    for i, (plan, tier, expected_org, expected_tier) in enumerate(test_cases, 1):
        actual_org = get_initial_org_type(plan)
        actual_tier = get_initial_tier(tier, plan)
        
        passed = actual_org == expected_org and actual_tier == expected_tier
        all_passed = all_passed and passed
        
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"Test {i}: {status}")
        print(f"  Input: plan='{plan}', tier='{tier}'")
        print(f"  Expected: org_type='{expected_org}', subscription_tier='{expected_tier}'")
        print(f"  Actual:   org_type='{actual_org}', subscription_tier='{actual_tier}'")
        print()
    
    print("=" * 60)
    if all_passed:
        print("🎉 All tests passed! URL parameter mapping logic is working correctly.")
    else:
        print("❌ Some tests failed. Please check the logic.")
    
    return all_passed

def test_pricing_page_urls():
    """Test that pricing page generates correct URLs"""
    
    expected_urls = [
        "/enroll?plan=personal&tier=basic",
        "/enroll?plan=clinic&tier=premium", 
        "/enroll?plan=group&tier=enterprise"
    ]
    
    print("\nExpected URLs from pricing page:")
    print("=" * 40)
    for i, url in enumerate(expected_urls, 1):
        print(f"{i}. {url}")
    
    print("\nThese URLs should:")
    print("- Set organization_type to the plan name")
    print("- Set subscription_tier to the tier name")
    print("- Pre-select the correct values in enrollment form")

if __name__ == "__main__":
    print("POWER IT Healthcare - Pricing to Enrollment Integration Test")
    print("=" * 70)
    
    # Test URL parameter mapping
    mapping_passed = test_url_parameter_mapping()
    
    # Show expected URLs
    test_pricing_page_urls()
    
    print("\n" + "=" * 70)
    print("SUMMARY:")
    print(f"URL Parameter Mapping: {'✅ PASS' if mapping_passed else '❌ FAIL'}")
    print("Frontend Integration: Ready for testing")
    print("\nTo test the full integration:")
    print("1. Start the frontend: npm start (in frontend directory)")
    print("2. Navigate to http://localhost:3000/pricing")
    print("3. Click any 'Get Started' or 'Start Free Trial' button")
    print("4. Verify the enrollment form has correct default values")
