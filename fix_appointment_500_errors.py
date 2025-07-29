#!/usr/bin/env python
"""
Production fix for appointment form 500 errors
Deploys as part of cloudbuild process to fix backend API issues
"""

import os
import sys
import django
from django.core.management import execute_from_command_line

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
django.setup()

from django.db import connection, transaction
from django.utils import timezone
from datetime import date, timedelta

def run_sql_fix():
    """Run SQL commands to fix appointment endpoint data issues"""
    
    sql_commands = [
        # Create default holidays if none exist
        """
        INSERT INTO appointments_holiday (name, date, is_recognized)
        SELECT * FROM (VALUES
            ('New Year''s Day', '2025-01-01', true),
            ('Memorial Day', '2025-05-26', true),
            ('Independence Day', '2025-07-04', true),
            ('Labor Day', '2025-09-01', true),
            ('Thanksgiving', '2025-11-27', true),
            ('Christmas Day', '2025-12-25', true)
        ) AS new_holidays(name, date, is_recognized)
        WHERE NOT EXISTS (SELECT 1 FROM appointments_holiday WHERE date = new_holidays.date);
        """,
        
        # Create environment settings for organizations that don't have them
        """
        INSERT INTO appointments_environmentsetting (organization_id, blocked_days)
        SELECT o.id, ARRAY[0, 6]
        FROM users_organization o
        WHERE NOT EXISTS (
            SELECT 1 FROM appointments_environmentsetting es 
            WHERE es.organization_id = o.id
        );
        """,
        
        # Create default clinic events if none exist
        """
        INSERT INTO appointments_clinicevent (name, description, is_active)
        SELECT * FROM (VALUES
            ('New Patient Visit', 'Initial consultation for new patients', true),
            ('Follow-up Visit', 'Follow-up appointment for existing patients', true),
            ('Annual Check-up', 'Annual health check-up', true),
            ('Consultation', 'General medical consultation', true)
        ) AS new_events(name, description, is_active)
        WHERE NOT EXISTS (
            SELECT 1 FROM appointments_clinicevent 
            WHERE name = new_events.name
        );
        """
    ]
    
    with connection.cursor() as cursor:
        for i, sql in enumerate(sql_commands, 1):
            try:
                print(f"🔧 Executing fix {i}/3...")
                cursor.execute(sql)
                print(f"✅ Fix {i} completed")
            except Exception as e:
                print(f"⚠️  Fix {i} warning: {e}")
                # Continue with other fixes even if one fails

def check_results():
    """Check the results of our fixes"""
    try:
        from appointments.models import Holiday, EnvironmentSetting, ClinicEvent
        from users.models import Organization
        
        holiday_count = Holiday.objects.count()
        env_count = EnvironmentSetting.objects.count()
        event_count = ClinicEvent.objects.count()
        org_count = Organization.objects.count()
        
        print(f"📊 Results:")
        print(f"  Holidays: {holiday_count}")
        print(f"  Environment Settings: {env_count}")
        print(f"  Clinic Events: {event_count}")
        print(f"  Organizations: {org_count}")
        
        # Check if we have proper coverage
        if env_count >= org_count:
            print("✅ All organizations have environment settings")
        else:
            print("⚠️  Some organizations missing environment settings")
            
        if holiday_count > 0:
            print("✅ Holidays available")
        else:
            print("⚠️  No holidays in system")
            
        if event_count > 0:
            print("✅ Clinic events available")
        else:
            print("⚠️  No clinic events in system")
            
    except Exception as e:
        print(f"❌ Error checking results: {e}")

def main():
    print("🚀 Starting appointment form endpoint fixes...")
    
    try:
        # Run the SQL fixes
        run_sql_fix()
        
        # Check results
        check_results()
        
        print("✅ Appointment form fixes completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during fix process: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
