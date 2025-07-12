#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to Python path
sys.path.append('/code')

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization

try:
    # First, create POWER IT organization if it doesn't exist
    power_org, created = Organization.objects.get_or_create(
        name='POWER IT',
        defaults={'created_at': django.utils.timezone.now()}
    )
    
    if created:
        print(f"✅ Created organization: {power_org.name}")
    else:
        print(f"📁 Found existing organization: {power_org.name}")

    # Check if user already exists
    if CustomUser.objects.filter(username='jsswp2004').exists():
        print("❌ User 'jsswp2004' already exists!")
        # Update existing user to system_admin
        user = CustomUser.objects.get(username='jsswp2004')
        user.role = 'system_admin'
        user.organization = power_org
        user.organization_type = 'group'
        user.is_staff = True
        user.is_superuser = True
        user.save()
        print(f"🔄 Updated existing user to system_admin role")
    else:
        # Create the user
        user = CustomUser.objects.create_user(
            username='jsswp2004',
            email='jsswp2004@powerit.com',
            password='krat25Miko!',
            first_name='JSS',
            last_name='System Admin',
            role='system_admin',
            organization=power_org,
            organization_type='group',
            registered=True,
            is_staff=True,
            is_superuser=True
        )
        print(f'✅ Created new user: {user.username}')

    print(f'👤 Username: {user.username}')
    print(f'📧 Email: {user.email}')
    print(f'🏢 Organization: {user.organization.name}')
    print(f'👑 Role: {user.role}')
    print(f'🔑 User ID: {user.id}')
    print(f'⚡ Staff Status: {user.is_staff}')
    print(f'🔐 Superuser Status: {user.is_superuser}')

except Exception as e:
    print(f"❌ Error creating user: {e}")
    sys.exit(1)
