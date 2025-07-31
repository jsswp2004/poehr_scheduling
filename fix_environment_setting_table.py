#!/usr/bin/env python
"""
Fix EnvironmentSetting Table Structure

This script fixes the EnvironmentSetting table to match Django's ArrayField requirements.
"""

import os
import sys
import django

# Add the project directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.db import connection, transaction
from django.core.management.color import make_style
from appointments.models import EnvironmentSetting
from users.models import Organization

style = make_style()

def fix_environment_setting_table():
    """Fix the EnvironmentSetting table structure"""
    print(style.HTTP_INFO("🔧 Fixing EnvironmentSetting table structure..."))
    
    try:
        with connection.cursor() as cursor:
            # Check if table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'appointments_environmentsetting'
                );
            """)
            table_exists = cursor.fetchone()[0]
            
            if table_exists:
                print(style.WARNING("🗑️ Dropping existing table to recreate with correct structure..."))
                cursor.execute("DROP TABLE IF EXISTS appointments_environmentsetting CASCADE;")
            
            # Create table with correct ArrayField structure
            print(style.MIGRATE_LABEL("Creating EnvironmentSetting table with correct structure..."))
            cursor.execute("""
                CREATE TABLE appointments_environmentsetting (
                    id SERIAL PRIMARY KEY,
                    blocked_days INTEGER[] DEFAULT ARRAY[]::INTEGER[],
                    organization_id INTEGER NOT NULL UNIQUE,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    CONSTRAINT appointments_environmentsetting_organization_id_fkey 
                        FOREIGN KEY (organization_id) 
                        REFERENCES users_organization(id) 
                        ON DELETE CASCADE
                );
            """)
            
            # Create index
            cursor.execute("""
                CREATE INDEX appointments_environmentsetting_organization_id_idx 
                ON appointments_environmentsetting(organization_id);
            """)
            
            print(style.SUCCESS("✅ Created EnvironmentSetting table with correct structure"))
            
        # Now create default settings for all organizations
        print(style.MIGRATE_LABEL("Creating default environment settings..."))
        organizations = Organization.objects.all()
        created_count = 0
        
        for org in organizations:
            try:
                env_obj, created = EnvironmentSetting.objects.get_or_create(
                    organization=org,
                    defaults={'blocked_days': [0, 6]}  # Default: weekends blocked
                )
                if created:
                    created_count += 1
                    print(style.SUCCESS(f"✅ Created environment setting for {org.name}"))
                else:
                    print(style.SUCCESS(f"✅ Environment setting exists for {org.name}"))
            except Exception as e:
                print(style.ERROR(f"❌ Error creating setting for {org.name}: {e}"))
                
        if created_count > 0:
            print(style.SUCCESS(f"✅ Created {created_count} new environment settings"))
        else:
            print(style.SUCCESS("✅ All organizations already have environment settings"))
            
        return True
        
    except Exception as e:
        print(style.ERROR(f"❌ Error fixing EnvironmentSetting table: {e}"))
        return False

def test_environment_setting():
    """Test the EnvironmentSetting functionality"""
    print(style.HTTP_INFO("🧪 Testing EnvironmentSetting functionality..."))
    
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
        
        print(style.SUCCESS(f"✅ Environment setting for {org.name}: {env_obj.blocked_days}"))
        
        # Test updating blocked days
        env_obj.blocked_days = [1, 2, 3]  # Block Mon, Tue, Wed
        env_obj.save()
        
        # Test retrieval
        retrieved = EnvironmentSetting.objects.get(organization=org)
        print(style.SUCCESS(f"✅ Updated and retrieved: {retrieved.blocked_days}"))
        
        # Reset to default
        retrieved.blocked_days = [0, 6]
        retrieved.save()
        
        return True
        
    except Exception as e:
        print(style.ERROR(f"❌ Error testing environment settings: {e}"))
        return False

if __name__ == "__main__":
    print(style.HTTP_INFO("🌍 EnvironmentSetting Table Fix"))
    print("=" * 50)
    
    # Fix the table structure
    if fix_environment_setting_table():
        test_environment_setting()
    
    print("\n" + "=" * 50)
    print(style.SUCCESS("✅ EnvironmentSetting fix completed"))
