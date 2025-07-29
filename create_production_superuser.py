#!/usr/bin/env python
"""
Script to create a superuser in production environment
Run this after deployment to create an admin user
"""
import os
import sys
import django
from django.conf import settings

# Configure Django settings for production
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')

# Setup Django
django.setup()

from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password

def create_production_superuser():
    """Create a superuser for production"""
    
    # Admin credentials
    username = "jsswp2004"
    email = "jsswp2004@powerhealth.com"
    password = "krat25Miko!"
    
    try:
        # Check if user already exists
        if User.objects.filter(username=username).exists():
            print(f"Superuser '{username}' already exists!")
            user = User.objects.get(username=username)
            print(f"User details: {user.username} - {user.email}")
            return True
        
        # Create the superuser
        user = User.objects.create(
            username=username,
            email=email,
            password=make_password(password),
            is_staff=True,
            is_active=True,
            is_superuser=True,
            first_name="System",
            last_name="Administrator"
        )
        
        print(f"Production superuser created successfully!")
        print(f"Username: {username}")
        print(f"Email: {email}")
        print(f"Password: {password}")
        print("⚠️  IMPORTANT: Change this password immediately after first login!")
        print("Access admin at: https://your-domain.com/admin/")
        return True
        
    except Exception as e:
        print(f"Error creating superuser: {e}")
        return False

if __name__ == "__main__":
    create_production_superuser()
