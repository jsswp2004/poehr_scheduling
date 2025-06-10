#!/usr/bin/env python
import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import Appointment
from appointments.serializers import AppointmentSerializer
from datetime import date, datetime
import json

def test_appointment_fields():
    print("=== Testing Appointment Model and API Fields ===")
    
    # Check model fields
    fields = [f.name for f in Appointment._meta.fields]
    print(f"Model fields: {fields}")
    print(f"Has 'arrived' field: {'arrived' in fields}")
    print(f"Has 'no_show' field: {'no_show' in fields}")
    
    # Get appointments
    appointments = Appointment.objects.all()
    print(f"\nTotal appointments: {appointments.count()}")
    
    if appointments.exists():
        apt = appointments.first()
        print(f"\nSample appointment (ID {apt.id}):")
        print(f"  - arrived: {apt.arrived}")
        print(f"  - no_show: {apt.no_show}")
        print(f"  - appointment_datetime: {apt.appointment_datetime}")
        
        # Test serializer
        serializer = AppointmentSerializer(apt)
        data = serializer.data
        
        print(f"\nSerialized data:")
        print(f"  - Has 'arrived': {'arrived' in data}")
        print(f"  - Has 'no_show': {'no_show' in data}")
        print(f"  - arrived value: {data.get('arrived')}")
        print(f"  - no_show value: {data.get('no_show')}")
        
        print(f"\nAll serialized keys: {list(data.keys())}")
        
        # Create today's appointment for testing
        today = date.today()
        today_appointments = appointments.filter(appointment_datetime__date=today)
        print(f"\nAppointments for today ({today}): {today_appointments.count()}")
        
        if not today_appointments.exists():
            print("Creating a test appointment for today...")
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            # Get first user as patient and provider
            user = User.objects.first()
            if user:
                test_apt = Appointment.objects.create(
                    patient=user,
                    provider=user,
                    title="Test Appointment",
                    description="Test appointment for today",
                    appointment_datetime=datetime.combine(today, datetime.now().time()),
                    duration_minutes=30,
                    arrived=False,
                    no_show=False
                )
                print(f"Created test appointment with ID: {test_apt.id}")
                print(f"  - arrived: {test_apt.arrived}")
                print(f"  - no_show: {test_apt.no_show}")
    else:
        print("No appointments found. Creating test data...")
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        user = User.objects.first()
        if user:
            test_apt = Appointment.objects.create(
                patient=user,
                provider=user,
                title="Test Appointment",
                description="Test appointment for today",
                appointment_datetime=datetime.combine(date.today(), datetime.now().time()),
                duration_minutes=30,
                arrived=False,
                no_show=False
            )
            print(f"Created test appointment with ID: {test_apt.id}")

if __name__ == "__main__":
    test_appointment_fields()
