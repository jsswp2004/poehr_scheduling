#!/usr/bin/env python
"""
Azure Database Clinic Events Checker
"""
import os
import django
from django.conf import settings

# Configure Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling.settings")
django.setup()

from users.models import Organization, CustomUser
from appointments.models import ClinicEvent


def check_azure_clinic_events():
    print("🔍 Checking Azure Database for Clinic Events...")
    print("=" * 60)

    try:
        # Get test account 3 user
        print("=== CHECKING TEST ACCOUNT 3 (Azure Production) ===")
        test_user = CustomUser.objects.get(username="test_enrollment_fixed")
        print(
            f"User: {test_user.username} ({test_user.first_name} {test_user.last_name})"
        )
        print(f"  Role: {test_user.role}")
        print(
            f'  Organization: {test_user.organization.name if test_user.organization else "None"}'
        )
        print(
            f'  Organization ID: {test_user.organization.id if test_user.organization else "None"}'
        )

        # Check clinic events for this organization
        if test_user.organization:
            clinic_events = ClinicEvent.objects.filter(
                organization=test_user.organization
            )
            print(f"  Clinic Events in this org: {clinic_events.count()}")

            for event in clinic_events.order_by("-id")[:5]:  # Show last 5
                print(f"    - ID {event.id}: {event.name} (Active: {event.is_active})")

        print()

        # Check all test organizations
        print("=== ALL TEST ORGANIZATIONS WITH CLINIC EVENTS (Azure) ===")
        test_orgs = Organization.objects.filter(name__icontains="test")

        for org in test_orgs:
            events_count = ClinicEvent.objects.filter(organization=org).count()
            admin_users = org.users.filter(role="admin")

            print(f"Organization: {org.name} (ID: {org.id})")
            print(f"  Clinic Events: {events_count}")
            print(f"  Admin Users: {[u.username for u in admin_users]}")

            if events_count > 0:
                # Show most recent event
                recent_event = (
                    ClinicEvent.objects.filter(organization=org).order_by("-id").first()
                )
                print(
                    f"  Most Recent Event: ID {recent_event.id} - {recent_event.name}"
                )
            print("  ---")

        print()

        # Show overall recent clinic events
        print("=== RECENT CLINIC EVENTS (Last 10 in Azure) ===")
        recent_events = ClinicEvent.objects.all().order_by("-id")[:10]
        for event in recent_events:
            org_name = event.organization.name if event.organization else "No org"
            print(
                f"  ID {event.id}: {event.name} - {org_name} (Active: {event.is_active})"
            )

    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    check_azure_clinic_events()
