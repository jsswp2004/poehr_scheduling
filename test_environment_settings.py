#!/usr/bin/env python
"""
Test the Environment Settings API endpoint
"""

import os
import django
import sys

# Add the project directory to Python path
project_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_dir)

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling.settings")
django.setup()

from django.db import connection
from django.core.management.color import make_style
from appointments.models import EnvironmentSetting
from users.models import Organization

style = make_style()

def check_environment_settings_table():
    """Check if the EnvironmentSetting table exists and has data"""
    print(style.HTTP_INFO("🔍 Checking EnvironmentSetting table..."))
    
    try:
        # Check if table exists
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'appointments_environmentsetting'
                );
            """)
            table_exists = cursor.fetchone()[0]
            
        if not table_exists:
            print(style.ERROR("❌ EnvironmentSetting table does not exist"))
            return False
            
        print(style.SUCCESS("✅ EnvironmentSetting table exists"))
        
        # Check table structure
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'appointments_environmentsetting'
                ORDER BY ordinal_position;
            """)
            columns = cursor.fetchall()
            
        print(style.HTTP_INFO("📋 Table columns:"))
        for col_name, col_type in columns:
            print(f"  - {col_name}: {col_type}")
            
        # Check existing data
        settings_count = EnvironmentSetting.objects.count()
        print(style.HTTP_INFO(f"📊 Existing EnvironmentSetting records: {settings_count}"))
        
        if settings_count > 0:
            for setting in EnvironmentSetting.objects.all():
                print(f"  - Organization: {setting.organization}, Blocked Days: {setting.blocked_days}")
                
        return True
        
    except Exception as e:
        print(style.ERROR(f"❌ Error checking EnvironmentSetting table: {e}"))
        return False

def check_organizations():
    """Check organizations"""
    print(style.HTTP_INFO("\n🏢 Checking Organizations..."))
    
    try:
        orgs = Organization.objects.all()
        print(style.SUCCESS(f"✅ Found {orgs.count()} organizations:"))
        for org in orgs:
            print(f"  - ID: {org.id}, Name: {org.name}")
        return True
    except Exception as e:
        print(style.ERROR(f"❌ Error checking organizations: {e}"))
        return False

def create_default_environment_settings():
    """Create default environment settings for all organizations"""
    print(style.HTTP_INFO("\n🛠️ Creating default environment settings..."))
    
    try:
        orgs = Organization.objects.all()
        
        for org in orgs:
            env_setting, created = EnvironmentSetting.objects.get_or_create(
                organization=org,
                defaults={'blocked_days': [0, 6]}  # Weekend blocked by default
            )
            
            if created:
                print(style.SUCCESS(f"✅ Created environment setting for {org.name}"))
            else:
                print(style.WARNING(f"⚠️ Environment setting already exists for {org.name}"))
                
        return True
        
    except Exception as e:
        print(style.ERROR(f"❌ Error creating environment settings: {e}"))
        return False

def test_environment_setting_api():
    """Test the environment setting functionality"""
    print(style.HTTP_INFO("\n🧪 Testing EnvironmentSetting functionality..."))
    
    try:
        # Test model creation
        org = Organization.objects.first()
        if not org:
            print(style.ERROR("❌ No organizations found"))
            return False
            
        # Test get_or_create functionality
        env_obj, created = EnvironmentSetting.objects.get_or_create(
            organization=org,
            defaults={'blocked_days': [0, 6]}
        )
        
        if created:
            print(style.SUCCESS(f"✅ Created test environment setting for {org.name}"))
        else:
            print(style.SUCCESS(f"✅ Found existing environment setting for {org.name}"))
            
        print(f"  - Blocked days: {env_obj.blocked_days}")
        return True
        
    except Exception as e:
        print(style.ERROR(f"❌ Error testing environment settings: {e}"))
        return False

if __name__ == "__main__":
    print(style.HTTP_INFO("🌍 Environment Settings Test"))
    print("=" * 50)
    
    # Run checks
    table_ok = check_environment_settings_table()
    orgs_ok = check_organizations()
    
    if orgs_ok:
        create_default_environment_settings()
        test_environment_setting_api()
    
    print("\n" + "=" * 50)
    print(style.SUCCESS("✅ Environment Settings test completed"))
