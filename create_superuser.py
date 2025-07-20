#!/usr/bin/env python3
"""
Create a Django superuser for admin access
"""

import os
import sys
import django

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization

def create_superuser():
    """Create a superuser for Django admin access"""
    
    # Create or get organization
    org, created = Organization.objects.get_or_create(
        name='POWER IT',
        defaults={
            'subscription_tier': 'enterprise',
            'is_active': True
        }
    )
    
    if created:
        print(f"✅ Created organization: {org.name}")
    else:
        print(f"📁 Found existing organization: {org.name}")
    
    # Check if superuser already exists
    username = 'admin'
    if CustomUser.objects.filter(username=username).exists():
        print(f"❌ User '{username}' already exists!")
        # Update existing user to be superuser
        user = CustomUser.objects.get(username=username)
        user.is_staff = True
        user.is_superuser = True
        user.role = 'system_admin'
        user.organization = org
        user.save()
        print(f"🔄 Updated existing user '{username}' to superuser")
    else:
        # Create new superuser
        user = CustomUser.objects.create_user(
            username=username,
            email='admin@powerit.com',
            password='admin123',  # Change this password immediately after login
            first_name='System',
            last_name='Administrator',
            role='system_admin',
            organization=org,
            organization_type='group',
            registered=True,
            is_staff=True,
            is_superuser=True,
            is_active=True
        )
        print(f"✅ Created new superuser: {user.username}")
    
    # Display login credentials
    print("\n" + "="*50)
    print("🔐 DJANGO ADMIN LOGIN CREDENTIALS")
    print("="*50)
    print(f"👤 Username: {user.username}")
    print(f"🔑 Password: admin123")
    print(f"🌐 Admin URL: http://3.88.225.231:8000/admin/")
    print(f"📧 Email: {user.email}")
    print(f"👑 Role: {user.role}")
    print(f"🏢 Organization: {user.organization.name}")
    print(f"⚡ Staff Status: {user.is_staff}")
    print(f"🔐 Superuser Status: {user.is_superuser}")
    print("="*50)
    print("⚠️  IMPORTANT: Change the password after first login!")
    print("="*50)

if __name__ == "__main__":
    try:
        create_superuser()
    except Exception as e:
        print(f"❌ Error creating superuser: {e}")
        sys.exit(1)
