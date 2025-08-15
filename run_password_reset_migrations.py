#!/usr/bin/env python
"""
Script to run missing migrations for django-rest-passwordreset
"""
import os
import sys
import django

# Set Django settings
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_azure_env"
)

# Setup Django
django.setup()

from django.core.management import execute_from_command_line

if __name__ == "__main__":
    print("🔧 Running migrations for django-rest-passwordreset...")
    try:
        execute_from_command_line(["manage.py", "migrate", "django_rest_passwordreset"])
        print("✅ Password reset migrations completed successfully")
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print("🔧 Trying to run all migrations...")
        try:
            execute_from_command_line(["manage.py", "migrate"])
            print("✅ All migrations completed successfully")
        except Exception as e2:
            print(f"❌ All migrations failed: {e2}")
