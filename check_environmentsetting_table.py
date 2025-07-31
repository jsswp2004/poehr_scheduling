#!/usr/bin/env python
import os
import sys
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling.settings')
sys.path.append('/code')
django.setup()

from django.db import connection

def check_environmentsetting_table():
    """Check if appointments_environmentsetting table exists and its structure"""
    with connection.cursor() as cursor:
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
        
        if table_exists:
            # Get table structure
            cursor.execute("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'appointments_environmentsetting'
                ORDER BY ordinal_position;
            """)
            columns = cursor.fetchall()
            print("\nTable structure:")
            for col in columns:
                print(f"  {col[0]} ({col[1]}) - Nullable: {col[2]}, Default: {col[3]}")
            
            # Check if there are any records
            cursor.execute("SELECT COUNT(*) FROM appointments_environmentsetting;")
            count = cursor.fetchone()[0]
            print(f"\nRecord count: {count}")
            
            if count > 0:
                cursor.execute("SELECT * FROM appointments_environmentsetting LIMIT 3;")
                records = cursor.fetchall()
                print("\nSample records:")
                for record in records:
                    print(f"  {record}")
        else:
            print("Table does not exist!")

if __name__ == "__main__":
    try:
        check_environmentsetting_table()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
