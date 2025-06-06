#!/usr/bin/env python
"""
Test script to validate tier name mapping functionality
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.stripe_service import get_tier_key, get_tier_display_name, TIER_DISPLAY_NAMES, TIER_KEYS

def test_tier_mapping():
    print("🧪 Testing Tier Mapping Functions")
    print("=" * 50)
    
    print("\n📊 Available Mappings:")
    print("TIER_DISPLAY_NAMES:", TIER_DISPLAY_NAMES)
    print("TIER_KEYS:", TIER_KEYS)
    
    print("\n🔄 Testing get_tier_display_name:")
    test_cases = ['basic', 'premium', 'enterprise', 'invalid']
    for tier_key in test_cases:
        display_name = get_tier_display_name(tier_key)
        print(f"  {tier_key} -> {display_name}")
    
    print("\n🔄 Testing get_tier_key:")
    test_cases = ['Personal', 'Clinic', 'Group', 'invalid']
    for display_name in test_cases:
        tier_key = get_tier_key(display_name)
        print(f"  {display_name} -> {tier_key}")
    
    print("\n✅ All tests completed!")

if __name__ == "__main__":
    test_tier_mapping()
