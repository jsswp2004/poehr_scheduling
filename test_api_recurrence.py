#!/usr/bin/env python
"""
Test script to verify recurring appointment creation through the REST API.
"""
import os
import sys
import django
import requests
import json
from datetime import datetime, timedelta

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import Appointment
from users.models import CustomUser, Organization
from django.utils import timezone
from rest_framework.authtoken.models import Token

def test_api_recurrence():
    """Test the recurrence logic through the REST API."""
    print("🧪 Testing recurring appointment creation via API...")
    
    try:
        org = Organization.objects.first()
        doctor = CustomUser.objects.filter(role='doctor', organization=org).first()
        patient = CustomUser.objects.filter(role='patient', organization=org).first()
        
        if not all([org, doctor, patient]):
            print("❌ Missing required objects")
            return
            
        print(f"✅ Objects found: {org.name}, {doctor.get_full_name()}, {patient.get_full_name()}")
        
        # Get or create auth token for the patient
        token, created = Token.objects.get_or_create(user=patient)
        print(f"✅ Auth token: {token.key}")
        
        # Prepare appointment data
        appointment_time = timezone.now() + timedelta(days=1)
        recurrence_end = appointment_time.date() + timedelta(days=10)
        
        data = {
            "title": "API Recurring Test",
            "description": "Testing recurrence via API",
            "appointment_datetime": appointment_time.isoformat(),
            "duration_minutes": 30,
            "recurrence": "weekly",
            "recurrence_end_date": recurrence_end.isoformat(),
            "provider": doctor.id
        }
        
        print(f"📅 Appointment data: {json.dumps(data, indent=2, default=str)}")
        
        # Count appointments before
        before_count = Appointment.objects.filter(
            patient=patient,
            provider=doctor,
            title__contains="API Recurring Test"
        ).count()
        
        # Make API request
        headers = {
            'Authorization': f'Token {token.key}',
            'Content-Type': 'application/json'
        }
        
        print("🚀 Making API request...")
        response = requests.post(
            'http://localhost:8000/api/appointments/',
            headers=headers,
            json=data
        )
        
        print(f"📊 Response status: {response.status_code}")
        if response.status_code == 201:
            print("✅ Appointment created successfully!")
            response_data = response.json()
            print(f"📋 Response: {json.dumps(response_data, indent=2)}")
            
            # Count appointments after
            after_count = Appointment.objects.filter(
                patient=patient,
                provider=doctor,
                title__contains="API Recurring Test"
            ).count()
            
            recurring_appointments = Appointment.objects.filter(
                patient=patient,
                provider=doctor,
                title="API Recurring Test",
                recurrence='none'  # These are the generated recurring instances
            ).order_by('appointment_datetime')
            
            print(f"📊 Appointments before: {before_count}")
            print(f"📊 Appointments after: {after_count}")
            print(f"📊 Generated recurring instances: {recurring_appointments.count()}")
            
            if recurring_appointments.count() > 0:
                print("✅ SUCCESS: Recurring appointments were created via API!")
                for apt in recurring_appointments:
                    print(f"   - {apt.appointment_datetime.strftime('%Y-%m-%d %H:%M')} (ID: {apt.id})")
            else:
                print("❌ FAILURE: No recurring appointments were created via API")
                
        else:
            print(f"❌ API request failed: {response.text}")
            
        # Clean up
        print("\n🧹 Cleaning up test appointments...")
        cleanup_count = Appointment.objects.filter(
            patient=patient,
            provider=doctor,
            title__contains="API Recurring Test"
        ).delete()[0]
        print(f"✅ Deleted {cleanup_count} test appointments")
        
    except Exception as e:
        print(f"❌ Error during API testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_api_recurrence()
