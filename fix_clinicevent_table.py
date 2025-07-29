#!/usr/bin/env python
"""
Script to fix ClinicEvent table issues in production
Run this in the production environment to diagnose and fix the table
"""

import os
import sys
import django
from django.core.management import execute_from_command_line

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
django.setup()

from django.db import connection
from appointments.models import ClinicEvent

def check_table_exists():
    """Check if appointments_clinicevent table exists"""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'appointments_clinicevent'
                );
            """)
            exists = cursor.fetchone()[0]
            return exists
    except Exception as e:
        print(f"❌ Error checking table existence: {e}")
        return False

def create_table_manually():
    """Manually create the ClinicEvent table if it doesn't exist"""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS appointments_clinicevent (
                    id bigserial PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    description TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT true
                );
            """)
            print("✅ ClinicEvent table created successfully")
            return True
    except Exception as e:
        print(f"❌ Error creating table: {e}")
        return False

def test_model_access():
    """Test if we can access the ClinicEvent model"""
    try:
        count = ClinicEvent.objects.count()
        print(f"✅ ClinicEvent model working. Current count: {count}")
        return True
    except Exception as e:
        print(f"❌ Error accessing ClinicEvent model: {e}")
        return False

def main():
    print("🔍 Diagnosing ClinicEvent table issues...")
    
    # Check if table exists
    table_exists = check_table_exists()
    print(f"📊 Table exists: {table_exists}")
    
    if not table_exists:
        print("🔧 Creating table manually...")
        if create_table_manually():
            print("✅ Table created successfully")
        else:
            print("❌ Failed to create table")
            return
    
    # Test model access
    print("🧪 Testing model access...")
    if test_model_access():
        print("✅ Everything working correctly!")
    else:
        print("❌ Model access still failing")
        
    # Run migrations to ensure everything is up to date
    print("🗄️ Running migrations...")
    try:
        execute_from_command_line(['manage.py', 'migrate', 'appointments'])
        print("✅ Migrations completed")
    except Exception as e:
        print(f"❌ Migration error: {e}")

if __name__ == "__main__":
    main()
