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

from django.contrib.auth.hashers import make_password

def hash_password(password):
    """Hash a password using Django's default hasher"""
    hashed = make_password(password)
    return hashed

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python hash_password.py <password>")
        sys.exit(1)
    
    password = sys.argv[1]
    hashed = hash_password(password)
    print(f"Hashed password: {hashed}")
