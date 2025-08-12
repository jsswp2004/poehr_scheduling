#!/usr/bin/env python
"""
Django migration script for Azure deployment
Applies pending migrations to the Azure PostgreSQL database
"""
import os
import sys
import django
from django.core.management import execute_from_command_line

if __name__ == "__main__":
    # Set Django settings for Azure
    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_azure"
    )

    # Setup Django
    django.setup()

    print("🔧 Starting Azure database migration...")

    try:
        # Run migrations
        print("📋 Applying all pending migrations...")
        execute_from_command_line(["manage.py", "migrate"])
        print("✅ Migrations completed successfully!")

        # Show migration status
        print("\n📋 Current migration status:")
        execute_from_command_line(["manage.py", "showmigrations"])

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
