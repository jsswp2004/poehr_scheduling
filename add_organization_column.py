#!/usr/bin/env python
"""
Add organization column to MessageLog table on Azure
"""
import os
import django

# Setup Django settings for Azure
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_azure"
)
django.setup()

from django.db import connection
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def add_organization_column():
    """Add organization column to MessageLog table"""
    try:
        with connection.cursor() as cursor:
            # Check if organization column exists
            logger.info("🔍 Checking if organization column exists...")
            cursor.execute(
                """
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='communicator_messagelog' 
                AND column_name='organization_id';
            """
            )
            result = cursor.fetchone()

            if result:
                logger.info("✅ organization_id column already exists!")
                return True
            else:
                logger.info("❌ organization_id column missing, adding it...")

                # Add the column
                cursor.execute(
                    """
                    ALTER TABLE communicator_messagelog 
                    ADD COLUMN organization_id BIGINT;
                """
                )

                # Add foreign key constraint
                cursor.execute(
                    """
                    ALTER TABLE communicator_messagelog
                    ADD CONSTRAINT communicator_messagelog_organization_id_fkey
                    FOREIGN KEY (organization_id) REFERENCES users_organization(id) ON DELETE SET NULL;
                """
                )

                logger.info("✅ organization_id column added!")

                # Mark the migration as applied
                cursor.execute(
                    """
                    INSERT INTO django_migrations (app, name, applied) 
                    VALUES ('communicator', '0003_messagelog_organization', NOW())
                    ON CONFLICT (app, name) DO NOTHING;
                """
                )
                logger.info("✅ Migration marked as applied!")
                return True

    except Exception as e:
        logger.error(f"❌ Failed to add organization column: {e}")
        return False


if __name__ == "__main__":
    logger.info("🚀 Starting organization column addition...")
    success = add_organization_column()
    if success:
        logger.info("🎉 Organization column addition completed successfully!")
    else:
        logger.error("💥 Organization column addition failed!")
