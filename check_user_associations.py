#!/usr/bin/env python3
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

print("=== All Users with IDs and Usernames ===")
users = CustomUser.objects.all()
for user in users:
    print(f"ID: {user.id:2} | Username: {user.username:20} | Email: {user.email:30} | Active: {user.is_active}")
