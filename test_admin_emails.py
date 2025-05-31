#!/usr/bin/env python3
"""
Test script to verify admin email notification setup
"""
import os
import sys
import django

# Add project root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization
from users.serializers import get_admin_emails

def test_admin_email_setup():
    print("🔍 Testing Admin Email Notification Setup\n")
    
    # Test 1: Check existing users and roles
    print("📊 Current Users by Role:")
    roles = ['system_admin', 'admin', 'doctor', 'patient', 'registrar', 'receptionist']
    for role in roles:
        count = CustomUser.objects.filter(role=role).count()
        print(f"   {role}: {count} users")
    
    print()
    
    # Test 2: Check organizations and their admins
    print("🏢 Organizations and their Admins:")
    organizations = Organization.objects.all()
    for org in organizations:
        print(f"\n   Organization: {org.name}")
        
        # Find admins for this org
        org_admins = CustomUser.objects.filter(role='admin', organization=org)
        if org_admins.exists():
            for admin in org_admins:
                print(f"      Admin: {admin.first_name} {admin.last_name} ({admin.email})")
        else:
            print("      No admins found for this organization")
    
    print()
    
    # Test 3: Check system admins
    print("👑 System Admins:")
    system_admins = CustomUser.objects.filter(role='system_admin')
    if system_admins.exists():
        for admin in system_admins:
            org_name = admin.organization.name if admin.organization else "No Organization"
            print(f"   {admin.first_name} {admin.last_name} ({admin.email}) - {org_name}")
    else:
        print("   No system admins found")
    
    print()
    
    # Test 4: Test the get_admin_emails function
    print("📧 Testing get_admin_emails function:")
    
    # Test without organization
    all_emails = get_admin_emails()
    print(f"   All admin emails (no specific org): {all_emails}")
    
    # Test with each organization
    for org in organizations:
        org_emails = get_admin_emails(organization=org)
        print(f"   Admin emails for {org.name}: {org_emails}")
    
    print()
    
    # Test 5: Check email configuration
    print("⚙️  Email Configuration:")
    from django.conf import settings
    
    print(f"   EMAIL_HOST: {getattr(settings, 'EMAIL_HOST', 'Not configured')}")
    print(f"   EMAIL_PORT: {getattr(settings, 'EMAIL_PORT', 'Not configured')}")
    print(f"   EMAIL_USE_TLS: {getattr(settings, 'EMAIL_USE_TLS', 'Not configured')}")
    print(f"   EMAIL_HOST_USER: {'***configured***' if getattr(settings, 'EMAIL_HOST_USER', None) else 'Not configured'}")
    print(f"   DEFAULT_FROM_EMAIL: {getattr(settings, 'DEFAULT_FROM_EMAIL', 'Not configured')}")
    print(f"   ADMIN_EMAIL (fallback): {getattr(settings, 'ADMIN_EMAIL', 'Not configured')}")
    
    print("\n✅ Admin email setup test completed!")

if __name__ == '__main__':
    test_admin_email_setup()
