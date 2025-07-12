#!/usr/bin/env python
import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization
from django.contrib.auth.hashers import make_password

def create_admin_user():
    # Create POWER IT organization if it doesn't exist
    org, org_created = Organization.objects.get_or_create(
        name='POWER IT',
        defaults={
            'subscription_tier': 'enterprise',
            'is_active': True
        }
    )
    print(f'Organization: {org.name}, Created: {org_created}')

    # Create jsswp2004 user
    user, user_created = CustomUser.objects.get_or_create(
        username='jsswp2004',
        defaults={
            'email': 'jsswp2004@powerit.com',
            'password': make_password('krat25Miko!'),
            'first_name': 'JSSWP',
            'last_name': '2004',
            'organization': org,
            'role': 'system_admin',
            'is_staff': True,
            'is_superuser': True,
            'is_active': True
        }
    )
    print(f'User: {user.username}, Created: {user_created}')
    print(f'User role: {user.role}')
    print(f'User organization: {user.organization.name}')
    print(f'Is staff: {user.is_staff}')
    print(f'Is superuser: {user.is_superuser}')

if __name__ == '__main__':
    create_admin_user()
