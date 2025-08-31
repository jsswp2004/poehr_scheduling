#!/usr/bin/env python3
"""
Direct PostgreSQL fix for Azure database - adds organization_id column to clinic events
"""
import os
import psycopg2
from psycopg2 import sql

# Azure Database credentials (you'll need to fill these in)
DB_CONFIG = {
    "host": "poehr-db-server.postgres.database.azure.com",  # Replace with actual Azure DB host
    "port": "5432",
    "database": "poehr_db",  # Replace with actual database name
    "user": "poehr_admin",  # Replace with actual username
    "password": "",  # You'll need to provide this
    "sslmode": "require",
}


def fix_clinic_events_table():
    """Add organization_id column and populate data"""

    # First, let's try to get the password from environment or prompt
    password = os.environ.get("AZURE_DB_PASSWORD") or input("Enter Azure DB password: ")
    DB_CONFIG["password"] = password

    try:
        # Connect to database
        print("🔌 Connecting to Azure PostgreSQL...")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        print("✅ Connected successfully!")

        # Check if organization_id column already exists
        print("🔍 Checking if organization_id column exists...")
        cursor.execute(
            """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'appointments_clinicevent' 
            AND column_name = 'organization_id'
        """
        )

        if cursor.fetchone():
            print("✅ organization_id column already exists!")
            return

        print("➕ Adding organization_id column...")
        cursor.execute(
            """
            ALTER TABLE appointments_clinicevent 
            ADD COLUMN organization_id INTEGER REFERENCES users_organization(id) ON DELETE CASCADE
        """
        )

        print("📊 Getting organization and clinic event counts...")
        cursor.execute("SELECT COUNT(*) FROM users_organization")
        org_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM appointments_clinicevent")
        event_count = cursor.fetchone()[0]

        print(f"Found {org_count} organizations and {event_count} clinic events")

        if org_count > 0 and event_count > 0:
            print("🔄 Populating organization_id for existing clinic events...")

            # Get the first organization ID to assign to existing events
            cursor.execute("SELECT id FROM users_organization ORDER BY id LIMIT 1")
            first_org_id = cursor.fetchone()[0]

            # Assign all existing clinic events to the first organization
            cursor.execute(
                """
                UPDATE appointments_clinicevent 
                SET organization_id = %s 
                WHERE organization_id IS NULL
            """,
                (first_org_id,),
            )

            updated_count = cursor.rowcount
            print(
                f"✅ Updated {updated_count} clinic events with organization_id = {first_org_id}"
            )

        print("💾 Committing changes...")
        conn.commit()

        print("🎉 Successfully fixed clinic events table!")

    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        if "conn" in locals():
            conn.rollback()
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if "cursor" in locals():
            cursor.close()
        if "conn" in locals():
            conn.close()
        print("🔌 Database connection closed")


if __name__ == "__main__":
    print("🔧 Azure Database Direct Fix")
    print("=" * 50)
    fix_clinic_events_table()
