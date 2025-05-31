#!/usr/bin/env python
import os
import django
import requests
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser
from rest_framework_simplejwt.tokens import RefreshToken

# Get a system admin user
system_admin = CustomUser.objects.filter(role='system_admin').first()
if not system_admin:
    print("No system admin found")
    exit()

# Generate token
token = RefreshToken.for_user(system_admin).access_token

# Test the API
headers = {'Authorization': f'Bearer {token}'}
response = requests.get('http://127.0.0.1:8000/api/users/organizations/', headers=headers)

print("Status Code:", response.status_code)
print("Response:")
data = response.json()
for org in data:
    print(f"- {org['name']}: logo = {org.get('logo', 'None')}")
