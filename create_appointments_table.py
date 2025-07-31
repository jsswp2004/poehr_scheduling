#!/usr/bin/env python3

import os
import django
from django.db import connection
from django.apps import apps
from django.conf import settings

def setup_django():
    """Set up Django environment"""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
    django.setup()

def create_appointments_table():
    """Create the appointments_appointment table if it doesn't exist"""
    print("!!! CREATING APPOINTMENTS TABLE !!!")
    
    with connection.cursor() as cursor:
        # Check if appointments_appointment table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'appointments_appointment'
            );
        """)
        table_exists = cursor.fetchone()[0]
        print(f"? appointments_appointment table exists: {table_exists}")
        
        if not table_exists:
            print("? Creating appointments_appointment table...")
            
            # Get the User model table name dynamically
            User = apps.get_model(settings.AUTH_USER_MODEL)
            user_table = User._meta.db_table
            print(f"? User table name: {user_table}")
            
            # Create the appointments_appointment table
            cursor.execute(f"""
                CREATE TABLE appointments_appointment (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    appointment_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
                    duration_minutes INTEGER NOT NULL DEFAULT 30,
                    recurrence VARCHAR(10) NOT NULL DEFAULT 'none',
                    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    recurrence_end_date DATE,
                    arrived BOOLEAN NOT NULL DEFAULT FALSE,
                    no_show BOOLEAN NOT NULL DEFAULT FALSE,
                    patient_id INTEGER NOT NULL,
                    provider_id INTEGER,
                    organization_id INTEGER,
                    CONSTRAINT appointments_appointment_patient_id_fkey 
                        FOREIGN KEY (patient_id) REFERENCES {user_table}(id) DEFERRABLE INITIALLY DEFERRED,
                    CONSTRAINT appointments_appointment_provider_id_fkey 
                        FOREIGN KEY (provider_id) REFERENCES {user_table}(id) DEFERRABLE INITIALLY DEFERRED,
                    CONSTRAINT appointments_appointment_organization_id_fkey 
                        FOREIGN KEY (organization_id) REFERENCES users_organization(id) DEFERRABLE INITIALLY DEFERRED
                );
            """)
            
            # Create indexes for better performance
            cursor.execute("""
                CREATE INDEX appointments_appointment_patient_id_idx ON appointments_appointment(patient_id);
                CREATE INDEX appointments_appointment_provider_id_idx ON appointments_appointment(provider_id);
                CREATE INDEX appointments_appointment_organization_id_idx ON appointments_appointment(organization_id);
                CREATE INDEX appointments_appointment_appointment_datetime_idx ON appointments_appointment(appointment_datetime);
            """)
            
            print("✅ appointments_appointment table created successfully!")
        else:
            print("✅ appointments_appointment table already exists!")

def check_all_tables():
    """Check all existing tables"""
    print("? Current database tables:")
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """)
        tables = cursor.fetchall()
        for table in tables:
            print(f"    - {table[0]}")

def main():
    print("!!! COMPREHENSIVE APPOINTMENTS FIX STARTED !!!")
    
    try:
        setup_django()
        check_all_tables()
        create_appointments_table()
        check_all_tables()
        print("? Fix completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during fix: {e}")
        import traceback
        traceback.print_exc()
    
    print("!!! COMPREHENSIVE APPOINTMENTS FIX FINISHED !!!")

if __name__ == "__main__":
    main()
