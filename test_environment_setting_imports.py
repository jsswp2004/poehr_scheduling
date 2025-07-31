#!/usr/bin/env python
"""
Test EnvironmentSetting import and basic functionality
"""

import os
import sys
import django

# Add the project directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')

try:
    django.setup()
    print("✅ Django setup successful")
except Exception as e:
    print(f"❌ Django setup failed: {e}")
    sys.exit(1)

try:
    from appointments.models import EnvironmentSetting
    print("✅ EnvironmentSetting import successful")
except Exception as e:
    print(f"❌ EnvironmentSetting import failed: {e}")
    sys.exit(1)

try:
    from users.models import Organization
    print("✅ Organization import successful")
except Exception as e:
    print(f"❌ Organization import failed: {e}")
    sys.exit(1)

try:
    from appointments.views import EnvironmentSettingView
    print("✅ EnvironmentSettingView import successful")
except Exception as e:
    print(f"❌ EnvironmentSettingView import failed: {e}")
    sys.exit(1)

try:
    from appointments.serializers import EnvironmentSettingSerializer
    print("✅ EnvironmentSettingSerializer import successful")
except Exception as e:
    print(f"❌ EnvironmentSettingSerializer import failed: {e}")
    sys.exit(1)

print("\n🧪 Testing basic model operations...")

try:
    # Test basic model operations
    orgs = Organization.objects.all()
    print(f"✅ Found {orgs.count()} organizations")
    
    if orgs.count() > 0:
        org = orgs.first()
        print(f"✅ First organization: {org.name}")
        
        # Test EnvironmentSetting creation
        env_obj, created = EnvironmentSetting.objects.get_or_create(
            organization=org,
            defaults={'blocked_days': [0, 6]}
        )
        print(f"✅ EnvironmentSetting for {org.name}: created={created}")
        print(f"✅ Blocked days: {env_obj.blocked_days}")
        
    else:
        print("⚠️ No organizations found")
        
except Exception as e:
    print(f"❌ Model operations failed: {e}")
    import traceback
    traceback.print_exc()

print("\n✅ All tests completed")
