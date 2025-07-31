#!/usr/bin/env python
import os
import sys
import django

print("!!! COMPREHENSIVE_DB_FIX.PY STARTED !!!")

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
sys.path.append('/code')
django.setup()

from django.core.management import execute_from_command_line
from django.db import connection

def run_comprehensive_database_fix():
    """Run a comprehensive database fix to ensure all tables exist"""
    print("🔧 Starting comprehensive database fix...")
    
    try:
        # First, run Django migrations to create all missing tables
        print("🗄️  Running Django migrations...")
        execute_from_command_line(['manage.py', 'migrate', '--verbosity=1'])
        print("✅ Django migrations completed")
        
        # Check and create any remaining missing tables manually
        with connection.cursor() as cursor:
            
            # Check critical tables
            tables_to_check = [
                'appointments_availability',
                'appointments_environmentsetting', 
                'appointments_autoemail',
                'appointments_holiday',
                'appointments_appointment',
                'appointments_clinicevent'
            ]
            
            missing_tables = []
            for table in tables_to_check:
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = %s
                    );
                """, [table])
                exists = cursor.fetchone()[0]
                print(f"📋 Table {table}: {'✅ EXISTS' if exists else '❌ MISSING'}")
                if not exists:
                    missing_tables.append(table)
            
            # Create missing tables manually if needed
            if 'appointments_availability' in missing_tables:
                print("🛠️  Creating appointments_availability table...")
                cursor.execute("""
                    CREATE TABLE appointments_availability (
                        id SERIAL PRIMARY KEY,
                        doctor_id INTEGER NOT NULL,
                        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
                        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
                        is_blocked BOOLEAN NOT NULL DEFAULT false,
                        recurrence VARCHAR(10) DEFAULT 'none',
                        recurrence_end DATE,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        CONSTRAINT appointments_availability_doctor_id_fkey 
                            FOREIGN KEY (doctor_id) REFERENCES auth_user(id) 
                            DEFERRABLE INITIALLY DEFERRED
                    );
                """)
                
                cursor.execute("""
                    CREATE INDEX appointments_availability_doctor_id_idx 
                    ON appointments_availability(doctor_id);
                """)
                print("✅ appointments_availability table created")
            
            if missing_tables:
                print(f"🔄 Re-running migrations to ensure all tables are properly created...")
                execute_from_command_line(['manage.py', 'migrate', '--verbosity=1'])
            
            print("✅ Comprehensive database fix completed successfully")
            # Print the schema of appointments_availability for debugging
            print("\n--- appointments_availability table schema ---")
            cursor.execute("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'appointments_availability'
                ORDER BY ordinal_position;
            """)
            columns = cursor.fetchall()
            for col in columns:
                print(f"  {col[0]} ({col[1]}) - Nullable: {col[2]}, Default: {col[3]}")
            print("--- END SCHEMA ---\n")
    except Exception as e:
        print(f"❌ Error during database fix: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("!!! COMPREHENSIVE_DB_FIX.PY MAIN CALLED !!!")
    run_comprehensive_database_fix()
    print("!!! COMPREHENSIVE_DB_FIX.PY FINISHED !!!")
