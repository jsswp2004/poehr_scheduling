#!/usr/bin/env python3
"""
Test script to verify that blocked time slots are filtered out from available slots
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
from django.test import RequestFactory
from django.contrib.auth.models import AnonymousUser
from appointments.views import doctor_available_slots

def test_available_slots_filtering():
    """Test that available slots properly filter out blocked time slots"""
    
    print("🧪 Testing Available Slots Filtering...")
    
    # Create or get test organization
    org, created = Organization.objects.get_or_create(name="Test Healthcare Center")
    print(f"✅ Organization: {org.name}")
    
    # Create or get test doctor
    doctor, created = CustomUser.objects.get_or_create(
        username="test_doctor_slots",
        defaults={
            "email": "test_doctor_slots@example.com",
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
    print(f"🚫 Created blocked availability: {lunch_start.strftime('%Y-%m-%d %H:%M')} - {lunch_end.strftime('%H:%M')}")    # Create a request object to simulate API call with proper authentication
    factory = RequestFactory()
    request = factory.get(f'/api/doctors/{doctor.id}/available-dates/')
    request.user = doctor  # Use the doctor as the authenticated user
    
    # Ensure the user is authenticated
    from django.contrib.auth.models import AnonymousUser
    if isinstance(request.user, AnonymousUser):
        print("❌ User is not authenticated")
        return False
    
    try:
        # Call the available slots function
        response = doctor_available_slots(request, doctor.id)
        
        # Check if response has data or is an error response
        if hasattr(response, 'data'):
            available_slots = response.data
        else:
            # Handle error response
            print(f"❌ Error response: {response}")
            return False
        
        print(f"\n📅 Available slots returned: {len(available_slots) if isinstance(available_slots, list) else 'Error'}")
        
        if not isinstance(available_slots, list):
            print(f"❌ Expected list of slots, got: {type(available_slots)} - {available_slots}")
            return False
        
        # Parse the returned slots and check if any conflict with blocked time
        conflicts_found = []
        for slot_str in available_slots:
            slot_time = timezone.datetime.fromisoformat(slot_str.replace('Z', '+00:00'))
            slot_end_time = slot_time + timedelta(minutes=30)  # Default appointment duration
            
            # Check if this slot overlaps with blocked time
            if (slot_time < lunch_end and slot_end_time > lunch_start):
                conflicts_found.append({
                    'slot_start': slot_time.strftime('%Y-%m-%d %H:%M'),
                    'slot_end': slot_end_time.strftime('%H:%M'),
                    'blocked_start': lunch_start.strftime('%Y-%m-%d %H:%M'),
                    'blocked_end': lunch_end.strftime('%H:%M')
                })
        
        if conflicts_found:
            print(f"\n❌ FAILED: Found {len(conflicts_found)} conflicting slots:")
            for conflict in conflicts_found:
                print(f"   - Slot: {conflict['slot_start']} - {conflict['slot_end']}")
                print(f"     Conflicts with blocked time: {conflict['blocked_start']} - {conflict['blocked_end']}")
            return False
        else:
            print(f"\n✅ SUCCESS: No conflicting slots found!")
            print("   All returned slots properly avoid blocked availability periods.")
            
            # Show a few example slots for verification
            print(f"\n📋 Example available slots:")
            for i, slot_str in enumerate(available_slots[:3]):
                slot_time = timezone.datetime.fromisoformat(slot_str.replace('Z', '+00:00'))
                print(f"   {i+1}. {slot_time.strftime('%Y-%m-%d %H:%M')}")
            
            return True
            
    except Exception as e:
        print(f"❌ ERROR calling available slots function: {e}")
        return False
    
    finally:
        # Clean up test data
        blocked_availability.delete()
        print(f"\n🧹 Cleaned up test data")

if __name__ == "__main__":
    success = test_available_slots_filtering()
    if success:
        print("\n🎉 Test PASSED: Available slots filtering is working correctly!")
    else:
        print("\n💥 Test FAILED: Available slots are still showing blocked time slots!")
    
    sys.exit(0 if success else 1)
