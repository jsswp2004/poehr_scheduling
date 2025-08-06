#!/bin/bash
# Quick Admin User Creation for Azure Container Apps Console
# Copy and paste this entire script into the Azure Container Apps Console

# Set Django environment
export DJANGO_SETTINGS_MODULE="poehr_scheduling_backend.settings_azure_env"

# Create admin user via Python inline script
python -c "
import os
import django
django.setup()

from users.models import CustomUser, Organization
from django.contrib.auth.hashers import make_password

print('🔧 Creating admin user...')

try:
    # Check if admin exists
    if CustomUser.objects.filter(username='jsswp2004').exists():
        print('✅ Admin user already exists!')
        exit()
    
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
    
    # Create admin user
    admin = CustomUser.objects.create(
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
    
    print(f'✅ SUCCESS! Admin user created: {admin.username}')
    print('Login at: https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/')
    print('Username: jsswp2004')
    print('Password: krat25Miko!')
    
except Exception as e:
    print(f'❌ Error: {e}')
    import traceback
    traceback.print_exc()
"
