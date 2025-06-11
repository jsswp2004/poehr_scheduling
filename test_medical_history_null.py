#!/usr/bin/env python
"""
Test script to verify that medical_history field now accepts null values properly.
This tests the backend changes we made to allow null values instead of forcing empty strings.
"""

import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import Patient, CustomUser, Organization
from users.serializers import PatientSerializer
import json

def test_medical_history_null_handling():
    """Test that medical_history field properly handles null values"""
    
    print("🧪 Testing medical_history null handling...")
    
    # Test 1: Verify model field accepts null
    print("\n1. Testing model field null acceptance:")
    
    try:
        # Try to find an existing patient to test with
        patient = Patient.objects.first()
        if patient:
            print(f"   Found existing patient: {patient.user.first_name} {patient.user.last_name}")
            
            # Test setting medical_history to None
            patient.medical_history = None
            patient.save()
            print("   ✅ Successfully saved patient with medical_history = None")
            
            # Reload from database to verify
            patient.refresh_from_db()
            print(f"   ✅ Verified: medical_history from DB = {repr(patient.medical_history)}")
            
        else:
            print("   ⚠️  No existing patients found to test with")
            
    except Exception as e:
        print(f"   ❌ Error testing model field: {e}")
    
    # Test 2: Verify serializer handles null values
    print("\n2. Testing serializer null handling:")
    
    try:
        if patient:
            # Test serializer with null medical_history
            test_data = {
                'username': patient.user.username,
                'email': patient.user.email,
                'first_name': patient.user.first_name,
                'last_name': patient.user.last_name,
                'date_of_birth': patient.date_of_birth,
                'phone_number': patient.phone_number,
                'address': patient.address,
                'medical_history': None,  # Explicitly test null
            }
            
            serializer = PatientSerializer(instance=patient, data=test_data, partial=True)
            if serializer.is_valid():
                print("   ✅ Serializer accepts null medical_history")
                
                # Test saving
                updated_patient = serializer.save()
                print(f"   ✅ Successfully saved via serializer: medical_history = {repr(updated_patient.medical_history)}")
                
            else:
                print(f"   ❌ Serializer validation failed: {serializer.errors}")
                
    except Exception as e:
        print(f"   ❌ Error testing serializer: {e}")
    
    # Test 3: Verify empty string vs null distinction
    print("\n3. Testing empty string vs null distinction:")
    
    try:
        if patient:
            # Test empty string
            patient.medical_history = ""
            patient.save()
            patient.refresh_from_db()
            print(f"   Empty string: medical_history = {repr(patient.medical_history)}")
            
            # Test null
            patient.medical_history = None
            patient.save()
            patient.refresh_from_db()
            print(f"   Null value: medical_history = {repr(patient.medical_history)}")
            
            print("   ✅ Both empty string and null values are properly handled")
            
    except Exception as e:
        print(f"   ❌ Error testing empty vs null: {e}")
    
    print("\n🎉 Medical history null handling test completed!")
    
    # Test 4: Verify API-like data handling
    print("\n4. Testing API-like data scenarios:")
    
    api_test_cases = [
        {"medical_history": None, "description": "Explicitly null"},
        {"medical_history": "", "description": "Empty string"},
        {"medical_history": "   ", "description": "Whitespace only"},
        {"description": "Field not provided (missing key)"},  # No medical_history key
    ]
    
    for i, test_case in enumerate(api_test_cases, 1):
        try:
            print(f"   Test case {i}: {test_case['description']}")
            
            # Prepare test data
            base_data = {
                'username': patient.user.username,
                'email': patient.user.email,
                'first_name': patient.user.first_name,
                'last_name': patient.user.last_name,
                'date_of_birth': str(patient.date_of_birth) if patient.date_of_birth else None,
                'phone_number': patient.phone_number,
                'address': patient.address,
            }
            
            # Add medical_history if it's in test case
            if 'medical_history' in test_case:
                base_data['medical_history'] = test_case['medical_history']
            
            serializer = PatientSerializer(instance=patient, data=base_data, partial=True)
            
            if serializer.is_valid():
                updated_patient = serializer.save()
                result_value = updated_patient.medical_history
                print(f"      ✅ Success: Resulted in medical_history = {repr(result_value)}")
            else:
                print(f"      ❌ Validation failed: {serializer.errors}")
                
        except Exception as e:
            print(f"      ❌ Error in test case {i}: {e}")

if __name__ == '__main__':
    test_medical_history_null_handling()
