#!/usr/bin/env python3
"""
Reset password for daniellebishop user and test login
"""

import os
import sys
import django

# Django setup
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

def reset_daniellebishop_password():
    """Reset password and test login"""
    print("=" * 60)
    print("🔐 RESETTING DANIELLEBISHOP PASSWORD")
    print("=" * 60)
    
    try:
        # Find the user
        user = CustomUser.objects.get(username='daniellebishop')
        print(f"✅ Found user: {user.username} ({user.email})")
        
        # Set a known password
        new_password = 'testpass123'
        user.set_password(new_password)
        user.save()
        
        print(f"✅ Password reset to: {new_password}")
        print("🔍 User details after password reset:")
        print(f"   ID: {user.id}")
        print(f"   Username: {user.username}")
        print(f"   Email: {user.email}")
        print(f"   First Name: {user.first_name}")
        print(f"   Last Name: {user.last_name}")
        print(f"   Role: {user.role}")
        print(f"   Active: {user.is_active}")
        print(f"   Organization: {user.organization}")
        
        print(f"\n✅ You can now login with:")
        print(f"   Username: daniellebishop")
        print(f"   Password: {new_password}")
        
    except CustomUser.DoesNotExist:
        print("❌ User 'daniellebishop' does not exist")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    reset_daniellebishop_password()
