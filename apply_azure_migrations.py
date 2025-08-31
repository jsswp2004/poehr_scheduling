#!/usr/bin/env python
"""
Emergency script to apply migrations to Azure database
"""
import os
import sys
import django
from django.core.management import execute_from_command_line

# Set the Django settings module for Azure
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_azure"
)


def main():
    """Apply pending migrations to Azure database"""
    try:
        django.setup()

        print("🔧 Azure Migration Script")
        print("=" * 50)

        # Show current migration status
        print("\n📋 Current migration status:")
        execute_from_command_line(["manage.py", "showmigrations", "appointments"])

        print("\n🚀 Applying migrations to Azure database...")
        execute_from_command_line(["manage.py", "migrate", "appointments"])

        print("\n✅ Migration completed!")

        # Verify the organization_id column exists
        print("\n🔍 Verifying organization_id column exists...")
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'appointments_clinicevent' 
                AND column_name = 'organization_id'
            """
            )
            result = cursor.fetchone()

            if result:
                print(
                    "✅ organization_id column exists in appointments_clinicevent table"
                )
            else:
                print("❌ organization_id column still missing!")

        # Check clinic events count
        print("\n📊 Checking clinic events...")
        from appointments.models import ClinicEvent

        total_events = ClinicEvent.objects.count()
        events_with_org = ClinicEvent.objects.filter(organization__isnull=False).count()
        events_without_org = ClinicEvent.objects.filter(
            organization__isnull=True
        ).count()

        print(f"Total clinic events: {total_events}")
        print(f"Events with organization: {events_with_org}")
        print(f"Events without organization: {events_without_org}")

        if events_without_org > 0:
            print("⚠️  WARNING: Some events don't have organization assignments!")
        else:
            print("✅ All events have organization assignments")

    except Exception as e:
        print(f"❌ Error applying migrations: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
