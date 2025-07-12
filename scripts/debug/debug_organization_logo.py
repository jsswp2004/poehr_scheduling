#!/usr/bin/env python3
"""
Debug script to check organization data and logo field in the database
"""
import os
import sys
import django

# Add the current directory to the Python path
sys.path.append('c:/Users/jsswp/POWER/poehr_scheduling')

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from users.models import Organization
import jwt
from datetime import datetime, timedelta
from django.conf import settings

User = get_user_model()

def check_organization_data():
    print("=== Organization Debug Information ===")
    
    # List all organizations
    organizations = Organization.objects.all()
    print(f"Total organizations: {organizations.count()}")
    
    for org in organizations:
        print(f"\nOrganization ID: {org.id}")
        print(f"Name: {org.name}")
        print(f"Logo field: {org.logo}")
        print(f"Logo URL: {org.logo.url if org.logo else 'None'}")
        print(f"Logo path: {org.logo.path if org.logo else 'None'}")
        
        # Check if file exists on disk
        if org.logo:
            import os
            if os.path.exists(org.logo.path):
                print(f"Logo file exists on disk: YES")
                print(f"File size: {os.path.getsize(org.logo.path)} bytes")
            else:
                print(f"Logo file exists on disk: NO")
        print("-" * 50)

def check_user_tokens():
    print("\n=== User Token Debug Information ===")
    
    # Check a specific user and their organization
    user = User.objects.filter(username='jsswp2004').first()
    if user:
        print(f"User: {user.username}")
        print(f"User organization: {user.organization}")
        print(f"User organization ID: {user.organization.id if user.organization else 'None'}")
        
        if user.organization and user.organization.logo:
            print(f"User's org logo URL: {user.organization.logo.url}")
    else:
        print("User jsswp2004 not found")

if __name__ == '__main__':
    check_organization_data()
    check_user_tokens()
