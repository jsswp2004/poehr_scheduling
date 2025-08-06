#!/usr/bin/env python3
"""
Emergency Admin User Creation Script for Azure Production
Run this script directly in the Azure Container Apps Console to create an admin user.

Usage: python create_admin_azure.py
"""

import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_azure_env')

# Initialize Django
django.setup()

def create_admin_user():
    """Create admin user for production access"""
    try:
        from users.models import CustomUser, Organization
        from django.contrib.auth.hashers import make_password
        
        print("🔧 Starting admin user creation...")
        
        # Check if admin user already exists
        if CustomUser.objects.filter(username='jsswp2004').exists():
            print("✅ Admin user 'jsswp2004' already exists!")
            admin_user = CustomUser.objects.get(username='jsswp2004')
            print(f"   User ID: {admin_user.id}")
            print(f"   Email: {admin_user.email}")
            print(f"   Is Staff: {admin_user.is_staff}")
            print(f"   Is Superuser: {admin_user.is_superuser}")
            print(f"   Organization: {admin_user.organization.name if admin_user.organization else 'None'}")
            return admin_user
        
        print("👤 Creating admin user...")
        
        # Get or create organization
        org, created = Organization.objects.get_or_create(
            name='POWER Health Systems',
            defaults={
                'organization_type': 'clinic',
                'address': 'Admin Office',
                'phone_number': '+1234567890',
                'subscription_tier': 'enterprise'
            }
        )
        
        if created:
            print(f"🏢 Created organization: {org.name}")
        else:
            print(f"🏢 Using existing organization: {org.name}")
        
        # Create admin user
        admin_user = CustomUser.objects.create(
            username='jsswp2004',
            email='jsswp2004@powerhealth.com',
            password=make_password('krat25Miko!'),
            is_staff=True,
            is_active=True,
            is_superuser=True,
            first_name='System',
            last_name='Administrator',
            role='system_admin',
            organization=org,
            phone_number='+1234567890'
        )
        
        print("✅ Admin user created successfully!")
        print(f"   Username: {admin_user.username}")
        print(f"   Email: {admin_user.email}")
        print(f"   Password: krat25Miko!")
        print(f"   Organization: {admin_user.organization.name}")
        print(f"   Role: {admin_user.role}")
        
        # Verify user can be authenticated
        from django.contrib.auth import authenticate
        auth_user = authenticate(username='jsswp2004', password='krat25Miko!')
        if auth_user:
            print("✅ User authentication test passed!")
        else:
            print("⚠️  User authentication test failed!")
        
        return admin_user
        
    except Exception as e:
        print(f"❌ Error creating admin user: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    print("🚀 Emergency Admin User Creation for Azure Production")
    print("=" * 50)
    
    try:
        admin_user = create_admin_user()
        if admin_user:
            print("\n🎉 SUCCESS! Admin user is ready.")
            print("\nYou can now log in with:")
            print("   Username: jsswp2004")
            print("   Password: krat25Miko!")
            print("\nAccess points:")
            print("   - Django Admin: https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/admin/")
            print("   - Frontend Login: https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/")
        else:
            print("\n❌ FAILED! Could not create admin user.")
            sys.exit(1)
    except Exception as e:
        print(f"\n💥 CRITICAL ERROR: {str(e)}")
        sys.exit(1)
