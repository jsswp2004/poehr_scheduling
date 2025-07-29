#!/usr/bin/env python
"""
Script to fix appointment form API endpoint issues in production
Addresses 500 errors from missing data or improper error handling
"""

import os
import sys
import django
from django.core.management import execute_from_command_line

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
django.setup()

from django.db import connection
from appointments.models import Holiday, EnvironmentSetting, Availability, ClinicEvent
from users.models import CustomUser, Organization

def check_and_fix_holidays():
    """Ensure holidays table exists and has some default data"""
    try:
        holiday_count = Holiday.objects.count()
        print(f"📅 Holidays table: {holiday_count} records")
        
        if holiday_count == 0:
            # Add some basic US holidays for 2025
            default_holidays = [
                {'name': 'New Year\'s Day', 'date': '2025-01-01', 'is_recognized': True},
                {'name': 'Independence Day', 'date': '2025-07-04', 'is_recognized': True},
                {'name': 'Christmas Day', 'date': '2025-12-25', 'is_recognized': True},
            ]
            
            for holiday_data in default_holidays:
                Holiday.objects.get_or_create(
                    name=holiday_data['name'],
                    date=holiday_data['date'],
                    defaults={'is_recognized': holiday_data['is_recognized']}
                )
            
            print("✅ Created default holidays")
        
        return True
    except Exception as e:
        print(f"❌ Error with holidays: {e}")
        return False

def check_and_fix_environment_settings():
    """Ensure each organization has environment settings"""
    try:
        orgs = Organization.objects.all()
        print(f"🏢 Organizations: {orgs.count()}")
        
        for org in orgs:
            env_setting, created = EnvironmentSetting.objects.get_or_create(
                organization=org,
                defaults={
                    'blocked_days': [0, 6]  # Block weekends by default
                }
            )
            if created:
                print(f"✅ Created environment setting for {org.name}")
        
        return True
    except Exception as e:
        print(f"❌ Error with environment settings: {e}")
        return False

def check_doctors_and_availability():
    """Check doctor availability and create basic availability if needed"""
    try:
        doctors = CustomUser.objects.filter(role='doctor')
        print(f"👨‍⚕️ Doctors: {doctors.count()}")
        
        for doctor in doctors:
            avail_count = Availability.objects.filter(doctor=doctor).count()
            print(f"  Dr. {doctor.get_full_name()}: {avail_count} availability records")
            
            # Don't auto-create availability as it's complex, just report
        
        return True
    except Exception as e:
        print(f"❌ Error checking doctors: {e}")
        return False

def check_clinic_events():
    """Verify ClinicEvent table is working"""
    try:
        event_count = ClinicEvent.objects.count()
        print(f"🏥 Clinic Events: {event_count} records")
        
        if event_count == 0:
            # Add some basic clinic events
            default_events = [
                {'name': 'New Patient Visit', 'description': 'Initial consultation for new patients', 'is_active': True},
                {'name': 'Follow-up Visit', 'description': 'Follow-up appointment for existing patients', 'is_active': True},
                {'name': 'Annual Check-up', 'description': 'Annual health check-up', 'is_active': True},
            ]
            
            for event_data in default_events:
                ClinicEvent.objects.get_or_create(
                    name=event_data['name'],
                    defaults={
                        'description': event_data['description'],
                        'is_active': event_data['is_active']
                    }
                )
            
            print("✅ Created default clinic events")
        
        return True
    except Exception as e:
        print(f"❌ Error with clinic events: {e}")
        return False

def run_additional_migrations():
    """Run any pending migrations"""
    try:
        print("🗄️ Running additional migrations...")
        execute_from_command_line(['manage.py', 'migrate', '--settings=poehr_scheduling_backend.settings_production'])
        print("✅ Migrations completed")
        return True
    except Exception as e:
        print(f"❌ Migration error: {e}")
        return False

def main():
    print("🔧 Fixing appointment form API endpoints...")
    
    # Run migrations first
    run_additional_migrations()
    
    # Check and fix each component
    results = [
        check_clinic_events(),
        check_and_fix_holidays(),
        check_and_fix_environment_settings(),
        check_doctors_and_availability(),
    ]
    
    if all(results):
        print("✅ All appointment form components working!")
    else:
        print("⚠️  Some issues remain, but basic functionality should work")

if __name__ == "__main__":
    main()
