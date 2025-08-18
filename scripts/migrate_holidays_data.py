#!/usr/bin/env python3
"""
Data migration script to assign existing holidays to organizations.
This script should be run after the schema migration.
"""

import os
import sys
import django

# Setup Django environment
project_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(project_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import Holiday
from users.models import Organization

def migrate_existing_holidays():
    """
    Assign existing holidays (organization=NULL) to all organizations.
    This ensures each organization gets a copy of existing holidays.
    """
    print("Starting holiday data migration...")
    
    # Get all existing holidays without organization assignment
    orphaned_holidays = Holiday.objects.filter(organization__isnull=True)
    print(f"Found {orphaned_holidays.count()} holidays without organization assignment")
    
    # Get all organizations
    organizations = Organization.objects.all()
    print(f"Found {organizations.count()} organizations")
    
    if not organizations.exists():
        print("No organizations found. Creating holidays as global (no organization)")
        return
    
    created_count = 0
    
    for holiday in orphaned_holidays:
        print(f"Processing holiday: {holiday.name} ({holiday.date})")
        
        for org in organizations:
            # Create a copy of the holiday for each organization
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
                print(f"  ✅ Created holiday for {org.name}")
            else:
                print(f"  ⚠️  Holiday already exists for {org.name}")
    
    print(f"\n✅ Migration completed!")
    print(f"📊 Created {created_count} organization-specific holidays")
    
    # Optionally delete the orphaned holidays
    delete_orphaned = input("\nDelete original holidays without organization? (y/N): ").lower().strip()
    if delete_orphaned == 'y':
        deleted_count = orphaned_holidays.count()
        orphaned_holidays.delete()
        print(f"🗑️  Deleted {deleted_count} orphaned holidays")
    else:
        print("⚠️  Original holidays kept (you may want to clean them up manually)")

if __name__ == '__main__':
    migrate_existing_holidays()
