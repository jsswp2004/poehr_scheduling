#!/usr/bin/env python
"""
Test script to verify recurring appointment creation works properly.
"""
import os
import sys
import django
from datetime import datetime, timedelta

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import Appointment
from users.models import CustomUser, Organization
from django.utils import timezone

def test_recurrence_logic():
    """Test the recurrence logic by creating a recurring appointment."""
    print("🧪 Testing recurring appointment creation...")
    
    # Try to find existing users and organization for testing
    try:
        org = Organization.objects.first()
        if not org:
            print("❌ No organization found in database")
            return
            
        doctor = CustomUser.objects.filter(role='doctor', organization=org).first()
        patient = CustomUser.objects.filter(role='patient', organization=org).first()
        
        if not doctor or not patient:
            print("❌ Could not find doctor and patient for testing")
            print(f"Doctor found: {doctor is not None}")
            print(f"Patient found: {patient is not None}")
            return
            
        print(f"✅ Found organization: {org.name}")
        print(f"✅ Found doctor: {doctor.get_full_name()}")
        print(f"✅ Found patient: {patient.get_full_name()}")
        
        # Create a recurring appointment
        appointment_time = timezone.now() + timedelta(days=1)
        recurrence_end = appointment_time.date() + timedelta(days=10)
        
        print(f"📅 Creating weekly recurring appointment from {appointment_time.date()} to {recurrence_end}")
        
        # Count appointments before
        before_count = Appointment.objects.filter(
            patient=patient,
            provider=doctor,
            title__contains="Test Recurring"
        ).count()
        
        appointment = Appointment.objects.create(
            patient=patient,
            provider=doctor,
            organization=org,
            title="Test Recurring Appointment",
            description="Testing recurring appointment logic",
            appointment_datetime=appointment_time,
            duration_minutes=30,
            recurrence='weekly',
            recurrence_end_date=recurrence_end
        )
        
        print(f"✅ Created main appointment: ID {appointment.id}")
        
        # Count appointments after
        after_count = Appointment.objects.filter(
            patient=patient,
            provider=doctor,
            title__contains="Test Recurring"
        ).count()
        
        recurring_appointments = Appointment.objects.filter(
            patient=patient,
            provider=doctor,
            title="Test Recurring Appointment",
            recurrence='none'  # These are the generated recurring instances
        ).order_by('appointment_datetime')
        
        print(f"📊 Appointments before: {before_count}")
        print(f"📊 Appointments after: {after_count}")
        print(f"📊 Generated recurring instances: {recurring_appointments.count()}")
        
        if recurring_appointments.count() > 0:
            print("✅ SUCCESS: Recurring appointments were created!")
            for apt in recurring_appointments[:3]:  # Show first 3
                print(f"   - {apt.appointment_datetime.strftime('%Y-%m-%d %H:%M')} (ID: {apt.id})")
            if recurring_appointments.count() > 3:
                print(f"   ... and {recurring_appointments.count() - 3} more")
        else:
            print("❌ FAILURE: No recurring appointments were created")
            
        # Clean up test data
        print("\n🧹 Cleaning up test appointments...")
        cleanup_count = Appointment.objects.filter(
            patient=patient,
            provider=doctor,
            title__contains="Test Recurring"
        ).delete()[0]
        print(f"✅ Deleted {cleanup_count} test appointments")
        
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_recurrence_logic()
