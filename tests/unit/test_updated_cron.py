#!/usr/bin/env python
"""
Test script to verify the updated cron system works
"""

import os
import sys
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.cron import send_patient_reminders
from appointments.models import AutoEmail

def test_cron_function():
    print("Testing updated cron function...")
    
    # Check if there are any AutoEmail configurations
    configs = AutoEmail.objects.all()
    print(f"Found {configs.count()} AutoEmail configurations:")
    for config in configs:
        print(f"  - {config}")
    
    # Test the cron function
    try:
        send_patient_reminders()
        print("✅ Cron function executed successfully!")
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    test_cron_function()
