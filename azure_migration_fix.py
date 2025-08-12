#!/usr/bin/env python
"""
Direct Azure migration script - runs Django migrations specifically for communicator app
"""
import os
import sys
import django
from django.core.management import execute_from_command_line
from django.db import connection
import logging

# Setup Django settings for Azure
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_azure")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_table_exists(table_name):
    """Check if a table exists in PostgreSQL"""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM pg_tables 
                    WHERE schemaname = 'public' 
                    AND tablename = %s
                );
            """, [table_name])
            result = cursor.fetchone()[0]
            return result
    except Exception as e:
        logger.error(f"Error checking table {table_name}: {e}")
        return False

def check_migration_status():
    """Check which migrations have been applied"""
    try:
        with connection.cursor() as cursor:
            # Check if django_migrations table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM pg_tables 
                    WHERE schemaname = 'public' 
                    AND tablename = 'django_migrations'
                );
            """)
            if not cursor.fetchone()[0]:
                logger.error("❌ django_migrations table doesn't exist")
                return False
            
            # Check communicator migrations
            cursor.execute("""
                SELECT id, app, name, applied 
                FROM django_migrations 
                WHERE app = 'communicator'
                ORDER BY applied;
            """)
            migrations = cursor.fetchall()
            
            if not migrations:
                logger.warning("⚠️  No communicator migrations found in django_migrations table")
                return False
            
            logger.info("📋 Applied communicator migrations:")
            for migration in migrations:
                logger.info(f"   {migration[1]}.{migration[2]} (applied: {migration[3]})")
            
            return True
            
    except Exception as e:
        logger.error(f"Error checking migration status: {e}")
        return False

def run_migrations():
    """Run Django migrations"""
    try:
        django.setup()
        logger.info("🔧 Running Django migrations...")
        
        # Run all migrations first
        execute_from_command_line(['manage.py', 'migrate', '--verbosity=2'])
        
        # Then specifically check communicator
        logger.info("🔧 Running communicator app migrations...")
        execute_from_command_line(['manage.py', 'migrate', 'communicator', '--verbosity=2'])
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        return False

def create_tables_manually():
    """Manually create communicator tables if migrations fail"""
    try:
        logger.info("🔧 Creating communicator tables manually...")
        
        with connection.cursor() as cursor:
            # Create Contact table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS communicator_contact (
                    id BIGSERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    phone VARCHAR(20) NOT NULL DEFAULT '',
                    email VARCHAR(254) NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    uploaded_by_id BIGINT NOT NULL REFERENCES users_customuser(id) ON DELETE CASCADE
                );
            """)
            
            # Create index
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS communicator_contact_uploaded_by_id_idx 
                ON communicator_contact(uploaded_by_id);
            """)
            
            # Create MessageLog table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS communicator_messagelog (
                    id BIGSERIAL PRIMARY KEY,
                    recipient VARCHAR(255) NOT NULL,
                    subject VARCHAR(255) NOT NULL DEFAULT '',
                    body TEXT NOT NULL,
                    message_type VARCHAR(10) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT '',
                    provider_id VARCHAR(100) NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    user_id BIGINT REFERENCES users_customuser(id) ON DELETE SET NULL
                );
            """)
            
            # Create index for MessageLog
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS communicator_messagelog_user_id_idx 
                ON communicator_messagelog(user_id);
            """)
            
            # Create index for created_at for ordering
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS communicator_messagelog_created_at_idx 
                ON communicator_messagelog(created_at DESC);
            """)
            
            logger.info("✅ Tables created manually!")
            return True
            
    except Exception as e:
        logger.error(f"❌ Manual table creation failed: {e}")
        return False

def main():
    logger.info("🚀 Starting Azure migration process...")
    
    # Check current status
    logger.info("🔍 Checking current table status...")
    contact_exists = check_table_exists('communicator_contact')
    messagelog_exists = check_table_exists('communicator_messagelog')
    
    logger.info(f"   communicator_contact: {'✅ EXISTS' if contact_exists else '❌ MISSING'}")
    logger.info(f"   communicator_messagelog: {'✅ EXISTS' if messagelog_exists else '❌ MISSING'}")
    
    if contact_exists and messagelog_exists:
        logger.info("✅ All tables exist! No migration needed.")
        return True
    
    # Check migration history
    logger.info("🔍 Checking migration history...")
    check_migration_status()
    
    # Try running migrations
    if run_migrations():
        # Verify tables were created
        contact_exists = check_table_exists('communicator_contact')
        messagelog_exists = check_table_exists('communicator_messagelog')
        
        if contact_exists and messagelog_exists:
            logger.info("✅ Migration successful! All tables created.")
            return True
        else:
            logger.warning("⚠️  Migration completed but tables still missing. Trying manual creation...")
    
    # If migrations failed, try manual creation
    if create_tables_manually():
        # Final verification
        contact_exists = check_table_exists('communicator_contact')
        messagelog_exists = check_table_exists('communicator_messagelog')
        
        if contact_exists and messagelog_exists:
            logger.info("✅ Manual table creation successful!")
            return True
        else:
            logger.error("❌ Manual table creation failed")
            return False
    
    logger.error("❌ All migration attempts failed")
    return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
