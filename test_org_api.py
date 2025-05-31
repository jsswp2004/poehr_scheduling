#!/usr/bin/env python
"""
Test script to verify Organization API endpoints
"""
import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

import requests
from users.models import CustomUser, Organization

def test_organization_endpoints():
    base_url = "http://127.0.0.1:8000"
    
    print("🧪 Testing Organization API endpoints...")
      # Test 1: Check if organizations endpoint is accessible
    try:
        response = requests.get(f"{base_url}/api/users/organizations/")
        print(f"✅ Organizations endpoint accessible: {response.status_code}")
        if response.status_code == 401:
            print("   (401 expected - authentication required)")
    except Exception as e:
        print(f"❌ Failed to reach organizations endpoint: {e}")
    
    # Test 2: Check existing organizations in database
    orgs = Organization.objects.all()
    print(f"📊 Database has {orgs.count()} organizations:")
    for org in orgs:
        print(f"   - {org.name} (ID: {org.id}, Logo: {org.logo})")
    
    # Test 3: Check users with organizations
    users_with_orgs = CustomUser.objects.exclude(organization=None)
    print(f"👥 {users_with_orgs.count()} users have organizations assigned")
    
    print("\n🚀 API Testing complete!")

if __name__ == "__main__":
    test_organization_endpoints()
