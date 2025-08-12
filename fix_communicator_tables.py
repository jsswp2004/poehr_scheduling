#!/usr/bin/env python
"""
Quick fix for communicator app tables
Creates the communicator tables directly if migrations fail
"""
import os
import django

# Setup Django
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_azure"
)
django.setup()

from django.core.management import execute_from_command_line
from django.db import connection


def check_table_exists(table_name):
    """Check if a table exists in the database"""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = %s
            );
        """,
            [table_name],
        )
        return cursor.fetchone()[0]


def main():
    print("🔧 Checking communicator app tables...")

    # Check if communicator_contact table exists
    if check_table_exists("communicator_contact"):
        print("✅ communicator_contact table already exists")
        return

    print("❌ communicator_contact table missing, running specific migration...")

    try:
        # Run only communicator app migrations
        execute_from_command_line(["manage.py", "migrate", "communicator"])
        print("✅ Communicator migrations completed!")

        # Verify table was created
        if check_table_exists("communicator_contact"):
            print("✅ communicator_contact table successfully created")
        else:
            print("❌ Table still missing after migration")

    except Exception as e:
        print(f"❌ Migration failed: {e}")

        # Try creating the table manually as last resort
        print("🔧 Attempting to create table manually...")
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS communicator_contact (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        phone VARCHAR(20) NOT NULL DEFAULT '',
                        email VARCHAR(254) NOT NULL DEFAULT '',
                        uploaded_by_id INTEGER NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (uploaded_by_id) REFERENCES users_customuser(id) ON DELETE CASCADE
                    );
                """
                )
                cursor.execute(
                    """
                    CREATE INDEX IF NOT EXISTS communicator_contact_uploaded_by_id_idx 
                    ON communicator_contact(uploaded_by_id);
                """
                )
            print("✅ Table created manually!")
        except Exception as manual_error:
            print(f"❌ Manual table creation failed: {manual_error}")


if __name__ == "__main__":
    main()
