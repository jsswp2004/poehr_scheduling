#!/usr/bin/env python
"""
Test script to verify user API returns correct organization logo
"""
import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization
from users.serializers import UserSerializer

def test_user_organization_logo():
    print("🧪 Testing User Organization Logo API")
    print("=" * 50)
    
    # Find users with organizations that have logos
    users_with_org_logos = CustomUser.objects.filter(
        organization__isnull=False, 
        organization__logo__isnull=False
    ).exclude(organization__logo='')
    
    print(f"👥 Found {users_with_org_logos.count()} users with organization logos")
    
    for user in users_with_org_logos[:3]:  # Test first 3 users
        print(f"\n👤 User: {user.username} ({user.first_name} {user.last_name})")
        print(f"   Organization: {user.organization.name} (ID: {user.organization.id})")
        print(f"   Organization Logo File: {user.organization.logo}")
        
        # Test the serializer
        serializer = UserSerializer(user)
        data = serializer.data
        
        print(f"   Serialized organization_logo: {data.get('organization_logo')}")
        print(f"   Serialized organization_name: {data.get('organization_name')}")
        
        # Verify the logo file exists
        if user.organization.logo:
            logo_path = user.organization.logo.path
            if os.path.exists(logo_path):
                print(f"   ✅ Logo file exists: {logo_path}")
                print(f"   📏 File size: {os.path.getsize(logo_path)} bytes")
            else:
                print(f"   ❌ Logo file missing: {logo_path}")
    
    # Test users without organization logos
    users_without_logos = CustomUser.objects.filter(
        organization__isnull=False
    ).filter(
        models.Q(organization__logo__isnull=True) | models.Q(organization__logo='')
    )
    
    print(f"\n📊 Users with organizations but no logos: {users_without_logos.count()}")
    if users_without_logos.exists():
        sample_user = users_without_logos.first()
        print(f"   Sample: {sample_user.username} - Org: {sample_user.organization.name}")
        serializer = UserSerializer(sample_user)
        print(f"   Serialized organization_logo: {serializer.data.get('organization_logo')}")
    
    print(f"\n✅ User organization logo test complete!")

if __name__ == "__main__":
    from django.db import models
    test_user_organization_logo()
