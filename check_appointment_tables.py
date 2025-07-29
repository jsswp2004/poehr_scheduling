#!/usr/bin/env python
"""
Simple diagnostic script to check appointment endpoint models locally
"""

import os
import sys
import django

# Setup Django environment with local settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.db import connection

def check_table_exists(table_name):
    """Check if a table exists in the database"""
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
    print("🔍 Checking appointment-related database tables...")
    
    tables_to_check = [
        'appointments_holiday',
        'appointments_environmentsetting', 
        'appointments_availability',
        'appointments_clinicevent',
        'users_customuser',
        'users_organization'
    ]
    
    for table in tables_to_check:
        exists = check_table_exists(table)
        status = "✅ EXISTS" if exists else "❌ MISSING"
        print(f"{table}: {status}")
    
    print("\n📊 Basic model tests...")
    
    try:
        from appointments.models import Holiday, EnvironmentSetting, Availability, ClinicEvent
        from users.models import CustomUser, Organization
        
        # Test Holiday model
        try:
            holiday_count = Holiday.objects.count()
            print(f"Holiday records: {holiday_count}")
        except Exception as e:
            print(f"Holiday model error: {e}")
        
        # Test EnvironmentSetting model
        try:
            env_count = EnvironmentSetting.objects.count()
            print(f"EnvironmentSetting records: {env_count}")
        except Exception as e:
            print(f"EnvironmentSetting model error: {e}")
        
        # Test Availability model
        try:
            avail_count = Availability.objects.count()
            print(f"Availability records: {avail_count}")
        except Exception as e:
            print(f"Availability model error: {e}")
        
        # Test Organization and CustomUser
        try:
            org_count = Organization.objects.count()
            user_count = CustomUser.objects.count()
            doctor_count = CustomUser.objects.filter(role='doctor').count()
            print(f"Organizations: {org_count}")
            print(f"Users: {user_count}")
            print(f"Doctors: {doctor_count}")
        except Exception as e:
            print(f"User/Organization model error: {e}")
            
    except ImportError as e:
        print(f"Import error: {e}")

if __name__ == "__main__":
    main()
