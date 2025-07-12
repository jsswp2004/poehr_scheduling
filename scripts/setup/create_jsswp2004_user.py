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
    # Get the POWER IT organization
    org = Organization.objects.get(name='POWER IT')
    print(f"Found organization: {org.name}")

    # Check if user already exists
    if CustomUser.objects.filter(username='jsswp2004').exists():
        print("❌ User 'jsswp2004' already exists!")
        sys.exit(1)

    # Create the user
    user = CustomUser.objects.create_user(
        username='jsswp2004',
        email='jsswp2004@powerit.com',
        password='krat25Miko!',
        first_name='JSS',
        last_name='System Admin',
        role='system_admin',
        organization=org,
        organization_type='group',
        registered=True,
        is_staff=True,
        is_superuser=True
    )

    print(f'✅ Created user: {user.username} ({user.role}) in {user.organization.name}')
    print(f'📧 Email: {user.email}')
    print(f'🏢 Organization: {user.organization.name}')
    print(f'👤 Role: {user.role}')
    print(f'🔑 User ID: {user.id}')

except Organization.DoesNotExist:
    print("❌ POWER IT organization not found!")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error creating user: {e}")
    sys.exit(1)
