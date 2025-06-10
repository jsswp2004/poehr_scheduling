#!/usr/bin/env python
"""Test script to verify appointment status fields work correctly"""

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

def test_appointment_status_fields():
    print("=== Testing Appointment Status Fields ===")
    
    # Check model fields
    fields = [f.name for f in Appointment._meta.fields]
    print(f"✓ Model fields: {', '.join(fields)}")
    print(f"✓ Has 'arrived' field: {'arrived' in fields}")
    print(f"✓ Has 'no_show' field: {'no_show' in fields}")
    
    # Get appointments
    appointments = Appointment.objects.all()
    print(f"\n✓ Total appointments: {appointments.count()}")
    
    if appointments.exists():
        apt = appointments.first()
        print(f"\n✓ Sample appointment (ID {apt.id}):")
        print(f"  - arrived: {apt.arrived}")
        print(f"  - no_show: {apt.no_show}")
        print(f"  - title: {apt.title}")
        print(f"  - datetime: {apt.appointment_datetime}")
        
        # Test serializer
        serializer = AppointmentSerializer(apt)
        data = serializer.data
        
        print(f"\n✓ Serialized data:")
        print(f"  - Has 'arrived': {'arrived' in data}")
        print(f"  - Has 'no_show': {'no_show' in data}")
        print(f"  - arrived value: {data.get('arrived')}")
        print(f"  - no_show value: {data.get('no_show')}")
        print(f"  - All keys: {list(data.keys())}")
        
        # Test updating status
        print(f"\n✓ Testing status update:")
        original_arrived = apt.arrived
        original_no_show = apt.no_show
        
        # Update to arrived
        apt.arrived = True
        apt.no_show = False
        apt.save()
        
        apt.refresh_from_db()
        print(f"  - After setting arrived=True: arrived={apt.arrived}, no_show={apt.no_show}")
        
        # Update to no_show
        apt.arrived = False
        apt.no_show = True
        apt.save()
        
        apt.refresh_from_db()
        print(f"  - After setting no_show=True: arrived={apt.arrived}, no_show={apt.no_show}")
        
        # Restore original values
        apt.arrived = original_arrived
        apt.no_show = original_no_show
        apt.save()
        print(f"  - Restored to original: arrived={apt.arrived}, no_show={apt.no_show}")
        
        # Check today's appointments
        today = date.today()
        today_appointments = appointments.filter(appointment_datetime__date=today)
        print(f"\n✓ Appointments for today ({today}): {today_appointments.count()}")
        
        if not today_appointments.exists():
            print("  - No appointments for today. Creating test appointment...")
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            user = User.objects.first()
            if user:
                test_apt = Appointment.objects.create(
                    patient=user,
                    provider=user,
                    title="Test Today Appointment",
                    description="Test appointment for today to verify checkbox functionality",
                    appointment_datetime=datetime.combine(today, datetime.now().time().replace(second=0, microsecond=0)),
                    duration_minutes=30,
                    arrived=False,
                    no_show=False
                )
                print(f"  - ✓ Created test appointment with ID: {test_apt.id}")
                print(f"    - arrived: {test_apt.arrived}")
                print(f"    - no_show: {test_apt.no_show}")
                print(f"    - datetime: {test_apt.appointment_datetime}")
    else:
        print("\n⚠ No appointments found in database")
        print("Creating test appointments...")
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        users = User.objects.all()[:2]  # Get first 2 users
        if len(users) >= 2:
            # Create an appointment for today
            today_apt = Appointment.objects.create(
                patient=users[0],
                provider=users[1],
                title="Today Test Appointment",
                description="Test appointment for today",
                appointment_datetime=datetime.combine(date.today(), datetime.now().time().replace(second=0, microsecond=0)),
                duration_minutes=30,
                arrived=False,
                no_show=False
            )
            print(f"  - ✓ Created today's appointment with ID: {today_apt.id}")
            
            # Create a past appointment
            from datetime import timedelta
            past_apt = Appointment.objects.create(
                patient=users[1],
                provider=users[0],
                title="Past Test Appointment",
                description="Test appointment from yesterday",
                appointment_datetime=datetime.now() - timedelta(days=1),
                duration_minutes=45,
                arrived=True,
                no_show=False
            )
            print(f"  - ✓ Created past appointment with ID: {past_apt.id}")
        else:
            print("  - ⚠ Not enough users to create test appointments")

    print("\n=== Test Complete ===")

if __name__ == "__main__":
    test_appointment_status_fields()
