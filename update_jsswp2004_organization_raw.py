#!/usr/bin/env python3
import os
import sys
import django
from django.db import connection

# Add the project directory to Python path
project_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_dir)

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

def update_user_organization_raw():
    """Update jsswp2004's organization to 'POWER IT' using raw SQL"""
    
    print("🔍 Updating jsswp2004's organization to 'POWER IT' using raw SQL...")
    
    with connection.cursor() as cursor:
        try:
            # First, check if 'POWER IT' organization exists
            cursor.execute("SELECT id, name FROM users_organization WHERE name = %s", ['POWER IT'])
            org_result = cursor.fetchone()
            
            if not org_result:
                print("Creating 'POWER IT' organization...")
                cursor.execute("""
                    INSERT INTO users_organization (name, logo, created_at) 
                    VALUES (%s, %s, %s) RETURNING id
                """, ['POWER IT', '', 'now()'])
                org_id = cursor.fetchone()[0]
                print(f"✅ Created new organization: POWER IT (ID: {org_id})")
            else:
                org_id = org_result[0]
                print(f"📋 Found existing organization: {org_result[1]} (ID: {org_id})")
            
            # Check current user info
            cursor.execute("""
                SELECT id, username, email, role, organization_id 
                FROM users_customuser 
                WHERE username = %s
            """, ['jsswp2004'])
            
            user_result = cursor.fetchone()
            if not user_result:
                print("❌ User 'jsswp2004' not found!")
                
                # Show available users
                print("\n📋 Available users:")
                cursor.execute("SELECT username, role, organization_id FROM users_customuser")
                users = cursor.fetchall()
                for user in users:
                    print(f"   - {user[0]} ({user[1]}) - Org ID: {user[2]}")
                return False
            
            user_id, username, email, role, current_org_id = user_result
            print(f"👤 Found user: {username}")
            print(f"   Email: {email}")
            print(f"   Role: {role}")
            print(f"   Current organization ID: {current_org_id}")
            
            # Update the user's organization
            cursor.execute("""
                UPDATE users_customuser 
                SET organization_id = %s 
                WHERE username = %s
            """, [org_id, 'jsswp2004'])
            
            print(f"✅ Successfully updated user organization!")
            print(f"   Changed from organization ID: {current_org_id}")
            print(f"   Changed to organization ID: {org_id} (POWER IT)")
            
            # Verify the change
            cursor.execute("""
                SELECT u.username, u.email, u.role, u.organization_id, o.name as org_name
                FROM users_customuser u
                LEFT JOIN users_organization o ON u.organization_id = o.id
                WHERE u.username = %s
            """, ['jsswp2004'])
            
            verification = cursor.fetchone()
            if verification:
                print(f"\n🔍 Verification:")
                print(f"   Username: {verification[0]}")
                print(f"   Email: {verification[1]}")
                print(f"   Role: {verification[2]}")
                print(f"   Organization ID: {verification[3]}")
                print(f"   Organization Name: {verification[4]}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error updating organization: {e}")
            return False

if __name__ == "__main__":
    success = update_user_organization_raw()
    if success:
        print("\n🎉 Organization update completed successfully!")
    else:
        print("\n💔 Organization update failed!")
        sys.exit(1)
