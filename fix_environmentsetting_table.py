#!/usr/bin/env python
import os
import sys
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling.settings')
sys.path.append('/code')
django.setup()

from django.db import connection, transaction
from users.models import Organization

def fix_environmentsetting_table():
    """Fix the appointments_environmentsetting table"""
    with connection.cursor() as cursor:
        try:
            # Check if table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'appointments_environmentsetting'
                );
            """)
            table_exists = cursor.fetchone()[0]
            print(f"appointments_environmentsetting table exists: {table_exists}")
            
            if not table_exists:
                print("Creating appointments_environmentsetting table...")
                # Create the table with proper structure matching the Django model
                cursor.execute("""
                    CREATE TABLE appointments_environmentsetting (
                        id SERIAL PRIMARY KEY,
                        organization_id INTEGER NOT NULL,
                        blocked_days INTEGER[] DEFAULT '{}',
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        CONSTRAINT appointments_environmentsetting_organization_id_fkey 
                            FOREIGN KEY (organization_id) REFERENCES users_organization(id) 
                            DEFERRABLE INITIALLY DEFERRED,
                        CONSTRAINT appointments_environmentsetting_organization_id_unique 
                            UNIQUE (organization_id)
                    );
                """)
                
                # Create index for performance
                cursor.execute("""
                    CREATE INDEX appointments_environmentsetting_organization_id_idx 
                    ON appointments_environmentsetting(organization_id);
                """)
                
                print("✅ Table created successfully")
            else:
                print("Table already exists, checking structure...")
                
                # Check if organization_id column exists and is unique
                cursor.execute("""
                    SELECT column_name, data_type, is_nullable 
                    FROM information_schema.columns 
                    WHERE table_name = 'appointments_environmentsetting' 
                    AND column_name = 'organization_id';
                """)
                org_col = cursor.fetchone()
                if not org_col:
                    print("Adding missing organization_id column...")
                    cursor.execute("""
                        ALTER TABLE appointments_environmentsetting 
                        ADD COLUMN organization_id INTEGER;
                    """)
                    
                    cursor.execute("""
                        ALTER TABLE appointments_environmentsetting 
                        ADD CONSTRAINT appointments_environmentsetting_organization_id_fkey 
                        FOREIGN KEY (organization_id) REFERENCES users_organization(id) 
                        DEFERRABLE INITIALLY DEFERRED;
                    """)
                    
                    cursor.execute("""
                        ALTER TABLE appointments_environmentsetting 
                        ADD CONSTRAINT appointments_environmentsetting_organization_id_unique 
                        UNIQUE (organization_id);
                    """)
                    print("✅ organization_id column added")
                
                # Check blocked_days column
                cursor.execute("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'appointments_environmentsetting' 
                    AND column_name = 'blocked_days';
                """)
                blocked_col = cursor.fetchone()
                if not blocked_col:
                    print("Adding missing blocked_days column...")
                    cursor.execute("""
                        ALTER TABLE appointments_environmentsetting 
                        ADD COLUMN blocked_days INTEGER[] DEFAULT '{}';
                    """)
                    print("✅ blocked_days column added")
                
                # Check updated_at column
                cursor.execute("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'appointments_environmentsetting' 
                    AND column_name = 'updated_at';
                """)
                updated_col = cursor.fetchone()
                if not updated_col:
                    print("Adding missing updated_at column...")
                    cursor.execute("""
                        ALTER TABLE appointments_environmentsetting 
                        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
                    """)
                    print("✅ updated_at column added")
            
            # Check if we have any organizations without environment settings
            cursor.execute("""
                SELECT o.id, o.name 
                FROM users_organization o 
                LEFT JOIN appointments_environmentsetting es ON o.id = es.organization_id 
                WHERE es.id IS NULL;
            """)
            missing_orgs = cursor.fetchall()
            
            if missing_orgs:
                print(f"Creating environment settings for {len(missing_orgs)} organizations...")
                for org_id, org_name in missing_orgs:
                    cursor.execute("""
                        INSERT INTO appointments_environmentsetting 
                        (organization_id, blocked_days, updated_at) 
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (organization_id) DO NOTHING;
                    """, [org_id, []])
                    print(f"  ✅ Created setting for: {org_name}")
            else:
                print("All organizations have environment settings")
            
            # Test the table
            cursor.execute("SELECT COUNT(*) FROM appointments_environmentsetting;")
            count = cursor.fetchone()[0]
            print(f"Total environment settings: {count}")
            
        except Exception as e:
            print(f"Error fixing environment setting table: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    try:
        fix_environmentsetting_table()
        print("✅ Environment setting table fix completed")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
