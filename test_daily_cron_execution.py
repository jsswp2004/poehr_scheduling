#!/usr/bin/env python
"""
Test the actual cron execution with daily frequency to ensure it works end-to-end.
This creates real test data and runs the cron function.
"""

import os
import django
from datetime import date, timedelta

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import AutoEmail, Appointment
from appointments.cron import send_patient_reminders
from users.models import Organization, CustomUser
from django.utils import timezone

def test_daily_cron_execution():
    """Test actual cron execution with daily frequency"""
    print("🧪 Testing Daily Cron Execution")
    print("=" * 50)
    
    try:
        # Create test organization
        org, created = Organization.objects.get_or_create(
            name="Daily Cron Test Org"
        )
        if created:
            print(f"✅ Created test organization: {org.name}")
        else:
            print(f"✅ Using existing organization: {org.name}")
        
        # Create test patient
        patient, created = CustomUser.objects.get_or_create(
            email='dailytest@example.com',
            defaults={
                'username': 'dailytest',
                'first_name': 'Daily',
                'last_name': 'Test',
                'role': 'patient',
                'is_active': True
            }
        )
        if created:
            print(f"✅ Created test patient: {patient.email}")
        else:
            print(f"✅ Using existing patient: {patient.email}")
        
        # Create daily AutoEmail configuration
        auto_email, created = AutoEmail.objects.get_or_create(
            organization=org,
            auto_message_frequency='daily',
            defaults={
                'auto_message_day_of_week': 1,  # Monday (should be ignored)
                'auto_message_start_date': date.today() - timedelta(days=1),
                'is_active': True
            }
        )
        if created:
            print(f"✅ Created daily AutoEmail config")
        else:
            print(f"✅ Using existing AutoEmail config")
        
        # Create test appointment for tomorrow
        tomorrow = timezone.now() + timedelta(days=1)
        appointment, created = Appointment.objects.get_or_create(
            organization=org,
            patient=patient,
            appointment_datetime=tomorrow,
            defaults={
                'title': 'Daily Test Appointment',
                'description': 'Testing daily frequency cron',
                'duration_minutes': 30,
                'status': 'scheduled'
            }
        )
        if created:
            print(f"✅ Created test appointment for {appointment.appointment_datetime}")
        else:
            print(f"✅ Using existing appointment for {appointment.appointment_datetime}")
        
        print("\n--- Current Configuration ---")
        print(f"Today: {timezone.now().date()}")
        print(f"Current weekday: {timezone.now().weekday()} (0=Monday, 6=Sunday)")
        print(f"AutoEmail frequency: {auto_email.auto_message_frequency}")
        print(f"AutoEmail day of week: {auto_email.auto_message_day_of_week}")
        print(f"AutoEmail start date: {auto_email.auto_message_start_date}")
        print(f"AutoEmail is active: {auto_email.is_active}")
        
        print("\n--- Running Cron Function ---")
        # Run the actual cron function
        send_patient_reminders()
        
        print("\n✅ Cron execution completed successfully!")
        print("Note: Check the console output above for email sending results.")
        
        # Clean up test data
        print("\n--- Cleanup ---")
        appointment.delete()
        auto_email.delete()
        print("✅ Cleaned up test data")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during cron execution test: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_daily_cron_execution()
    if success:
        print("\n🎉 Daily cron execution test completed successfully!")
    else:
        print("\n⚠️  Daily cron execution test failed!")
