#!/usr/bin/env python3
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

print("=== Looking for daniellebishop ===")
try:
    user = CustomUser.objects.get(username='daniellebishop')
    print(f"✅ Found daniellebishop:")
    print(f"   ID: {user.id}")
    print(f"   Username: {user.username}")
    print(f"   Email: {user.email}")
    print(f"   Active: {user.is_active}")
    print(f"   Staff: {user.is_staff}")
except CustomUser.DoesNotExist:
    print("❌ daniellebishop user not found")
    
print(f"\n=== All users with 'daniel' in username ===")
users = CustomUser.objects.filter(username__icontains='daniel')
for user in users:
    print(f"ID: {user.id}, Username: {user.username}, Email: {user.email}")
