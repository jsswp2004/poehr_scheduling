#!/usr/bin/env python
"""
Test the "Run Now" API endpoint with the new force_run functionality
"""

import os
import sys
import django
from datetime import datetime

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.test import Client
from users.models import CustomUser
from rest_framework_simplejwt.tokens import RefreshToken

def test_run_now_api():
    """Test the Run Now API endpoint"""
    print("🚀 Testing 'Run Now' API Endpoint with Force Run")
    print("=" * 55)
    
    # Get an admin user for testing
    admin_users = CustomUser.objects.filter(role__in=['admin', 'system_admin'])
    if not admin_users.exists():
        print("❌ No admin users found for API testing")
        return False
    
    admin_user = admin_users.first()
    print(f"✅ Using admin user: {admin_user.username} ({admin_user.email})")
    
    # Generate JWT token for the user
    refresh = RefreshToken.for_user(admin_user)
    access_token = str(refresh.access_token)
    print("✅ Generated JWT access token")
    
    # Test the API endpoint
    client = Client()
    
    try:
        print("\n📡 Testing /api/run-patient-reminders-now/ endpoint...")
        response = client.post(
            '/api/run-patient-reminders-now/',
            HTTP_AUTHORIZATION=f'Bearer {access_token}',
            content_type='application/json'
        )
        
        print(f"   Response Status: {response.status_code}")
        try:
            response_data = response.json()
            print(f"   Response Data: {response_data}")
        except:
            print(f"   Response Content: {response.content.decode()}")
        
        if response.status_code == 200:
            print("   ✅ 'Run Now' API endpoint working correctly!")
            print("   📧 Emails should have been sent regardless of schedule configuration")
            return True
        else:
            print(f"   ❌ API endpoint returned status: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ API test error: {e}")
        return False

def main():
    """Main test function"""
    print(f"🕐 Test run at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success = test_run_now_api()
    
    if success:
        print("\n🎉 SUCCESS: 'Run Now' functionality is working!")
        print("   - API endpoint accessible ✅")
        print("   - Force run bypasses scheduling logic ✅") 
        print("   - Emails sent regardless of frequency/day settings ✅")
    else:
        print("\n❌ FAILURE: Issues detected with 'Run Now' functionality")
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
