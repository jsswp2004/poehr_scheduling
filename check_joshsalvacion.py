#!/usr/bin/env python3
"""
Check joshsalvacion user details
"""

import os
import sys
import django

# Django setup
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

def check_joshsalvacion():
    """Check joshsalvacion user details"""
    print("=" * 60)
    print("🔍 CHECKING JOSHSALVACION USER")
    print("=" * 60)
    
    try:
        # Find the user
        user = CustomUser.objects.filter(username='joshsalvacion').first()
        
        if user:
            print(f"✅ Found user: {user.username}")
            print("🔍 User details:")
            print(f"   ID: {user.id}")
            print(f"   Username: {user.username}")
            print(f"   Email: {user.email}")
            print(f"   First Name: {user.first_name}")
            print(f"   Last Name: {user.last_name}")
            print(f"   Role: {user.role}")
            print(f"   Is Active: {user.is_active}")
            print(f"   Is Staff: {user.is_staff}")
            print(f"   Is Superuser: {user.is_superuser}")
            print(f"   Organization: {user.organization}")
            print(f"   Date Joined: {user.date_joined}")
            print(f"   Last Login: {user.last_login}")
            
            # Check if password is set
            if user.password:
                print(f"   Password Set: Yes (length: {len(user.password)})")
            else:
                print(f"   Password Set: No")
                
        else:
            print("❌ User 'joshsalvacion' not found")
            
            # List all users for reference
            print("\n📋 Available users:")
            all_users = CustomUser.objects.all()[:10]  # Show first 10 users
            for u in all_users:
                print(f"   - {u.username} ({u.email}) - Role: {u.role}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    check_joshsalvacion()
