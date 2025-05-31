#!/usr/bin/env python
"""
Check organization logos and their relationship to organization IDs
"""

import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import Organization, CustomUser

def check_organization_logos():
    print("🔍 Checking Organization Logos and IDs")
    print("=" * 50)
    
    # Get all organizations
    organizations = Organization.objects.all()
    
    print(f"📊 Total Organizations: {organizations.count()}")
    print()
    
    for org in organizations:
        print(f"🏢 Organization ID: {org.id}")
        print(f"   Name: {org.name}")
        print(f"   Logo: {org.logo if org.logo else 'No logo'}")
        print(f"   Logo Path: {org.logo.url if org.logo else 'N/A'}")
        print(f"   Created: {org.created_at}")
        
        # Check if logo file exists
        if org.logo:
            logo_path = os.path.join(os.path.dirname(__file__), 'media', str(org.logo))
            file_exists = os.path.exists(logo_path)
            print(f"   File Exists: {'✅ Yes' if file_exists else '❌ No'}")
            if file_exists:
                file_size = os.path.getsize(logo_path)
                print(f"   File Size: {file_size} bytes")
        
        # Count users in this organization
        user_count = CustomUser.objects.filter(organization=org).count()
        print(f"   Users in Org: {user_count}")
        print()
    
    print("🗂️  Logo Files in media/org_logos/:")
    logo_dir = os.path.join(os.path.dirname(__file__), 'media', 'org_logos')
    if os.path.exists(logo_dir):
        logo_files = os.listdir(logo_dir)
        for logo_file in logo_files:
            # Check if this logo is referenced by any organization
            is_used = Organization.objects.filter(logo__icontains=logo_file).exists()
            print(f"   📄 {logo_file} - {'✅ Used' if is_used else '❌ Orphaned'}")
    else:
        print("   ❌ Logo directory not found")
    
    print("\n✅ Organization logo check complete!")

if __name__ == "__main__":
    check_organization_logos()
