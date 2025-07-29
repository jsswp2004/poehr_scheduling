#!/usr/bin/env python3
"""
Script to fix the missing appointments_availability table issue in production.
This script will ensure all necessary database tables are created and migrations are applied.
"""

import os
import sys
import django
from django.core.management import execute_from_command_line
from django.db import connection
from django.conf import settings

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
django.setup()

def check_table_exists(table_name):
    """Check if a table exists in the database."""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = %s
            );
        """, [table_name])
        return cursor.fetchone()[0]

def main():
    print("🔧 Starting availability table fix...")
    
    # Check if the appointments_availability table exists
    table_exists = check_table_exists('appointments_availability')
    print(f"📋 appointments_availability table exists: {table_exists}")
    
    if not table_exists:
        print("🚨 Missing appointments_availability table detected!")
        print("🔄 Running Django migrations to create missing tables...")
        
        try:
            # Run migrations
            execute_from_command_line(['manage.py', 'migrate', '--verbosity=2'])
            print("✅ Migrations completed successfully!")
            
            # Check again
            table_exists_after = check_table_exists('appointments_availability')
            print(f"📋 appointments_availability table exists after migration: {table_exists_after}")
            
            if table_exists_after:
                print("🎉 SUCCESS: appointments_availability table created!")
            else:
                print("❌ FAILED: appointments_availability table still missing!")
                return False
                
        except Exception as e:
            print(f"❌ Migration failed: {e}")
            return False
    else:
        print("✅ appointments_availability table already exists!")
    
    # List all tables for verification
    print("\n📊 Current database tables:")
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY tablename;
        """)
        tables = cursor.fetchall()
        for table in tables:
            print(f"  - {table[0]}")
    
    print("\n🎯 Fix completed successfully!")
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
