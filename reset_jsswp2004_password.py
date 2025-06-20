#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to Python path
sys.path.append('/code')

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

try:
    # Get the user
    user = CustomUser.objects.get(username='jsswp2004')
    
    # Reset the password
    user.set_password('krat25Miko!')
    user.save()
    
    print(f"✅ Password reset successfully for user: {user.username}")
    print(f"📧 Email: {user.email}")
    print(f"👑 Role: {user.role}")
    print(f"🔐 Is Active: {user.is_active}")
    print(f"⚡ Is Staff: {user.is_staff}")
    print(f"🔑 Is Superuser: {user.is_superuser}")
    print("\n🔐 Login Credentials:")
    print(f"   Username: {user.username}")
    print(f"   Password: krat25Miko!")

except CustomUser.DoesNotExist:
    print("❌ User 'jsswp2004' not found!")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error resetting password: {e}")
    sys.exit(1)
