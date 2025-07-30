#!/usr/bin/env python3
"""
Direct script to create the missing appointments_availability table
by running the specific migration that creates it.
"""

import os
import sys
import django
from django.core.management import call_command
from django.db import connection

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
django.setup()

def create_availability_table():
    """Create the appointments_availability table directly via SQL."""
    
    sql_create_table = """
    CREATE TABLE IF NOT EXISTS appointments_availability (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER,
        doctor_id INTEGER NOT NULL,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
        recurrence VARCHAR(20),
        recurrence_end_date DATE,
        block_type VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """
    
    # Add foreign key constraints
    sql_add_constraints = """
    DO $$ 
    BEGIN
        -- Add foreign key to users_customuser (doctor)
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'appointments_availability_doctor_id_fkey'
        ) THEN
            ALTER TABLE appointments_availability 
            ADD CONSTRAINT appointments_availability_doctor_id_fkey 
            FOREIGN KEY (doctor_id) REFERENCES users_customuser(id);
        END IF;
        
        -- Add foreign key to users_organization if it exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users_organization') THEN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'appointments_availability_organization_id_fkey'
            ) THEN
                ALTER TABLE appointments_availability 
                ADD CONSTRAINT appointments_availability_organization_id_fkey 
                FOREIGN KEY (organization_id) REFERENCES users_organization(id);
            END IF;
        END IF;
    END $$;
    """
    
    # Create indexes
    sql_create_indexes = """
    CREATE INDEX IF NOT EXISTS appointments_availability_doctor_id_idx 
    ON appointments_availability (doctor_id);
    
    CREATE INDEX IF NOT EXISTS appointments_availability_start_time_idx 
    ON appointments_availability (start_time);
    
    CREATE INDEX IF NOT EXISTS appointments_availability_end_time_idx 
    ON appointments_availability (end_time);
    
    CREATE INDEX IF NOT EXISTS appointments_availability_organization_id_idx 
    ON appointments_availability (organization_id);
    """
    
    try:
        with connection.cursor() as cursor:
            print("🔧 Creating appointments_availability table...")
            cursor.execute(sql_create_table)
            
            print("🔗 Adding foreign key constraints...")
            cursor.execute(sql_add_constraints)
            
            print("📊 Creating indexes...")
            cursor.execute(sql_create_indexes)
            
            print("✅ Table creation completed successfully!")
            
        # Verify table exists
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) FROM information_schema.tables 
                WHERE table_name = 'appointments_availability'
            """)
            table_count = cursor.fetchone()[0]
            print(f"📋 Table verification: {table_count} table(s) found")
            
            if table_count > 0:
                cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments_availability' ORDER BY ordinal_position")
                columns = [row[0] for row in cursor.fetchall()]
                print(f"📝 Table columns: {', '.join(columns)}")
                return True
            else:
                print("❌ Table still not found after creation!")
                return False
                
    except Exception as e:
        print(f"❌ Error creating table: {e}")
        return False

def main():
    print("🚀 Starting direct table creation...")
    
    success = create_availability_table()
    
    if success:
        print("🎉 SUCCESS: appointments_availability table is ready!")
        
        # Now run migrations to ensure everything is in sync
        print("🔄 Running Django migrations to sync state...")
        try:
            call_command('migrate', '--fake-initial', verbosity=1)
            print("✅ Migration sync completed!")
        except Exception as e:
            print(f"⚠️ Migration sync warning: {e}")
            
    else:
        print("❌ FAILED: Could not create appointments_availability table")
        return False
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
