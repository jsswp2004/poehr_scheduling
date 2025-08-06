#!/usr/bin/env python
"""
Script to create a superuser in Azure production environment
Run this after deployment to create an admin user
"""
import os
import sys
import django
from django.conf import settings

# Configure Django settings for Azure production
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_azure_env')

# Setup Django
django.setup()

from users.models import CustomUser, Organization
from django.contrib.auth.hashers import make_password

def create_azure_superuser():
    """Create a superuser for Azure production"""
    
    # Admin credentials
    username = "jsswp2004"
    email = "jsswp2004@powerhealth.com"
    password = "krat25Miko!"
    
    try:
        # Check if user already exists
        if CustomUser.objects.filter(username=username).exists():
            print(f"Superuser '{username}' already exists!")
            user = CustomUser.objects.get(username=username)
            print(f"User details: {user.username} - {user.email} - Role: {user.role}")
            return True
        
        # Get or create an organization for the admin user
        org, created = Organization.objects.get_or_create(
            name="POWER Health Systems",
            defaults={
                'organization_type': 'clinic',
                'address': 'Admin Office',
                'phone_number': '+1234567890',
                'subscription_tier': 'enterprise'
            }
        )
        
        if created:
            print(f"Created organization: {org.name}")
        else:
            print(f"Using existing organization: {org.name}")
        
        # Create the superuser
        user = CustomUser.objects.create(
            username=username,
            email=email,
            password=make_password(password),
            is_staff=True,
            is_active=True,
            is_superuser=True,
            first_name="System",
            last_name="Administrator",
            role="system_admin",
            organization=org,
            phone_number="+1234567890"
        )
        
        print(f"Azure production superuser created successfully!")
        print(f"Username: {username}")
        print(f"Email: {email}")
        print(f"Role: {user.role}")
        print(f"Organization: {org.name}")
        print("✅ User can now log in to the application!")
        print("🔐 Django Admin access: /admin/")
        print("🌐 Application access: /login")
        return True
        
    except Exception as e:
        print(f"Error creating superuser: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Creating Azure production superuser...")
    create_azure_superuser()
