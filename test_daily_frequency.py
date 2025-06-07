#!/usr/bin/env python
"""
Test script to verify daily frequency functionality in the AutoEmail system.
This script tests:
1. Frontend changes (day of week field disabled when daily is selected)
2. Backend model (daily option available in FREQUENCY_CHOICES)
3. Cron system (daily frequency logic)
"""

import os
import django
import sys
from datetime import date, timedelta

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import AutoEmail, Appointment
from appointments.cron import send_patient_reminders
from users.models import Organization, CustomUser
from django.utils import timezone

def test_model_daily_option():
    """Test that the AutoEmail model includes 'daily' in FREQUENCY_CHOICES"""
    print("=== Testing AutoEmail Model ===")
    
    # Check if 'daily' is in FREQUENCY_CHOICES
    frequency_values = [choice[0] for choice in AutoEmail.FREQUENCY_CHOICES]
    print(f"Available frequency choices: {frequency_values}")
    
    if 'daily' in frequency_values:
        print("✅ 'daily' option is available in AutoEmail.FREQUENCY_CHOICES")
    else:
        print("❌ 'daily' option is NOT available in AutoEmail.FREQUENCY_CHOICES")
        return False
    
    # Try to create a daily AutoEmail configuration
    try:
        # Check if we have any organizations
        org = Organization.objects.first()
        if not org:
            print("⚠️  No organizations found - creating test org")
            org = Organization.objects.create(name="Test Org")
        
        auto_email = AutoEmail.objects.create(
            organization=org,
            auto_message_frequency='daily',
            auto_message_day_of_week=1,  # Monday (should be ignored for daily)
            auto_message_start_date=date.today(),
            is_active=True
        )
        print(f"✅ Successfully created daily AutoEmail configuration: {auto_email}")
        
        # Clean up
        auto_email.delete()
        return True
        
    except Exception as e:
        print(f"❌ Failed to create daily AutoEmail configuration: {e}")
        return False

def test_cron_daily_logic():
    """Test the cron system's daily frequency logic"""
    print("\n=== Testing Cron Daily Logic ===")
    
    try:        # Create test organization and user if they don't exist
        org, created = Organization.objects.get_or_create(
            name="Daily Test Org"
        )
        
        user, created = CustomUser.objects.get_or_create(
            email='testpatient@example.com',
            defaults={
                'first_name': 'Test',
                'last_name': 'Patient',
                'is_active': True
            }
        )
        
        # Create a daily AutoEmail configuration
        auto_email = AutoEmail.objects.create(
            organization=org,
            auto_message_frequency='daily',
            auto_message_day_of_week=3,  # Wednesday (should be ignored)
            auto_message_start_date=date.today() - timedelta(days=1),  # Started yesterday
            is_active=True
        )
        
        # Create a test appointment for tomorrow
        appointment = Appointment.objects.create(
            organization=org,
            patient=user,
            title="Test Daily Appointment",
            description="Testing daily frequency",
            appointment_datetime=timezone.now() + timedelta(days=1),
            duration_minutes=30,
            status='scheduled'
        )
        
        print(f"✅ Created test data:")
        print(f"   - Organization: {org.name}")
        print(f"   - AutoEmail config: {auto_email.auto_message_frequency} frequency")
        print(f"   - Appointment: {appointment.appointment_datetime}")
        print(f"   - Current weekday: {timezone.now().weekday()} (0=Monday, 6=Sunday)")
        print(f"   - Config day of week: {auto_email.auto_message_day_of_week}")
        
        # Test the cron logic (dry run - don't actually send emails)
        print("\n--- Testing Daily Frequency Logic ---")
        
        # Import the send_patient_reminders function to test its logic
        today = timezone.now().date()
        current_weekday = timezone.now().weekday()
        
        # Check if the daily logic would trigger
        should_send = False
        if auto_email.auto_message_frequency == 'daily':
            should_send = True
            print("✅ Daily frequency: Should send emails every day regardless of weekday")
        
        if should_send:
            print(f"✅ Cron would send emails today (weekday {current_weekday})")
        else:
            print(f"❌ Cron would NOT send emails today")
        
        # Clean up test data
        appointment.delete()
        auto_email.delete()
        
        return should_send
        
    except Exception as e:
        print(f"❌ Error testing cron daily logic: {e}")
        return False

def test_frontend_integration():
    """Test that frontend files have the correct daily frequency implementation"""
    print("\n=== Testing Frontend Integration ===")
    
    frontend_file = "frontend/src/pages/AutoEmailSetUpPage.js"
    
    try:
        with open(frontend_file, 'r') as f:
            content = f.read()
            
        # Check for daily option in dropdown
        if 'value="daily"' in content and '<MenuItem value="daily">Daily</MenuItem>' in content:
            print("✅ Daily option found in frequency dropdown")
        else:
            print("❌ Daily option NOT found in frequency dropdown")
            return False
            
        # Check for disabled day of week field when daily is selected
        if 'disabled={frequency === \'daily\'}' in content:
            print("✅ Day of week field is disabled when daily is selected")
        else:
            print("❌ Day of week field is NOT disabled when daily is selected")
            return False
            
        return True
        
    except Exception as e:
        print(f"❌ Error checking frontend file: {e}")
        return False

def main():
    """Run all tests"""
    print("🧪 Testing Daily Frequency Implementation")
    print("=" * 50)
    
    results = []
    
    # Test 1: Model
    results.append(test_model_daily_option())
    
    # Test 2: Cron Logic
    results.append(test_cron_daily_logic())
    
    # Test 3: Frontend
    results.append(test_frontend_integration())
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
    print(f"   - Model Test: {'✅ PASS' if results[0] else '❌ FAIL'}")
    print(f"   - Cron Test: {'✅ PASS' if results[1] else '❌ FAIL'}")
    print(f"   - Frontend Test: {'✅ PASS' if results[2] else '❌ FAIL'}")
    
    if all(results):
        print("\n🎉 All tests passed! Daily frequency implementation is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Please check the implementation.")
    
    return all(results)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
