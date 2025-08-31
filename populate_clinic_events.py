#!/usr/bin/env python3
"""
Script to populate clinic events with organization associations
"""
import os
import sys
import django

# Add the project directory to Python path
sys.path.append("/c/Users/jsswp/POWER/poehr_scheduling")

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")
django.setup()

from appointments.models import ClinicEvent
from users.models import Organization


def populate_clinic_event_organizations():
    """
    Assign all existing clinic events without organization to all organizations
    This ensures backward compatibility and data availability
    """
    print("🔧 Populating clinic event organizations...")
    print("=" * 60)

    # Get all clinic events without organization
    events_without_org = ClinicEvent.objects.filter(organization__isnull=True)
    organizations = Organization.objects.all()

    print(f"📊 Found {events_without_org.count()} events without organization")
    print(f"📊 Found {organizations.count()} organizations")

    if events_without_org.count() == 0:
        print("✅ All clinic events already have organization assignments")
        return

    if organizations.count() == 0:
        print("❌ No organizations found!")
        return

    # For each organization, duplicate the global clinic events
    duplicated_count = 0
    updated_count = 0

    for event in events_without_org:
        print(f"\n🔄 Processing event: {event.name}")

        # For the first organization, just update the existing event
        first_org = organizations.first()
        event.organization = first_org
        event.save()
        print(f"   ✅ Assigned to {first_org.name}")
        updated_count += 1

        # For remaining organizations, create duplicates
        for org in organizations[1:]:
            new_event = ClinicEvent.objects.create(
                name=event.name,
                description=event.description,
                is_active=event.is_active,
                organization=org,
            )
            print(f"   ✅ Duplicated to {org.name}")
            duplicated_count += 1

    print(f"\n🎉 Completed!")
    print(f"   📝 Updated events: {updated_count}")
    print(f"   📝 Duplicated events: {duplicated_count}")
    print(f"   📝 Total events now: {ClinicEvent.objects.count()}")

    # Show distribution
    print(f"\n📊 Events by organization:")
    for org in organizations:
        count = ClinicEvent.objects.filter(organization=org, is_active=True).count()
        print(f"   - {org.name}: {count} events")


if __name__ == "__main__":
    populate_clinic_event_organizations()
