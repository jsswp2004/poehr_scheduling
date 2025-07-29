#!/usr/bin/env python
import os
import sys
import django
from django.conf import settings

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Configure Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')

# Setup Django
django.setup()

from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password

def create_superuser(username, email, password):
    """Create a superuser"""
    try:
        # Check if user already exists
        if User.objects.filter(username=username).exists():
            print(f"User '{username}' already exists!")
            return False
        
        # Create the superuser
        user = User.objects.create(
            username=username,
            email=email,
            password=make_password(password),
            is_staff=True,
            is_active=True,
            is_superuser=True
        )
        
        print(f"Superuser '{username}' created successfully!")
        print(f"Email: {email}")
        print("You can now log in to the Django admin at /admin/")
        return True
        
    except Exception as e:
        print(f"Error creating superuser: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python create_superuser.py <username> <email> <password>")
        print("Example: python create_superuser.py admin admin@example.com mypassword123")
        sys.exit(1)
    
    username = sys.argv[1]
    email = sys.argv[2]
    password = sys.argv[3]
    
    create_superuser(username, email, password)
