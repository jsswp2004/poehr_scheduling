#!/usr/bin/env python
import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser
from users.serializers import UserSerializer

def test_registered_field():
    print("🔍 Testing registered field in CustomUser model and UserSerializer...")
    
    # Get a user from the database
    try:
        user = CustomUser.objects.first()
        if not user:
            print("❌ No users found in database")
            return
            
        print(f"✅ Found user: {user.username}")
        print(f"   - Phone number: {user.phone_number}")
        print(f"   - Registered: {user.registered}")
        
        # Test the serializer
        serializer = UserSerializer(user)
        serialized_data = serializer.data
        
        print(f"\n📤 Serialized user data includes:")
        for key in sorted(serialized_data.keys()):
            if key in ['phone_number', 'registered']:
                print(f"   - {key}: {serialized_data[key]}")
        
        if 'registered' in serialized_data:
            print("✅ Success: 'registered' field is included in serializer output!")
        else:
            print("❌ Error: 'registered' field is missing from serializer output!")
            
        print(f"\n📋 All available fields: {list(serialized_data.keys())}")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_registered_field()
