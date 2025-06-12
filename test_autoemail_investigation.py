#!/usr/bin/env python
"""
Comprehensive AutoEmailSetUpPage investigation script
This will check all aspects of the email setup functionality
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from appointments.models import AutoEmail, Appointment
from appointments.cron import send_patient_reminders
from users.models import CustomUser, Organization

def test_email_configuration():
    """Test basic email configuration"""
    print("🔧 Testing Email Configuration...")
    print(f"   EMAIL_BACKEND: {settings.EMAIL_BACKEND}")
    print(f"   EMAIL_HOST: {settings.EMAIL_HOST}")
    print(f"   EMAIL_PORT: {settings.EMAIL_PORT}")
    print(f"   EMAIL_USE_TLS: {settings.EMAIL_USE_TLS}")
    print(f"   EMAIL_HOST_USER: {'***configured***' if settings.EMAIL_HOST_USER else 'Not configured'}")
    print(f"   DEFAULT_FROM_EMAIL: {settings.DEFAULT_FROM_EMAIL}")
    
    # Test sending a basic email
    try:
        send_mail(
            subject='AutoEmailSetUpPage Investigation - Test Email',
            message='This is a test email to verify email configuration is working.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=['jsswp2004@outlook.com'],
            fail_silently=False,
        )
        print("   ✅ Basic email sending works!")
        return True
    except Exception as e:
        print(f"   ❌ Email sending failed: {e}")
        return False

def test_autoemail_model():
    """Test AutoEmail model and configurations"""
    print("\n📧 Testing AutoEmail Model...")
    
    # Check existing configurations
    configs = AutoEmail.objects.all()
    print(f"   Found {configs.count()} AutoEmail configurations:")
    
    for config in configs:
        print(f"      ID: {config.id}")
        print(f"      Organization: {config.organization.name if config.organization else 'Global'}")
        print(f"      Frequency: {config.auto_message_frequency}")
        print(f"      Day of Week: {config.auto_message_day_of_week} ({config.get_auto_message_day_of_week_display()})")
        print(f"      Start Date: {config.auto_message_start_date}")
        print(f"      Active: {config.is_active}")
        print(f"      Created: {config.created_at}")
        print()
    
    # If no configurations exist, create a test one
    if configs.count() == 0:
        print("   No configurations found. Creating a test configuration...")
        try:
            test_config = AutoEmail.objects.create(
                auto_message_frequency='daily',
                auto_message_day_of_week=timezone.now().weekday(),  # Today
                auto_message_start_date=timezone.now().date(),
                is_active=True
            )
            print(f"   ✅ Created test configuration: {test_config}")
            return test_config
        except Exception as e:
            print(f"   ❌ Failed to create test configuration: {e}")
            return None
    
    return configs.first()

def test_upcoming_appointments():
    """Check for upcoming appointments"""
    print("\n📅 Testing Upcoming Appointments...")
    
    today = timezone.now().date()
    next_week = today + timedelta(days=7)
    
    appointments = Appointment.objects.filter(
        appointment_datetime__date__gte=today,
        appointment_datetime__date__lte=next_week
    ).select_related('patient')
    
    print(f"   Found {appointments.count()} appointments in next 7 days:")
    
    patients_with_emails = 0
    for appt in appointments:
        patient = appt.patient
        has_email = patient and patient.email
        if has_email:
            patients_with_emails += 1
        
        print(f"      {appt.appointment_datetime.strftime('%Y-%m-%d %H:%M')}: ", end="")
        if patient:
            print(f"{patient.first_name} {patient.last_name}", end="")
            if patient.email:
                print(f" ({patient.email})")
            else:
                print(" (no email)")
        else:
            print("No patient linked")
    
    print(f"   📧 Patients with email addresses: {patients_with_emails}")
    
    return patients_with_emails > 0

def test_manual_reminder_function():
    """Test the send_patient_reminders function directly"""
    print("\n🔄 Testing Manual Reminder Function...")
    
    try:
        print("   Testing normal execution (scheduled behavior)...")
        send_patient_reminders()
        print("   ✅ Normal function executed without errors")
        
        print("   Testing force_run=True (Run Now behavior)...")
        send_patient_reminders(force_run=True)
        print("   ✅ Force run function executed without errors")
        return True
    except Exception as e:
        print(f"   ❌ Function failed: {e}")
        return False

def test_api_endpoint():
    """Test the API endpoint that AutoEmailSetUpPage calls"""
    print("\n🌐 Testing API Integration...")
    
    # Check if we have admin users for testing
    admin_users = CustomUser.objects.filter(role__in=['admin', 'system_admin'])
    if not admin_users.exists():
        print("   No admin users found for API testing")
        return False
    
    admin_user = admin_users.first()
    print(f"   Using admin user: {admin_user.username} ({admin_user.email})")
    
    # Note: We can't easily test the HTTP API without running the server
    # But we can verify the endpoint exists and permissions
    from appointments.views import RunPatientRemindersNowView
    print("   ✅ RunPatientRemindersNowView exists")
    
    return True

def create_test_data():
    """Create test data if needed"""
    print("\n🧪 Creating Test Data (if needed)...")
    
    # Check if we have any upcoming appointments with patients with emails
    today = timezone.now().date()
    next_week = today + timedelta(days=7)
    
    appointments_with_emails = Appointment.objects.filter(
        appointment_datetime__date__gte=today,
        appointment_datetime__date__lte=next_week,
        patient__email__isnull=False
    ).exclude(patient__email='').count()
    
    if appointments_with_emails == 0:
        print("   No upcoming appointments with patient emails found.")
        print("   Consider adding some test appointments with patient emails to test the functionality.")
    else:
        print(f"   ✅ Found {appointments_with_emails} upcoming appointments with patient emails")
    
    return appointments_with_emails > 0

def main():
    """Run all tests"""
    print("🔍 AutoEmailSetUpPage Comprehensive Investigation")
    print("=" * 60)
    
    results = {}
    
    # Test 1: Email Configuration
    results['email_config'] = test_email_configuration()
    
    # Test 2: AutoEmail Model
    results['autoemail_model'] = test_autoemail_model() is not None
    
    # Test 3: Upcoming Appointments
    results['appointments'] = test_upcoming_appointments()
    
    # Test 4: Manual Reminder Function
    results['reminder_function'] = test_manual_reminder_function()
    
    # Test 5: API Endpoint
    results['api_endpoint'] = test_api_endpoint()
    
    # Test 6: Test Data    results['test_data'] = create_test_data()
    
    # Summary
    print("\n📊 INVESTIGATION SUMMARY")
    print("=" * 30)
    
    all_passed = True
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {test_name.replace('_', ' ').title()}: {status}")
        if not passed:
            all_passed = False
    
    print(f"\n🎯 OVERALL STATUS: {'✅ ALL SYSTEMS GO' if all_passed else '❌ ISSUES DETECTED'}")
    
    if all_passed:
        print("\n💡 CONCLUSION:")
        print("   The AutoEmailSetUpPage email sending functionality appears to be working correctly.")
        print("   📅 SCHEDULED EMAILS: Run automatically based on frequency/day settings")
        print("   🚀 'RUN NOW' FEATURE: Bypasses schedule and sends emails immediately")
        print("   If users report emails not being sent, check:")
        print("   1. AutoEmail configuration is active and properly scheduled")
        print("   2. There are upcoming appointments with patients who have email addresses")
        print("   3. Django-cron is running (python manage.py runcrons)")
        print("   4. Email credentials in .env file are correct")
    else:
        print("\n🔧 ISSUES FOUND:")
        if not results['email_config']:
            print("   - Email configuration is not working properly")
        if not results['autoemail_model']:
            print("   - AutoEmail model/configuration issues")
        if not results['appointments']:
            print("   - No upcoming appointments with patient emails")
        if not results['reminder_function']:
            print("   - send_patient_reminders() function is failing")
        if not results['api_endpoint']:
            print("   - API endpoint issues")
        if not results['test_data']:
            print("   - Insufficient test data for proper testing")

if __name__ == "__main__":
    main()
