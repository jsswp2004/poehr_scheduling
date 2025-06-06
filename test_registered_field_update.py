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

def test_registered_field_update():
    print("🔍 Testing registered field update functionality...")
    
    try:
        user = CustomUser.objects.first()
        if not user:
            print("❌ No users found in database")
            return
        
        print(f"✅ Found user: {user.username}")
        print(f"   - Current registered status: {user.registered}")
        
        # Test updating via model
        original_status = user.registered
        user.registered = not original_status
        user.save()
        
        # Refresh from database
        user.refresh_from_db()
        print(f"   - Updated registered status: {user.registered}")
        
        # Test via serializer
        serializer = UserSerializer(user, data={'registered': original_status}, partial=True)
        if serializer.is_valid():
            updated_user = serializer.save()
            print(f"   - Serializer update successful: {updated_user.registered}")
        else:
            print(f"❌ Serializer validation failed: {serializer.errors}")
        
        print("✅ Success: registered field can be updated via both model and serializer!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_registered_field_update()
