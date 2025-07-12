#!/usr/bin/env python
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

print("=== Checking Users in Database ===")
users = CustomUser.objects.all()
print(f"Total users: {users.count()}")

if users.exists():
    print("\nFirst 5 users:")
    for user in users[:5]:
        print(f"  Email: {user.email}")
        print(f"  Role: {user.role}")
        print(f"  Active: {user.is_active}")
        print("  ---")
else:
    print("No users found in database!")
    print("\nCreating a test admin user...")
    
    # Create a test admin user
    test_user = CustomUser.objects.create_user(
        email='admin@test.com',
        password='testpass123',
        first_name='Test',
        last_name='Admin',
        role='admin'
    )
    print(f"✅ Created test user: {test_user.email} with password: testpass123")
