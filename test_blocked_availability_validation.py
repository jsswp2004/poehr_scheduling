#!/usr/bin/env python
"""
Test script to verify blocked availability validation is working correctly.
This script tests both frontend and backend validation for appointment creation
during blocked time slots.
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Add the project directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from appointments.models import Appointment, Availability, ClinicEvent
from users.models import Organization
from rest_framework.test import APIClient
from rest_framework import status
import json

User = get_user_model()

def setup_test_data():
    """Create test data for blocked availability validation."""
    print("🔧 Setting up test data...")
      # Create test organization
    org, created = Organization.objects.get_or_create(
        name="Test Medical Center"
    )
    
    # Create test doctor
    doctor, created = User.objects.get_or_create(
        username='test_doctor',
        defaults={
            'email': 'doctor@test.com',
            'first_name': 'Test',
            'last_name': 'Doctor',
            'role': 'doctor',
            'organization': org
        }
    )
    
    # Create test patient
    patient, created = User.objects.get_or_create(
        username='test_patient',
        defaults={
            'email': 'patient@test.com',
            'first_name': 'Test',
            'last_name': 'Patient',
            'role': 'patient',
            'organization': org
        }
    )
    
    # Create test admin
    admin, created = User.objects.get_or_create(
        username='test_admin',
        defaults={
            'email': 'admin@test.com',
            'first_name': 'Test',
            'last_name': 'Admin',
            'role': 'admin',
            'organization': org
        }
    )
    
    # Create test clinic event
    clinic_event, created = ClinicEvent.objects.get_or_create(
        name='Test Visit',
        defaults={'description': 'Test clinic visit', 'is_active': True}
    )
    
    # Create blocked availability (lunch time: 12:00 PM - 1:00 PM tomorrow)
    tomorrow = datetime.now() + timedelta(days=1)
    lunch_start = tomorrow.replace(hour=12, minute=0, second=0, microsecond=0)
    lunch_end = tomorrow.replace(hour=13, minute=0, second=0, microsecond=0)
    
    blocked_availability, created = Availability.objects.get_or_create(
        doctor=doctor,
        start_time=lunch_start,
        end_time=lunch_end,
        defaults={
            'is_blocked': True,
            'organization': org
        }
    )
    
    print(f"✅ Test data setup complete!")
    print(f"   Organization: {org.name}")
    print(f"   Doctor: Dr. {doctor.first_name} {doctor.last_name}")
    print(f"   Patient: {patient.first_name} {patient.last_name}")
    print(f"   Admin: {admin.first_name} {admin.last_name}")
    print(f"   Blocked time: {lunch_start} - {lunch_end}")
    
    return {
        'org': org,
        'doctor': doctor,
        'patient': patient,
        'admin': admin,
        'clinic_event': clinic_event,
        'blocked_start': lunch_start,
        'blocked_end': lunch_end
    }

def test_backend_validation(test_data):
    """Test server-side blocked availability validation."""
    print("\n🧪 Testing backend validation...")
    
    client = APIClient()
    client.force_authenticate(user=test_data['admin'])
    
    # Test 1: Try to create appointment during blocked time (should fail)
    print("   Test 1: Creating appointment during blocked time...")
    appointment_data = {
        'title': 'Test Visit',
        'appointment_datetime': test_data['blocked_start'].isoformat(),
        'duration_minutes': 30,
        'provider': test_data['doctor'].id,
        'patient': test_data['patient'].id,
        'description': 'Test appointment during lunch'
    }
    
    response = client.post('/api/appointments/', appointment_data)
    
    if response.status_code == 400:
        error_msg = response.data
        if 'blocked time' in str(error_msg).lower():
            print("   ✅ Backend correctly rejected appointment during blocked time")
            print(f"      Error message: {error_msg}")
        else:
            print(f"   ❌ Backend rejected appointment but wrong error: {error_msg}")
    else:
        print(f"   ❌ Backend did not reject appointment (status: {response.status_code})")
        if response.status_code == 201:
            # Clean up the created appointment
            appointment_id = response.data.get('id')
            if appointment_id:
                client.delete(f'/api/appointments/{appointment_id}/')
    
    # Test 2: Try to create appointment outside blocked time (should succeed)
    print("   Test 2: Creating appointment outside blocked time...")
    safe_time = test_data['blocked_start'] + timedelta(hours=2)  # 2:00 PM
    appointment_data['appointment_datetime'] = safe_time.isoformat()
    
    response = client.post('/api/appointments/', appointment_data)
    
    if response.status_code == 201:
        print("   ✅ Backend correctly allowed appointment outside blocked time")
        # Clean up the created appointment
        appointment_id = response.data.get('id')
        if appointment_id:
            client.delete(f'/api/appointments/{appointment_id}/')
    else:
        print(f"   ❌ Backend incorrectly rejected valid appointment (status: {response.status_code})")
        print(f"      Error: {response.data}")

def test_availability_api(test_data):
    """Test that the availability API returns blocked times correctly."""
    print("\n🔍 Testing availability API...")
    
    client = APIClient()
    client.force_authenticate(user=test_data['admin'])
    
    # Get availability for the test doctor
    response = client.get(f'/api/availability/?doctor={test_data["doctor"].id}')
    
    if response.status_code == 200:
        availabilities = response.data
        blocked_times = [avail for avail in availabilities if avail.get('is_blocked')]
        
        if blocked_times:
            print(f"   ✅ Found {len(blocked_times)} blocked time(s) for doctor")
            for blocked in blocked_times:
                print(f"      Blocked: {blocked['start_time']} - {blocked['end_time']}")
        else:
            print("   ❌ No blocked times found in API response")
    else:
        print(f"   ❌ Failed to fetch availability (status: {response.status_code})")

def cleanup_test_data():
    """Clean up test data."""
    print("\n🧹 Cleaning up test data...")
    
    # Clean up in reverse order of dependencies
    Appointment.objects.filter(patient__username='test_patient').delete()
    Availability.objects.filter(doctor__username='test_doctor').delete()
    
    User.objects.filter(username__in=['test_doctor', 'test_patient', 'test_admin']).delete()
    Organization.objects.filter(name="Test Medical Center").delete()
    
    print("   ✅ Test data cleaned up")

def main():
    """Main test function."""
    print("🚀 Starting blocked availability validation tests...\n")
    
    try:
        # Setup test data
        test_data = setup_test_data()
        
        # Run tests
        test_availability_api(test_data)
        test_backend_validation(test_data)
        
        print("\n✅ All tests completed!")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Always cleanup
        cleanup_test_data()

if __name__ == '__main__':
    main()
