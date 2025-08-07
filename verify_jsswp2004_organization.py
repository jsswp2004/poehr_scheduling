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

def verify_user_organization():
    """Verify jsswp2004's current organization details"""
    
    print("🔍 Verifying jsswp2004's organization details...")
    
    with connection.cursor() as cursor:
        try:
            # Get user details with organization info
            cursor.execute("""
                SELECT 
                    u.id,
                    u.username,
                    u.email,
                    u.first_name,
                    u.last_name,
                    u.role,
                    u.organization_id,
                    o.name as org_name,
                    o.created_at as org_created,
                    u.is_active,
                    u.is_staff,
                    u.is_superuser
                FROM users_customuser u
                LEFT JOIN users_organization o ON u.organization_id = o.id
                WHERE u.username = %s
            """, ['jsswp2004'])
            
            result = cursor.fetchone()
            if not result:
                print("❌ User 'jsswp2004' not found!")
                return False
                
            (user_id, username, email, first_name, last_name, role, 
             org_id, org_name, org_created, is_active, is_staff, is_superuser) = result
            
            print("✅ User Details:")
            print(f"   ID: {user_id}")
            print(f"   Username: {username}")
            print(f"   Email: {email}")
            print(f"   Name: {first_name} {last_name}")
            print(f"   Role: {role}")
            print(f"   Active: {is_active}")
            print(f"   Staff: {is_staff}")
            print(f"   Superuser: {is_superuser}")
            
            print("\n🏢 Organization Details:")
            print(f"   Organization ID: {org_id}")
            print(f"   Organization Name: {org_name}")
            print(f"   Organization Created: {org_created}")
            
            # Also check all organizations
            print("\n📋 All Organizations:")
            cursor.execute("SELECT id, name, created_at FROM users_organization ORDER BY id")
            orgs = cursor.fetchall()
            for org in orgs:
                print(f"   {org[0]}: {org[1]} (created: {org[2]})")
            
            # Check how many users are in POWER IT organization
            if org_id:
                cursor.execute("""
                    SELECT COUNT(*), string_agg(username, ', ')
                    FROM users_customuser 
                    WHERE organization_id = %s
                """, [org_id])
                count_result = cursor.fetchone()
                print(f"\n👥 Users in '{org_name}' organization:")
                print(f"   Count: {count_result[0]}")
                print(f"   Users: {count_result[1]}")
                
            return True
            
        except Exception as e:
            print(f"❌ Error verifying organization: {e}")
            return False

if __name__ == "__main__":
    success = verify_user_organization()
    if success:
        print("\n🎉 Verification completed successfully!")
    else:
        print("\n💔 Verification failed!")
        sys.exit(1)
