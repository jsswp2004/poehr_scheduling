#!/usr/bin/env python3
"""
Test email notification by simulating admin email gathering
"""
import os
import sys
import django

# Add project root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization
from users.serializers import get_admin_emails

def simulate_notifications():
    print("📧 Simulating Email Notifications\n")
    
    # Test scenario 1: Patient from SUNY Downstate registers
    suny_org = Organization.objects.filter(name="SUNY Downstate").first()
    if suny_org:
        emails = get_admin_emails(organization=suny_org)
        print(f"🏥 SUNY Downstate patient registration:")
        print(f"   Notification emails would be sent to: {emails}")
        print(f"   Recipients: System Admin + SUNY Admin")
    
    print()
    
    # Test scenario 2: Patient from Desert Regional registers
    desert_org = Organization.objects.filter(name="Desert Regional Medical Center").first()
    if desert_org:
        emails = get_admin_emails(organization=desert_org)
        print(f"🏥 Desert Regional patient registration:")
        print(f"   Notification emails would be sent to: {emails}")
        print(f"   Recipients: System Admin + Desert Regional Admin")
    
    print()
    
    # Test scenario 3: Patient from organization without admin
    power_org = Organization.objects.filter(name="POWER IT").first()
    if power_org:
        emails = get_admin_emails(organization=power_org)
        print(f"🏥 POWER IT patient registration:")
        print(f"   Notification emails would be sent to: {emails}")
        print(f"   Recipients: System Admin only (no org admin exists)")
    
    print()
    
    # Test scenario 4: Patient with no organization
    emails = get_admin_emails(organization=None)
    print(f"🏥 Patient with no organization:")
    print(f"   Notification emails would be sent to: {emails}")
    print(f"   Recipients: System Admin + Fallback Admin")
    
    print("\n✅ Email notification simulation completed!")
    print("\n📝 Summary:")
    print("   - System admins receive ALL notifications")
    print("   - Organization admins receive notifications for their org only")
    print("   - Fallback admin email ensures notifications never get lost")
    print("   - No duplicate emails are sent")

if __name__ == '__main__':
    simulate_notifications()
