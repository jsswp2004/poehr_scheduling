#!/usr/bin/env python3
"""
Azure-compatible script to fix holiday organization isolation.
This script applies the database changes needed for holiday organization isolation.
"""

import os
import sys
import django
from pathlib import Path

# Setup Django environment
project_dir = Path(__file__).parent.parent
sys.path.append(str(project_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.db import connection, transaction
from appointments.models import Holiday
from users.models import Organization

def apply_schema_changes():
    """Apply the database schema changes for holiday organization isolation."""
    print("🔧 Applying schema changes...")
    
    with connection.cursor() as cursor:
        try:
            # Check if organization column already exists
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'appointments_holiday' 
                AND column_name = 'organization_id';
            """)
            
            if cursor.fetchone():
                print("✅ Organization column already exists")
                return True
                
            print("📝 Adding organization column to Holiday model...")
            
            # Add organization_id column
            cursor.execute("""
                ALTER TABLE appointments_holiday 
                ADD COLUMN organization_id INTEGER 
                REFERENCES users_organization(id) ON DELETE CASCADE;
            """)
            
            # Remove old unique constraint if it exists
            cursor.execute("""
                ALTER TABLE appointments_holiday 
                DROP CONSTRAINT IF EXISTS unique_holiday;
            """)
            
            # Add new unique constraint
            cursor.execute("""
                ALTER TABLE appointments_holiday 
                ADD CONSTRAINT unique_holiday_per_org 
                UNIQUE (organization_id, name, date);
            """)
            
            print("✅ Schema changes applied successfully")
            return True
            
        except Exception as e:
            print(f"❌ Error applying schema changes: {e}")
            return False

def migrate_holiday_data():
    """Migrate existing holidays to be organization-specific."""
    print("📊 Starting holiday data migration...")
    
    try:
        with transaction.atomic():
            # Get holidays without organization
            orphaned_holidays = Holiday.objects.filter(organization__isnull=True)
            organizations = Organization.objects.all()
            
            print(f"Found {orphaned_holidays.count()} holidays without organization")
            print(f"Found {organizations.count()} organizations")
            
            if not organizations.exists():
                print("⚠️  No organizations found - skipping migration")
                return True
            
            created_count = 0
            
            # Create organization-specific copies
            for holiday in orphaned_holidays:
                for org in organizations:
                    new_holiday, created = Holiday.objects.get_or_create(
                        organization=org,
                        name=holiday.name,
                        date=holiday.date,
                        defaults={
                            'is_recognized': holiday.is_recognized,
                            'suppressed': holiday.suppressed
                        }
                    )
                    if created:
                        created_count += 1
            
            # Delete orphaned holidays
            deleted_count = orphaned_holidays.count()
            orphaned_holidays.delete()
            
            print(f"✅ Created {created_count} organization-specific holidays")
            print(f"🗑️  Deleted {deleted_count} orphaned holidays")
            return True
            
    except Exception as e:
        print(f"❌ Error migrating holiday data: {e}")
        return False

def main():
    """Main execution function."""
    print("🚀 Starting Holiday Organization Isolation Fix...")
    print("=" * 60)
    
    # Apply schema changes
    schema_success = apply_schema_changes()
    if not schema_success:
        print("❌ Schema changes failed - aborting")
        return False
    
    # Migrate data
    data_success = migrate_holiday_data()
    if not data_success:
        print("❌ Data migration failed")
        return False
    
    print("=" * 60)
    print("🎉 Holiday organization isolation fix completed successfully!")
    print("   Holidays are now properly isolated by organization.")
    return True

if __name__ == '__main__':
    success = main()
    if success:
        print("\n✅ All changes applied successfully!")
    else:
        print("\n❌ Fix failed - please check errors above")
        sys.exit(1)
