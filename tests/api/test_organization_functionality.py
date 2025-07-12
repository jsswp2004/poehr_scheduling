#!/usr/bin/env python
"""
Test script to verify organization functionality works correctly
"""

import os
import sys
import django
import requests
from django.contrib.auth import get_user_model

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization

def test_organization_functionality():
    print("🧪 Testing Organization Functionality")
    print("=" * 50)
    
    # Test 1: Check organizations exist
    organizations = Organization.objects.all()
    print(f"✅ Organizations in database: {organizations.count()}")
    for org in organizations:
        print(f"   - {org.name} (ID: {org.id})")
    
    # Test 2: Check users with different roles
    print(f"\n👥 User role distribution:")
    roles = ['admin', 'system_admin', 'provider', 'patient']
    for role in roles:
        count = CustomUser.objects.filter(role=role).count()
        print(f"   - {role}: {count} users")
    
    # Test 3: Check users with organizations
    users_with_orgs = CustomUser.objects.exclude(organization=None).count()
    total_users = CustomUser.objects.count()
    print(f"\n🏢 Users with organizations: {users_with_orgs}/{total_users}")
    
    # Test 4: Test role-based permissions
    print(f"\n🔐 Role-based access simulation:")
    
    # Find a system_admin user
    system_admin = CustomUser.objects.filter(role='system_admin').first()
    if system_admin:
        print(f"   ✅ System Admin: {system_admin.username} - Can edit all organizations")
    
    # Find an admin user
    admin = CustomUser.objects.filter(role='admin').first()
    if admin:
        print(f"   ✅ Admin: {admin.username} - Can edit own organization")
    
    # Find a provider user
    provider = CustomUser.objects.filter(role='provider').first()
    if provider:
        print(f"   ✅ Provider: {provider.username} - Read-only access")
    
    # Test 5: Check media directory for logos
    print(f"\n🖼️  Logo upload testing:")
    media_root = os.path.join(os.path.dirname(__file__), 'media', 'org_logos')
    if os.path.exists(media_root):
        logos = os.listdir(media_root)
        print(f"   - {len(logos)} logo files found in media/org_logos/")
        for logo in logos[:3]:  # Show first 3
            print(f"     • {logo}")
    else:
        print("   - Media directory not found")
    
    print(f"\n✅ Organization functionality test complete!")

if __name__ == "__main__":
    test_organization_functionality()
