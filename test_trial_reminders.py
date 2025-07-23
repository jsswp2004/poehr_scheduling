#!/usr/bin/env python3
"""
Test script for trial reminder email functionality
Tests both the management command and API endpoint
"""
import os
import sys
import django
import requests
import json
from datetime import datetime, timedelta

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

def test_management_command():
    """Test the management command for trial reminders"""
    print("🧪 Testing Trial Reminders Management Command")
    print("=" * 50)
    
    print("Testing dry-run mode...")
    import subprocess
    result = subprocess.run([
        'docker', 'exec', 'poehr_scheduling-web-1', 
        'python', 'manage.py', 'send_trial_reminders', '--dry-run', '--days-before=3'
    ], capture_output=True, text=True)
    
    print("Command output:")
    print(result.stdout)
    if result.stderr:
        print("Errors:", result.stderr)
    
    return result.returncode == 0

def test_api_endpoint():
    """Test the API endpoint for trial reminders"""
    print("\n🧪 Testing Trial Reminders API Endpoint")
    print("=" * 50)
    
    # Test data for dry run
    test_data = {
        "days_before": 3,
        "dry_run": True
    }
    
    api_url = "http://127.0.0.1:8000/api/users/trial-reminders/"
    
    try:
        print(f"📤 Sending request to: {api_url}")
        print(f"📋 Test data: {json.dumps(test_data, indent=2)}")
        
        # Note: This would require admin authentication in a real scenario
        response = requests.post(
            api_url,
            json=test_data,
            headers={"Content-Type": "application/json"}
            # In production, you would need: "Authorization": "Bearer <admin-token>"
        )
        
        print(f"📥 Response Status: {response.status_code}")
        
        if response.status_code in [200, 401, 403]:  # 401/403 expected without auth
            if response.status_code == 200:
                data = response.json()
                print("✅ API endpoint is working!")
                print(f"Response: {json.dumps(data, indent=2)}")
            else:
                print(f"⚠️  Expected authentication error: {response.status_code}")
                print("This is normal - the endpoint requires admin authentication")
        else:
            print("❌ Unexpected response!")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Test failed with error: {str(e)}")

def create_test_user_example():
    """Show how to create a test user with expiring trial"""
    print("\n📝 Creating Test User Example")
    print("=" * 40)
    
    print("To test trial reminders, create a user with trial ending in 3 days:")
    print()
    print("1. Django shell command:")
    print("   docker exec -it poehr_scheduling-web-1 python manage.py shell")
    print()
    print("2. In the shell, run:")
    print("""
from users.models import CustomUser, Organization
from datetime import datetime, timedelta
from django.utils import timezone

# Create or get organization
org, _ = Organization.objects.get_or_create(name="Test Trial Org")

# Create test user with trial expiring in 3 days
trial_end = timezone.now().date() + timedelta(days=3)

user = CustomUser.objects.create_user(
    username="trial_test_user",
    email="trial.test@example.com",
    password="testpass123",
    first_name="Trial",
    last_name="Tester",
    role="admin",
    organization=org,
    subscription_tier="premium",
    subscription_status="trial",
    trial_end_date=trial_end
)

print(f"Test user created with trial ending: {trial_end}")
    """)
    print()
    print("3. Then test the management command:")
    print("   docker exec poehr_scheduling-web-1 python manage.py send_trial_reminders --dry-run")

if __name__ == "__main__":
    print("🔧 Trial Reminder System Test Suite")
    print("=" * 60)
    
    print("🔧 Prerequisites:")
    print("• Django server running on http://127.0.0.1:8000")
    print("• Email settings configured in Django")
    print("• At least one user with trial_end_date set")
    print()
    
    response = input("Press Enter to run tests (or 'q' to quit): ")
    if response.lower() != 'q':
        # Test management command
        cmd_success = test_management_command()
        
        # Test API endpoint
        test_api_endpoint()
        
        # Show how to create test data
        create_test_user_example()
        
        print("\n✅ Test suite completed!")
        print("\n📚 Next steps:")
        print("1. Create test users with expiring trials")
        print("2. Set up cron job for automated reminders")
        print("3. Monitor email logs for successful delivery")
    else:
        print("Tests cancelled.")
