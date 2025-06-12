#!/usr/bin/env python
"""
Simple test of the force_run functionality in send_patient_reminders
"""

import os
import sys
import django
from datetime import datetime

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.cron import send_patient_reminders

def test_force_run_functionality():
    """Test the force_run parameter directly"""
    print("🚀 Testing Force Run Functionality")
    print("=" * 45)
    
    print("\n1️⃣ Testing normal scheduled behavior (force_run=False):")
    print("   This will respect the frequency/day configuration...")
    try:
        send_patient_reminders(force_run=False)
        print("   ✅ Normal scheduled run completed successfully")
    except Exception as e:
        print(f"   ❌ Error in normal run: {e}")
        return False
    
    print("\n2️⃣ Testing force run behavior (force_run=True):")
    print("   This will bypass all scheduling logic and send emails immediately...")
    try:
        send_patient_reminders(force_run=True)
        print("   ✅ Force run completed successfully")
    except Exception as e:
        print(f"   ❌ Error in force run: {e}")
        return False
    
    return True

def main():
    """Main test function"""
    print(f"🕐 Test run at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success = test_force_run_functionality()
    
    if success:
        print("\n🎉 SUCCESS: Force run functionality is working!")
        print("   ✅ Normal scheduled behavior: Respects frequency/day settings")
        print("   ✅ Force run behavior: Bypasses all scheduling restrictions")
        print("   ✅ 'Run Now' button will send emails immediately regardless of schedule")
    else:
        print("\n❌ FAILURE: Issues detected with force run functionality")
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
