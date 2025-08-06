#!/usr/bin/env python3

import os
import sys
import django
from datetime import datetime, timezone

# Add the project root to the Python path
sys.path.append('/code')

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_azure_env')
django.setup()

from django.db import connection
from django.contrib.auth.hashers import make_password

def create_admin_user():
    print("Creating admin user with all required fields...")
    
    # First, check if organization exists
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, name FROM organizations_organization LIMIT 1")
        org_result = cursor.fetchone()
        
        if not org_result:
            print("❌ No organization found! Creating one first...")
            cursor.execute("""
                INSERT INTO organizations_organization (name, logo, created_at) 
                VALUES (%s, %s, %s) RETURNING id
            """, ['POWER Health Systems', '', datetime.now(timezone.utc)])
            org_id = cursor.fetchone()[0]
            print(f"✅ Created organization with ID: {org_id}")
        else:
            org_id = org_result[0]
            print(f"📋 Using organization: {org_result[1]} (ID: {org_id})")
    
    # Create admin user with ALL required NOT NULL fields
    username = 'jsswp2004'
    password = 'krat25Miko!'
    hashed_password = make_password(password)
    now = datetime.now(timezone.utc)
    
    with connection.cursor() as cursor:
        # Check if user already exists
        cursor.execute("SELECT id FROM users_customuser WHERE username = %s", [username])
        if cursor.fetchone():
            print(f"❌ User '{username}' already exists!")
            return
        
        # Insert with ALL required NOT NULL fields
        insert_sql = """
            INSERT INTO users_customuser (
                password, is_superuser, username, first_name, last_name, 
                email, is_staff, is_active, date_joined, role, organization_id, 
                organization_type, registered, subscription_status, subscription_tier, 
                is_online
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            ) RETURNING id
        """
        
        values = [
            hashed_password,        # password (NOT NULL)
            True,                   # is_superuser (NOT NULL)
            username,               # username (NOT NULL)
            'System',               # first_name (NOT NULL)
            'Administrator',        # last_name (NOT NULL)
            f'{username}@powerhealth.com',  # email (NOT NULL)
            True,                   # is_staff (NOT NULL)
            True,                   # is_active (NOT NULL)
            now,                    # date_joined (NOT NULL)
            'system_admin',         # role (NOT NULL)
            org_id,                 # organization_id (nullable but we have one)
            'clinic',               # organization_type (NOT NULL)
            True,                   # registered (NOT NULL) - THIS WAS MISSING!
            'active',               # subscription_status (NOT NULL)
            'premium',              # subscription_tier (NOT NULL)
            True                    # is_online (NOT NULL)
        ]
        
        try:
            cursor.execute(insert_sql, values)
            user_id = cursor.fetchone()[0]
            print(f"✅ Successfully created admin user!")
            print(f"   Username: {username}")
            print(f"   Password: {password}")
            print(f"   User ID: {user_id}")
            print(f"   Organization: {org_id}")
            print("\n🎉 Admin user creation completed successfully!")
            
        except Exception as e:
            print(f"❌ Error creating user: {e}")
            raise

if __name__ == '__main__':
    create_admin_user()
