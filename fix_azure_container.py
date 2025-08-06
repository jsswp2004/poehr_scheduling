#!/usr/bin/env python3

import os
import sys
import django
from django.core.management import execute_from_command_line

def main():
    """Fix Azure container by running migrations and checking admin user"""
    
    # Set Azure settings
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_azure_env')
    
    # Set Azure database password
    os.environ['DB_PASSWORD'] = 'krat25Miko!'
    
    print("🔧 Setting up Django with Azure settings...")
    django.setup()
    
    print("🔄 Running Django migrations...")
    try:
        execute_from_command_line(['manage.py', 'migrate'])
        print("✅ Migrations completed successfully!")
    except Exception as e:
        print(f"❌ Migration error: {e}")
        return False
    
    print("👤 Checking admin user...")
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        admin_user = User.objects.filter(username='jsswp2004').first()
        if admin_user:
            print(f"✅ Admin user exists: {admin_user.username}")
            print(f"   - Is superuser: {admin_user.is_superuser}")
            print(f"   - Is staff: {admin_user.is_staff}")
            print(f"   - Is active: {admin_user.is_active}")
        else:
            print("❌ Admin user not found!")
            return False
            
    except Exception as e:
        print(f"❌ Error checking admin user: {e}")
        return False
    
    print("\n🎉 Azure container setup completed!")
    print("🌐 You can now try logging in with:")
    print("   Username: jsswp2004")
    print("   Password: krat25Miko!")
    
    return True

if __name__ == '__main__':
    main()
