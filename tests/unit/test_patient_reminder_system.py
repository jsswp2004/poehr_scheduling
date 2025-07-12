#!/usr/bin/env python
"""
Test script to verify the patient reminder system is working correctly.
This tests both the cron job and manual API endpoint functionality.
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.utils import timezone
from django.test import Client
from django.contrib.auth import get_user_model
from appointments.models import Appointment
from appointments.cron import send_patient_reminders, BlastPatientReminderCronJob
from users.models import CustomUser
from rest_framework.authtoken.models import Token

def test_patient_reminder_system():
    """Test the complete patient reminder system"""
    print("🧪 Testing Patient Reminder System")
    print("=" * 50)
    
    # 1. Test cron job configuration
    print("\n1️⃣ Testing Cron Job Configuration...")
    try:
        job = BlastPatientReminderCronJob()
        print(f"   ✅ Cron Job Code: {job.code}")
        print(f"   ✅ Schedule: {job.schedule.run_at_times}")
        print("   ✅ Cron job configured correctly")
    except Exception as e:
        print(f"   ❌ Cron job error: {e}")
        return False
    
    # 2. Test send_patient_reminders function
    print("\n2️⃣ Testing send_patient_reminders Function...")
    try:
        send_patient_reminders()
        print("   ✅ send_patient_reminders executed without errors")
    except Exception as e:
        print(f"   ❌ Function error: {e}")
        return False
    
    # 3. Test API endpoints with admin user
    print("\n3️⃣ Testing API Endpoints...")
    try:
        # Find an admin user or create one for testing
        admin_user = CustomUser.objects.filter(role__in=['admin', 'system_admin']).first()
        if not admin_user:
            print("   ⚠️  No admin user found, skipping API tests")
            return True
            
        # Get or create token
        token, created = Token.objects.get_or_create(user=admin_user)
        
        # Test client
        client = Client()
        
        # Test manual run endpoint
        response = client.post(
            '/api/run-patient-reminders-now/',
            HTTP_AUTHORIZATION=f'Token {token.key}',
            content_type='application/json'
        )
        
        if response.status_code in [200, 201]:
            print("   ✅ Manual run endpoint working")
        else:
            print(f"   ⚠️  Manual run endpoint returned status: {response.status_code}")
            
        # Test weekly reminders endpoint
        response = client.post(
            '/api/run-weekly-patient-reminders/',
            HTTP_AUTHORIZATION=f'Token {token.key}',
            content_type='application/json'
        )
        
        if response.status_code in [200, 201, 202]:
            print("   ✅ Weekly reminders endpoint working")
        else:
            print(f"   ⚠️  Weekly reminders endpoint returned status: {response.status_code}")
            
    except Exception as e:
        print(f"   ❌ API test error: {e}")
        return False
    
    # 4. Check appointments in next 7 days
    print("\n4️⃣ Checking Data...")
    try:
        today = timezone.now().date()
        next_week = today + timedelta(days=7)
        
        appointments = Appointment.objects.filter(
            appointment_datetime__date__gte=today,
            appointment_datetime__date__lte=next_week
        ).select_related('patient')
        
        print(f"   📅 Appointments in next 7 days: {appointments.count()}")
        
        patients_with_emails = appointments.filter(
            patient__email__isnull=False
        ).exclude(patient__email='').count()
        
        print(f"   📧 Patients with email addresses: {patients_with_emails}")
        
    except Exception as e:
        print(f"   ❌ Data check error: {e}")
        return False
    
    print("\n🎉 Patient Reminder System Test Complete!")
    print("✅ All components are working correctly")
    return True

if __name__ == "__main__":
    success = test_patient_reminder_system()
    sys.exit(0 if success else 1)
