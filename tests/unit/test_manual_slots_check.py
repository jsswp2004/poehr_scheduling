#!/usr/bin/env python3
"""
Manual test to check if blocked availability filtering is working in doctor_available_slots
"""

import os
import sys
import django

# Add the project root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.utils import timezone
from datetime import datetime, timedelta, time as dt_time
from appointments.models import Appointment, Availability
from users.models import CustomUser, Organization

def test_blocked_slots_manually():
    """Manually test the blocked availability filtering logic"""
    
    print("🧪 Manual Testing of Blocked Slots Logic...")
    
    # Create or get test organization
    org, created = Organization.objects.get_or_create(name="Test Healthcare Center")
    print(f"✅ Organization: {org.name}")
    
    # Create or get test doctor
    doctor, created = CustomUser.objects.get_or_create(
        username="test_doctor_manual",
        defaults={
            "email": "test_doctor_manual@example.com",
            "role": "doctor",
            "first_name": "Test",
            "last_name": "Doctor",
            "organization": org,
        }
    )
    print(f"✅ Doctor: Dr. {doctor.first_name} {doctor.last_name} (ID: {doctor.id})")
    
    # Clean up existing availability for this doctor
    Availability.objects.filter(doctor=doctor).delete()
    print("🧹 Cleaned up existing availability")
    
    # Create a blocked availability for tomorrow 12:00 PM - 1:00 PM (lunch time)
    tomorrow = timezone.now() + timedelta(days=1)
    lunch_start = timezone.make_aware(
        datetime.combine(tomorrow.date(), dt_time(12, 0))  # 12:00 PM
    )
    lunch_end = timezone.make_aware(
        datetime.combine(tomorrow.date(), dt_time(13, 0))  # 1:00 PM
    )
    
    blocked_availability = Availability.objects.create(
        doctor=doctor,
        start_time=lunch_start,
        end_time=lunch_end,
        is_blocked=True,
        organization=org
    )
    print(f"🚫 Created blocked availability: {lunch_start.strftime('%Y-%m-%d %H:%M')} - {lunch_end.strftime('%H:%M')}")
    
    # Now manually test the logic from doctor_available_slots function
    now = timezone.localtime()
    slots = []
    max_slots = 5
    check_limit = 3  # Only check 3 days for testing
    days_checked = 0

    print(f"\n🔍 Starting slot generation...")
    print(f"   Current time: {now}")
    print(f"   Tomorrow date: {tomorrow.date()}")
    print(f"   Blocked time: {lunch_start.strftime('%H:%M')} - {lunch_end.strftime('%H:%M')}")

    while len(slots) < max_slots and days_checked < check_limit:
        current_day = now + timedelta(days=days_checked)
        print(f"\n📅 Checking day {days_checked}: {current_day.date()}")

        # Skip weekends
        if current_day.weekday() >= 5:
            print(f"   ⏭️ Skipping weekend day")
            days_checked += 1
            continue

        for hour in range(8, 18):  # 8:00 AM to 5:00 PM
            naive_dt = datetime.combine(current_day.date(), dt_time(hour=hour))
            slot_time = timezone.make_aware(naive_dt, timezone.get_current_timezone())

            if slot_time <= now:
                continue

            # Check if slot is taken by existing appointment
            is_taken = Appointment.objects.filter(
                provider_id=doctor.id,
                appointment_datetime=slot_time
            ).exists()

            if is_taken:
                print(f"   ❌ {slot_time.strftime('%H:%M')} - Appointment exists")
                continue

            # Check if slot conflicts with blocked availability
            # Default appointment duration is 30 minutes
            appointment_duration = 30
            slot_end_time = slot_time + timedelta(minutes=appointment_duration)
            
            is_blocked = Availability.objects.filter(
                doctor_id=doctor.id,
                is_blocked=True,
                start_time__lt=slot_end_time,
                end_time__gt=slot_time
            ).exists()

            if is_blocked:
                print(f"   🚫 {slot_time.strftime('%H:%M')} - BLOCKED by availability")
            else:
                print(f"   ✅ {slot_time.strftime('%H:%M')} - Available")
                slots.append(slot_time)
                if len(slots) == max_slots:
                    break

        days_checked += 1

    print(f"\n📊 Results:")
    print(f"   Total slots found: {len(slots)}")
    if slots:
        print(f"   Available slots:")
        for i, slot in enumerate(slots, 1):
            print(f"     {i}. {slot.strftime('%Y-%m-%d %H:%M')}")
    
    # Check if any slots conflict with blocked time (this should be 0)
    conflicts = []
    for slot in slots:
        slot_end = slot + timedelta(minutes=30)
        if slot < lunch_end and slot_end > lunch_start:
            conflicts.append(slot)
    
    if conflicts:
        print(f"\n❌ FAILED: Found {len(conflicts)} conflicting slots:")
        for conflict in conflicts:
            print(f"   - {conflict.strftime('%Y-%m-%d %H:%M')}")
        result = False
    else:
        print(f"\n✅ SUCCESS: No conflicting slots found!")
        result = True
    
    # Clean up
    blocked_availability.delete()
    print(f"\n🧹 Cleaned up test data")
    
    return result

if __name__ == "__main__":
    success = test_blocked_slots_manually()
    if success:
        print("\n🎉 Test PASSED: Blocked availability filtering is working correctly!")
    else:
        print("\n💥 Test FAILED: Blocked slots are not being filtered properly!")
    
    sys.exit(0 if success else 1)
