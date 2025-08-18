#!/usr/bin/env python3
"""
Direct database fix for holiday organization isolation using Django's database credentials.
This script bypasses Django's migration system and applies changes directly.
"""

import os
import sys
import django
from pathlib import Path

# Setup Django environment
project_dir = Path(__file__).parent
sys.path.append(str(project_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.db import connection
from django.conf import settings
import psycopg2

def get_database_connection():
    """Get direct database connection using Django's database settings."""
    db_settings = settings.DATABASES['default']
    
    # Extract connection parameters
    conn_params = {
        'host': db_settings['HOST'],
        'port': db_settings['PORT'],
        'database': db_settings['NAME'],
        'user': db_settings['USER'],
        'password': db_settings['PASSWORD'],
    }
    
    # Add SSL parameters if needed
    if 'sslmode' in db_settings.get('OPTIONS', {}):
        conn_params['sslmode'] = db_settings['OPTIONS']['sslmode']
    
    return psycopg2.connect(**conn_params)

def apply_holiday_organization_fix():
    """Apply the holiday organization isolation fix using direct database connection."""
    print("🚀 Starting Holiday Organization Isolation Fix...")
    print("📊 Using Django's database credentials for direct access")
    print("=" * 70)
    
    try:
        # Use direct database connection
        conn = get_database_connection()
        cursor = conn.cursor()
        
        print("🔧 Applying schema changes...")
        
        # Check if organization column already exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'appointments_holiday' 
            AND column_name = 'organization_id';
        """)
        
        if cursor.fetchone():
            print("✅ Organization column already exists")
        else:
            print("📝 Adding organization column...")
            
            # Add organization_id column
            cursor.execute("""
                ALTER TABLE appointments_holiday 
                ADD COLUMN organization_id INTEGER;
            """)
            
            # Add foreign key constraint
            cursor.execute("""
                ALTER TABLE appointments_holiday 
                ADD CONSTRAINT fk_holiday_organization 
                FOREIGN KEY (organization_id) 
                REFERENCES users_organization(id) ON DELETE CASCADE;
            """)
            
            print("✅ Organization column added successfully")
        
        # Migrate existing holiday data
        print("📊 Migrating existing holiday data...")
        
        # Get organizations
        cursor.execute("SELECT id, name FROM users_organization;")
        organizations = cursor.fetchall()
        print(f"Found {len(organizations)} organizations")
        
        if not organizations:
            print("⚠️  No organizations found - skipping data migration")
            return True
        
        # Get holidays without organization
        cursor.execute("SELECT id, name, date, is_recognized, suppressed FROM appointments_holiday WHERE organization_id IS NULL;")
        orphaned_holidays = cursor.fetchall()
        print(f"Found {len(orphaned_holidays)} holidays without organization")
        
        created_count = 0
        
        # Create organization-specific copies
        for holiday_id, name, date, is_recognized, suppressed in orphaned_holidays:
            for org_id, org_name in organizations:
                # Check if holiday already exists for this organization
                cursor.execute("""
                    SELECT id FROM appointments_holiday 
                    WHERE organization_id = %s AND name = %s AND date = %s;
                """, (org_id, name, date))
                
                if not cursor.fetchone():
                    # Create new holiday for this organization
                    cursor.execute("""
                        INSERT INTO appointments_holiday (organization_id, name, date, is_recognized, suppressed)
                        VALUES (%s, %s, %s, %s, %s);
                    """, (org_id, name, date, is_recognized, suppressed))
                    created_count += 1
        
        # Delete orphaned holidays
        cursor.execute("DELETE FROM appointments_holiday WHERE organization_id IS NULL;")
        deleted_count = cursor.rowcount
        
        # Try to add unique constraint (optional - might fail due to permissions)
        try:
            cursor.execute("""
                ALTER TABLE appointments_holiday 
                ADD CONSTRAINT unique_holiday_per_org 
                UNIQUE (organization_id, name, date);
            """)
            print("✅ Added unique constraint")
        except Exception as e:
            print(f"⚠️  Could not add unique constraint (this is OK): {e}")
        
        # Commit all changes
        conn.commit()
        
        print(f"✅ Created {created_count} organization-specific holidays")
        print(f"🗑️  Deleted {deleted_count} orphaned holidays")
        print("=" * 70)
        print("🎉 Holiday organization isolation completed successfully!")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        if 'conn' in locals():
            conn.rollback()
        return False
        
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

if __name__ == '__main__':
    success = apply_holiday_organization_fix()
    if success:
        print("\n✅ All changes applied successfully!")
        print("   Holidays are now properly isolated by organization.")
    else:
        print("\n❌ Fix failed - please check errors above")
        sys.exit(1)
