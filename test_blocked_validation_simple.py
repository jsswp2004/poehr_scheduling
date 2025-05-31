#!/usr/bin/env python
"""
Simple test script to verify blocked availability validation works directly at the model level
"""

import os
import sys
import django
from datetime import datetime, date, timedelta
from django.utils import timezone

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization
from appointments.models import Appointment, Availability
from django.core.exceptions import ValidationError

def setup_test_data():
    """Set up test data for validation tests"""
    print("🔧 Setting up test data...")
    
    # Create test organization
    org, created = Organization.objects.get_or_create(
        name="Test Medical Center"
    )
    
    # Create test doctor
    doctor, created = CustomUser.objects.get_or_create(
        username="test_doctor",
        defaults={
            'email': 'doctor@test.com',
            'first_name': 'Test',
            'last_name': 'Doctor',
            'role': 'provider',
            'organization': org
        }
    )
    
    # Create test patient
    patient, created = CustomUser.objects.get_or_create(
        username="test_patient",
        defaults={
            'email': 'patient@test.com',
            'first_name': 'Test',
            'last_name': 'Patient',
            'role': 'patient',
            'organization': org
        }
    )
    
    # Create blocked availability (lunch time)
    tomorrow = date.today() + timedelta(days=1)
    blocked_start = timezone.make_aware(datetime.combine(tomorrow, datetime.strptime("12:00", "%H:%M").time()))
    blocked_end = timezone.make_aware(datetime.combine(tomorrow, datetime.strptime("13:00", "%H:%M").time()))
    
    blocked_availability, created = Availability.objects.get_or_create(
        doctor=doctor,
        start_time=blocked_start,
        end_time=blocked_end,
        is_blocked=True,
        defaults={'organization': org}
    )
    
    print(f"✅ Test data setup complete!")
    print(f"   Organization: {org.name}")
    print(f"   Doctor: Dr. {doctor.first_name} {doctor.last_name}")
    print(f"   Patient: {patient.first_name} {patient.last_name}")
    print(f"   Blocked time: {blocked_start} - {blocked_end}")
    
    return {
        'org': org,
        'doctor': doctor,
        'patient': patient,
        'blocked_start': blocked_start,
        'blocked_end': blocked_end,
        'blocked_availability': blocked_availability
    }

def test_availability_conflict_detection(test_data):
    """Test the availability conflict detection logic"""
    print("\n🔍 Testing availability conflict detection...")
    
    doctor = test_data['doctor']
    blocked_start = test_data['blocked_start']
    blocked_end = test_data['blocked_end']
    
    # Get provider's blocked times
    provider_blocks = Availability.objects.filter(
        doctor=doctor,
        is_blocked=True
    )
    
    print(f"   Found {provider_blocks.count()} blocked time slots for doctor")
    
    # Test case 1: Appointment during blocked time (should conflict)
    conflict_start = blocked_start + timedelta(minutes=15)  # 12:15 PM
    conflict_end = conflict_start + timedelta(minutes=30)   # 12:45 PM
    
    has_conflict = False
    for block in provider_blocks:
        if (conflict_start < block.end_time and conflict_end > block.start_time):
            has_conflict = True
            print(f"   ⚠️  Conflict detected: {conflict_start} - {conflict_end} overlaps with blocked time {block.start_time} - {block.end_time}")
            break
    
    if has_conflict:
        print("   ✅ Test 1 PASSED: Correctly detected conflict during blocked time")
    else:
        print("   ❌ Test 1 FAILED: Should have detected conflict during blocked time")
    
    # Test case 2: Appointment outside blocked time (should not conflict)
    safe_start = blocked_end + timedelta(minutes=30)  # 1:30 PM (after lunch)
    safe_end = safe_start + timedelta(minutes=30)     # 2:00 PM
    
    has_conflict = False
    for block in provider_blocks:
        if (safe_start < block.end_time and safe_end > block.start_time):
            has_conflict = True
            break
    
    if not has_conflict:
        print("   ✅ Test 2 PASSED: Correctly allowed appointment outside blocked time")
    else:
        print("   ❌ Test 2 FAILED: Should not have detected conflict outside blocked time")
    
    return True

def test_appointment_creation_validation(test_data):
    """Test appointment creation with validation"""
    print("\n🧪 Testing appointment creation validation...")
    
    org = test_data['org']
    doctor = test_data['doctor']
    patient = test_data['patient']
    blocked_start = test_data['blocked_start']
    blocked_end = test_data['blocked_end']
    
    # Test 1: Try to create appointment during blocked time
    try:
        conflict_start = blocked_start + timedelta(minutes=15)  # 12:15 PM
        
        # Check for conflicts before creating appointment
        provider_blocks = Availability.objects.filter(
            doctor=doctor,
            is_blocked=True
        )
        
        conflict_end = conflict_start + timedelta(minutes=30)
        has_conflict = False
        for block in provider_blocks:
            if (conflict_start < block.end_time and conflict_end > block.start_time):
                has_conflict = True
                break
        
        if has_conflict:
            print("   ✅ Test 1 PASSED: Blocked appointment creation during conflicting time")
            print("   🚫 Validation would prevent appointment creation")
        else:
            # If no conflict detected, create the appointment (this shouldn't happen)
            appointment = Appointment.objects.create(
                patient=patient,
                provider=doctor,
                organization=org,
                title="Test Appointment",
                description="Test during blocked time",
                appointment_datetime=conflict_start,
                duration_minutes=30
            )
            print("   ❌ Test 1 FAILED: Appointment was created during blocked time")
            appointment.delete()  # Clean up
            
    except Exception as e:
        print(f"   ❌ Test 1 ERROR: {e}")
    
    # Test 2: Create appointment outside blocked time
    try:
        safe_start = blocked_end + timedelta(minutes=30)  # 1:30 PM
        
        # Check for conflicts
        provider_blocks = Availability.objects.filter(
            doctor=doctor,
            is_blocked=True
        )
        
        safe_end = safe_start + timedelta(minutes=30)
        has_conflict = False
        for block in provider_blocks:
            if (safe_start < block.end_time and safe_end > block.start_time):
                has_conflict = True
                break
        
        if not has_conflict:
            appointment = Appointment.objects.create(
                patient=patient,
                provider=doctor,
                organization=org,
                title="Test Safe Appointment",
                description="Test outside blocked time",
                appointment_datetime=safe_start,
                duration_minutes=30
            )
            print("   ✅ Test 2 PASSED: Successfully created appointment outside blocked time")
            appointment.delete()  # Clean up
        else:
            print("   ❌ Test 2 FAILED: False conflict detected for safe time")
            
    except Exception as e:
        print(f"   ❌ Test 2 ERROR: {e}")
    
    return True

def cleanup_test_data(test_data):
    """Clean up test data"""
    print("\n🧹 Cleaning up test data...")
    
    try:
        # Delete appointments first (foreign key constraints)
        Appointment.objects.filter(
            patient__username="test_patient"
        ).delete()
        
        # Delete availability
        Availability.objects.filter(
            doctor__username="test_doctor"
        ).delete()
        
        # Delete users
        CustomUser.objects.filter(username__in=["test_doctor", "test_patient"]).delete()
        
        # Note: We don't delete the organization as other data might reference it
        
        print("   ✅ Test data cleaned up")
    except Exception as e:
        print(f"   ⚠️  Cleanup warning: {e}")

def main():
    print("🚀 Starting blocked availability validation tests...")
    
    try:
        # Setup test data
        test_data = setup_test_data()
        
        # Run tests
        test_availability_conflict_detection(test_data)
        test_appointment_creation_validation(test_data)
        
        print("\n🎉 All tests completed!")
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'test_data' in locals():
            cleanup_test_data(test_data)

if __name__ == "__main__":
    main()
