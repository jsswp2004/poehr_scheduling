#!/usr/bin/env python
"""
Test script to verify AutoEmail model and integration
"""

import os
import sys
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import AutoEmail, Appointment, EnvironmentSetting
from appointments.serializers import AutoEmailSerializer
from django.utils import timezone
from datetime import timedelta

def test_imports():
    print("All imports successful!")

def test_autoemail_model():
    try:
        # Create a test AutoEmail
        auto_email = AutoEmail.objects.create(
            auto_message_frequency='weekly',
            auto_message_day_of_week=1,  # Monday
            auto_message_start_date=timezone.now().date() + timedelta(days=1),
            is_active=True
        )
        print(f"Created AutoEmail: {auto_email}")
        
        # Test serialization
        serializer = AutoEmailSerializer(auto_email)
        print(f"Serialized data: {serializer.data}")
        
        # Clean up
        auto_email.delete()
        print("Test AutoEmail deleted")
    except Exception as e:
        print(f"Error in test_autoemail_model: {e}")

if __name__ == "__main__":
    print("Starting AutoEmail integration test script")
    test_imports()
    test_autoemail_model()
    print("Tests completed")
