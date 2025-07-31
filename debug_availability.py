#!/usr/bin/env python3
"""
Debug script to test the Availability model directly
"""
import os
import sys
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
django.setup()

from appointments.models import Availability, Appointment
from django.contrib.auth.models import User
from django.db import connection
from datetime import datetime, timedelta
from django.utils import timezone

def test_availability_model():
    """Test the Availability model and database queries"""
    print("🔍 Testing Availability model...")
    
    try:
        # Test basic model import
        print("✅ Availability model imported successfully")
        
        # Test database table exists
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'appointments_availability'
                );
            """)
            exists = cursor.fetchone()[0]
            print(f"✅ appointments_availability table exists: {exists}")
            
            # Test table structure
            cursor.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'appointments_availability'
                ORDER BY ordinal_position;
            """)
            columns = cursor.fetchall()
            print(f"✅ Table columns: {[col[0] for col in columns]}")
        
        # Test basic query
        count = Availability.objects.count()
        print(f"✅ Availability records count: {count}")
        
        # Test the exact query from the view
        doctor_id = 22
        now = timezone.now()
        slot_time = now + timedelta(hours=1)
        slot_end_time = slot_time + timedelta(minutes=30)
        
        print(f"🔍 Testing query with doctor_id={doctor_id}")
        print(f"    slot_time={slot_time}")
        print(f"    slot_end_time={slot_end_time}")
        
        blocked_slots = Availability.objects.filter(
            doctor_id=doctor_id,
            is_blocked=True,
            start_time__lt=slot_end_time,
            end_time__gt=slot_time
        )
        
        print(f"✅ Blocked slots query successful: {blocked_slots.count()} results")
        
        # Test appointments query
        appointments = Appointment.objects.filter(
            provider_id=doctor_id,
            appointment_datetime=slot_time
        )
        print(f"✅ Appointments query successful: {appointments.count()} results")
        
        print("✅ All database queries successful!")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_availability_model()
    print(f"\nOverall success: {success}")
    sys.exit(0 if success else 1)
