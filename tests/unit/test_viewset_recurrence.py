#!/usr/bin/env python
"""
Comprehensive test script to verify recurring appointment creation using Django REST framework directly.
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
from appointments.views import AppointmentViewSet
from appointments.serializers import AppointmentSerializer
from rest_framework.test import APIRequestFactory
from django.test import RequestFactory

def test_viewset_recurrence():
    """Test the recurrence logic through the ViewSet perform_create method."""
    print("🧪 Testing recurring appointment creation via ViewSet...")
    
    try:
        org = Organization.objects.first()
        doctor = CustomUser.objects.filter(role='doctor', organization=org).first()
        patient = CustomUser.objects.filter(role='patient', organization=org).first()
        
        if not all([org, doctor, patient]):
            print("❌ Missing required objects")
            return
            
        print(f"✅ Objects found: {org.name}, {doctor.get_full_name()}, {patient.get_full_name()}")
        
        # Create a mock request
        factory = APIRequestFactory()
        
        # Prepare appointment data
        appointment_time = timezone.now() + timedelta(days=1)
        recurrence_end = appointment_time.date() + timedelta(days=10)
        
        data = {
            "title": "ViewSet Recurring Test",
            "description": "Testing recurrence via ViewSet",
            "appointment_datetime": appointment_time,
            "duration_minutes": 30,
            "recurrence": "weekly",
            "recurrence_end_date": recurrence_end,
            "provider": doctor.id,
            "patient": patient.id
        }
        
        print(f"📅 Appointment data prepared")
        
        # Count appointments before
        before_count = Appointment.objects.filter(
            patient=patient,
            provider=doctor,
            title__contains="ViewSet Recurring Test"
        ).count()
        
        print(f"📊 Appointments before: {before_count}")
        
        # Create serializer and validate data
        serializer = AppointmentSerializer(data=data)
        if serializer.is_valid():
            print("✅ Serializer validation passed")
            
            # Create a mock request object
            request = factory.post('/api/appointments/', data)
            request.user = patient
            request.data = data
            
            # Create viewset instance
            viewset = AppointmentViewSet()
            viewset.request = request
            
            print("🚀 Calling perform_create...")
            
            # Call perform_create directly
            try:
                viewset.perform_create(serializer)
                print("✅ perform_create completed successfully")
                
                # Count appointments after
                after_count = Appointment.objects.filter(
                    patient=patient,
                    provider=doctor,
                    title__contains="ViewSet Recurring Test"
                ).count()
                
                recurring_appointments = Appointment.objects.filter(
                    patient=patient,
                    provider=doctor,
                    title="ViewSet Recurring Test"
                ).order_by('appointment_datetime')
                
                main_appointment = recurring_appointments.filter(recurrence='weekly').first()
                generated_appointments = recurring_appointments.filter(recurrence='none')
                
                print(f"📊 Appointments after: {after_count}")
                print(f"📊 Main appointment: {main_appointment.id if main_appointment else 'None'}")
                print(f"📊 Generated recurring instances: {generated_appointments.count()}")
                
                if generated_appointments.count() > 0:
                    print("✅ SUCCESS: Recurring appointments were created via ViewSet!")
                    for apt in generated_appointments:
                        print(f"   - {apt.appointment_datetime.strftime('%Y-%m-%d %H:%M')} (ID: {apt.id})")
                else:
                    print("❌ FAILURE: No recurring appointments were created via ViewSet")
                    
            except Exception as e:
                print(f"❌ Error in perform_create: {e}")
                import traceback
                traceback.print_exc()
                
        else:
            print(f"❌ Serializer validation failed: {serializer.errors}")
            
        # Clean up
        print("\n🧹 Cleaning up test appointments...")
        cleanup_count = Appointment.objects.filter(
            title__contains="ViewSet Recurring Test"
        ).delete()[0]
        print(f"✅ Deleted {cleanup_count} test appointments")
        
    except Exception as e:
        print(f"❌ Error during ViewSet testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_viewset_recurrence()
