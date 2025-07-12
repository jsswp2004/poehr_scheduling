#!/usr/bin/env python3
"""
Debug script to check joshsalvacion's password and test authentication
"""

import os
import sys
import django

# Django setup
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

def debug_joshsalvacion_password():
    """Debug joshsalvacion's password"""
    print("=" * 60)
    print("🔍 DEBUGGING JOSHSALVACION PASSWORD")
    print("=" * 60)
    
    try:
        user = CustomUser.objects.get(username='joshsalvacion')
        print(f"✅ Found user: {user.username}")
        
        # Test different possible passwords
        test_passwords = [
            'registrar123',
            'krat25Miko!',
            'testpass123',
            'password123',
            'changeme123',
            'joshsalvacion',
            ''
        ]
        
        print("\n🔐 Testing passwords:")
        for password in test_passwords:
            if user.check_password(password):
                print(f"✅ FOUND WORKING PASSWORD: '{password}'")
                break
            else:
                print(f"❌ '{password}' - incorrect")
        else:
            print("❌ None of the test passwords worked")
            
        print(f"\n📋 User details:")
        print(f"   ID: {user.id}")
        print(f"   Username: {user.username}")
        print(f"   Email: {user.email}")
        print(f"   Active: {user.is_active}")
        print(f"   Staff: {user.is_staff}")
        print(f"   Role: {user.role}")
        
    except CustomUser.DoesNotExist:
        print("❌ User 'joshsalvacion' does not exist")

if __name__ == "__main__":
    debug_joshsalvacion_password()
