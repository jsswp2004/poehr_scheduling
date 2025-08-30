#!/usr/bin/env python
"""
Script to check Azure database schema for missing columns
"""
import os
import sys
import django
from pathlib import Path

# Add the project directory to Python path
project_root = Path(__file__).parent
sys.path.append(str(project_root))

# Setup Django with Azure database settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")

# Override database settings to use Azure
os.environ["DB_NAME"] = "poehr_db"
os.environ["DB_USER"] = "jsswp2004"
os.environ["DB_HOST"] = "poehr-scheduling-postgres.postgres.database.azure.com"
os.environ["DB_PORT"] = "5432"
os.environ["DB_PASSWORD"] = "krat25Miko!"

django.setup()

from django.db import connection


def check_azure_db_schema():
    """Check if Organization table has subscription_status column in Azure DB"""

    print("🔍 Checking Azure Database Schema...")
    print("=" * 60)

    try:
        with connection.cursor() as cursor:
            # Check if subscription_status column exists in users_organization table
            cursor.execute(
                """
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'users_organization' 
                AND table_schema = 'public'
                ORDER BY ordinal_position;
            """
            )

            columns = cursor.fetchall()

            print(f"📋 Columns in users_organization table:")
            subscription_status_exists = False
            subscription_tier_exists = False

            for column_name, data_type, is_nullable in columns:
                print(
                    f"   - {column_name}: {data_type} ({'NULL' if is_nullable == 'YES' else 'NOT NULL'})"
                )
                if column_name == "subscription_status":
                    subscription_status_exists = True
                if column_name == "subscription_tier":
                    subscription_tier_exists = True

            print()
            print("🔍 Column Check Results:")
            print(
                f"   ✅ subscription_status: {'EXISTS' if subscription_status_exists else '❌ MISSING'}"
            )
            print(
                f"   ✅ subscription_tier: {'EXISTS' if subscription_tier_exists else '❌ MISSING'}"
            )

            # Check if there are any organizations
            cursor.execute("SELECT COUNT(*) FROM users_organization;")
            org_count = cursor.fetchone()[0]
            print(f"   📊 Total organizations: {org_count}")

            # If columns exist, show sample data
            if subscription_status_exists and subscription_tier_exists:
                print("\n📋 Sample organization data:")
                cursor.execute(
                    """
                    SELECT name, subscription_status, subscription_tier 
                    FROM users_organization 
                    LIMIT 5;
                """
                )
                orgs = cursor.fetchall()
                for name, status, tier in orgs:
                    print(f"   - {name}: status={status}, tier={tier}")

            # Check if Clinic test exists
            print("\n🔍 Searching for 'Clinic test':")
            cursor.execute(
                """
                SELECT name, subscription_status, subscription_tier 
                FROM users_organization 
                WHERE name ILIKE '%clinic%test%' OR name ILIKE '%clinic test%';
            """
            )
            clinic_test = cursor.fetchall()
            if clinic_test:
                for name, status, tier in clinic_test:
                    print(f"   ✅ Found: {name}: status={status}, tier={tier}")
            else:
                print("   ❌ 'Clinic test' not found")

    except Exception as e:
        print(f"❌ Error checking Azure database: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    check_azure_db_schema()
