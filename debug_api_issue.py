#!/usr/bin/env python
"""
Debug script to be run in Cloud Run environment to diagnose the API issue
"""
import os
import sys
import django

print("!!! DEBUG_API_ISSUE.PY STARTED !!!")

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
sys.path.append('/code')
django.setup()

from appointments.models import Availability, Appointment
from django.db import connection
from datetime import datetime, timedelta
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from django.contrib.auth import get_user_model

def debug_api_issue():
    """Debug the doctor available slots API issue"""
    print("🔍 Starting API debug...")
    
    try:
        # Test the Availability model
        print("📋 Testing Availability model...")
        availability_count = Availability.objects.count()
        print(f"✅ Availability records: {availability_count}")
        
        # Test the Appointment model
        print("📋 Testing Appointment model...")
        appointment_count = Appointment.objects.count()
        print(f"✅ Appointment records: {appointment_count}")
        
        # Test the exact logic from the view
        print("🔍 Testing doctor_available_slots logic...")
        doctor_id = 22
        now = timezone.localtime()
        slots = []
        max_slots = 5
        check_limit = 5  # Reduced for debugging
        days_checked = 0
        
        print(f"🕐 Current time: {now}")
        print(f"👨‍⚕️ Doctor ID: {doctor_id}")
        
        while len(slots) < max_slots and days_checked < check_limit:
            current_day = now + timedelta(days=days_checked)
            print(f"📅 Checking day {days_checked}: {current_day.date()}")
            
            # Skip weekends
            if current_day.weekday() >= 5:
                print(f"⏭️ Skipping weekend day")
                days_checked += 1
                continue
            
            for hour in range(8, 10):  # Just test 8-10 AM
                naive_dt = datetime.combine(current_day.date(), datetime.min.time().replace(hour=hour))
                slot_time = timezone.make_aware(naive_dt, timezone.get_current_timezone())
                
                print(f"🕐 Testing slot: {slot_time}")
                
                if slot_time <= now:
                    print(f"⏭️ Slot in past, skipping")
                    continue
                
                # Check if slot is taken by existing appointment
                print(f"🔍 Checking appointments for doctor {doctor_id} at {slot_time}")
                is_taken = Appointment.objects.filter(
                    provider_id=doctor_id,
                    appointment_datetime=slot_time
                ).exists()
                print(f"📅 Appointment exists: {is_taken}")
                
                if is_taken:
                    continue
                
                # Check if slot conflicts with blocked availability
                appointment_duration = 30
                slot_end_time = slot_time + timedelta(minutes=appointment_duration)
                
                print(f"🔍 Checking availability blocks from {slot_time} to {slot_end_time}")
                blocked_availabilities = Availability.objects.filter(
                    doctor_id=doctor_id,
                    is_blocked=True,
                    start_time__lt=slot_end_time,
                    end_time__gt=slot_time
                )
                is_blocked = blocked_availabilities.exists()
                print(f"🚫 Slot blocked: {is_blocked}")
                
                if not is_blocked:
                    slots.append(slot_time)
                    print(f"✅ Added slot: {slot_time}")
                    if len(slots) == max_slots:
                        break
            
            days_checked += 1
        
        print(f"✅ Found {len(slots)} available slots:")
        for slot in slots:
            print(f"   📅 {timezone.localtime(slot).isoformat()}")
        
        # Test the actual view function
        print("🔍 Testing actual view function...")
        from appointments.views import doctor_available_slots
        from django.test import RequestFactory
        
        factory = RequestFactory()
        request = factory.get(f'/api/doctors/{doctor_id}/available-dates/')
        
        # Add a user to the request
        User = get_user_model()
        user = User.objects.first()
        if user:
            request.user = user
            print(f"👤 Using user: {user.username}")
            
            response = doctor_available_slots(request, doctor_id)
            print(f"✅ View response status: {response.status_code}")
            print(f"✅ View response data: {response.data}")
        else:
            print("❌ No users found in database")
        
        print("✅ API debug completed successfully")
        
    except Exception as e:
        print(f"❌ Error during API debug: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("!!! DEBUG_API_ISSUE.PY MAIN CALLED !!!")
    debug_api_issue()
    print("!!! DEBUG_API_ISSUE.PY FINISHED !!!")
