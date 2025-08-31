#!/usr/bin/env python
"""
Check Azure Database for testaccount3 user
"""
import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Azure Database connection parameters
conn_params = {
    "host": os.getenv("AZURE_DB_HOST"),
    "database": os.getenv("AZURE_DB_NAME"),
    "user": os.getenv("AZURE_DB_USER"),
    "password": os.getenv("AZURE_DB_PASSWORD"),
    "port": os.getenv("AZURE_DB_PORT", "5432"),
    "sslmode": "require",
}

print("🔍 Checking Azure Production Database for testaccount3...")
print("=" * 60)

try:
    conn = psycopg2.connect(**conn_params)
    cursor = conn.cursor()

    # Search for user testaccount3
    print("=== SEARCHING FOR USER testaccount3 ===")
    cursor.execute(
        """
        SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.role, 
               o.id as org_id, o.name as org_name, u.organization_id
        FROM users_customuser u
        LEFT JOIN users_organization o ON u.organization_id = o.id
        WHERE u.username = 'testaccount3'
    """
    )

    user = cursor.fetchone()
    if user:
        print(f"✅ Found User: {user[1]} ({user[2]} {user[3]})")
        print(f"   Email: {user[4]}")
        print(f"   Role: {user[5]}")
        print(f"   Organization ID: {user[6]}")
        print(f"   Organization Name: {user[7]}")

        # Check clinic events for this organization
        if user[6]:  # if org_id exists
            cursor.execute(
                """
                SELECT id, name, is_active, organization_id
                FROM appointments_clinicevent
                WHERE organization_id = %s
                ORDER BY id DESC
                LIMIT 10
            """,
                (user[6],),
            )

            clinic_events = cursor.fetchall()
            print(f"\\n   Clinic Events in this org: {len(clinic_events)}")

            if clinic_events:
                print("   Recent clinic events:")
                for event in clinic_events:
                    print(f"     - ID {event[0]}: {event[1]} (Active: {event[2]})")
            else:
                print("   ❌ No clinic events found!")
        else:
            print("   ❌ User has no organization assigned!")
    else:
        print("❌ User testaccount3 not found in Azure database")

        # Show available users with 'test' in username
        print("\\nAvailable test users:")
        cursor.execute(
            """
            SELECT u.username, u.first_name, u.last_name, o.name as org_name, u.role
            FROM users_customuser u
            LEFT JOIN users_organization o ON u.organization_id = o.id
            WHERE u.username ILIKE '%test%' AND u.role = 'admin'
            ORDER BY u.username
        """
        )

        test_users = cursor.fetchall()
        for user in test_users:
            print(
                f'  - {user[0]} ({user[1]} {user[2]}) - {user[3] or "No org"} - {user[4]}'
            )

    cursor.close()
    conn.close()

except Exception as e:
    print(f"❌ Database error: {e}")
