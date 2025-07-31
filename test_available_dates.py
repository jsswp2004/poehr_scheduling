#!/usr/bin/env python
import os
import sys
import django
import requests
import json

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.db import connection

def test_available_dates_endpoint():
    """Test the available-dates endpoint and check database tables"""
    
    # First check if necessary tables exist
    with connection.cursor() as cursor:
        tables_to_check = [
            'appointments_availability',
            'appointments_appointment',
            'auth_user'
        ]
        
        for table in tables_to_check:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = %s
                );
            """, [table])
            exists = cursor.fetchone()[0]
            print(f"✅ Table {table} exists: {exists}")
            if not exists:
                print(f"❌ Missing table: {table}")
        
        # Check if we have any doctors (users with appropriate role)
        cursor.execute("""
            SELECT id, first_name, last_name, role 
            FROM auth_user 
            WHERE role IN ('doctor', 'admin') 
            LIMIT 5;
        """)
        doctors = cursor.fetchall()
        print(f"\nFound {len(doctors)} doctors/admins:")
        for doc in doctors:
            print(f"  ID: {doc[0]}, Name: {doc[1]} {doc[2]}, Role: {doc[3]}")
        
        # Test the view function directly
        if doctors:
            test_doctor_id = doctors[0][0]
            print(f"\nTesting available dates for doctor ID: {test_doctor_id}")
            
            try:
                from appointments.views import doctor_available_slots
                from django.test import RequestFactory
                from django.contrib.auth import get_user_model
                
                factory = RequestFactory()
                request = factory.get(f'/api/doctors/{test_doctor_id}/available-dates/')
                
                # Add a user to the request
                User = get_user_model()
                request.user = User.objects.first()
                
                response = doctor_available_slots(request, test_doctor_id)
                print(f"✅ View function response status: {response.status_code}")
                print(f"✅ Response data: {response.data}")
                
            except Exception as e:
                print(f"❌ Error testing view function: {e}")
                import traceback
                traceback.print_exc()

if __name__ == "__main__":
    try:
        test_available_dates_endpoint()
        print("✅ Available dates endpoint test completed")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
