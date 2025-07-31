#!/usr/bin/env python
import os
import sys
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling.settings')
sys.path.append('/code')
django.setup()

from django.db import connection, transaction
from django.utils import timezone
from datetime import timedelta

def fix_autoemail_table():
    """Fix the appointments_autoemail table"""
    with connection.cursor() as cursor:
        try:
            # Check if table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'appointments_autoemail'
                );
            """)
            table_exists = cursor.fetchone()[0]
            print(f"appointments_autoemail table exists: {table_exists}")
            
            if not table_exists:
                print("Creating appointments_autoemail table...")
                # Create the table with proper structure matching the Django model
                cursor.execute("""
                    CREATE TABLE appointments_autoemail (
                        id SERIAL PRIMARY KEY,
                        organization_id INTEGER,
                        auto_message_frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
                        auto_message_day_of_week INTEGER NOT NULL DEFAULT 1,
                        auto_message_start_date DATE,
                        is_active BOOLEAN NOT NULL DEFAULT true,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        CONSTRAINT appointments_autoemail_organization_id_fkey 
                            FOREIGN KEY (organization_id) REFERENCES users_organization(id) 
                            DEFERRABLE INITIALLY DEFERRED,
                        CONSTRAINT appointments_autoemail_auto_message_frequency_check 
                            CHECK (auto_message_frequency IN ('daily', 'weekly', 'bi-weekly', 'monthly')),
                        CONSTRAINT appointments_autoemail_auto_message_day_of_week_check 
                            CHECK (auto_message_day_of_week >= 0 AND auto_message_day_of_week <= 6)
                    );
                """)
                
                # Create index for performance
                cursor.execute("""
                    CREATE INDEX appointments_autoemail_organization_id_idx 
                    ON appointments_autoemail(organization_id);
                """)
                
                print("✅ Table created successfully")
            else:
                print("Table already exists, checking structure...")
                
                # Check required columns exist
                required_columns = [
                    ('organization_id', 'integer'),
                    ('auto_message_frequency', 'character varying'),
                    ('auto_message_day_of_week', 'integer'),
                    ('auto_message_start_date', 'date'),
                    ('is_active', 'boolean'),
                    ('created_at', 'timestamp with time zone'),
                    ('updated_at', 'timestamp with time zone')
                ]
                
                for col_name, col_type in required_columns:
                    cursor.execute("""
                        SELECT column_name, data_type 
                        FROM information_schema.columns 
                        WHERE table_name = 'appointments_autoemail' 
                        AND column_name = %s;
                    """, [col_name])
                    col_info = cursor.fetchone()
                    
                    if not col_info:
                        print(f"Adding missing {col_name} column...")
                        if col_name == 'organization_id':
                            cursor.execute("""
                                ALTER TABLE appointments_autoemail 
                                ADD COLUMN organization_id INTEGER;
                            """)
                            cursor.execute("""
                                ALTER TABLE appointments_autoemail 
                                ADD CONSTRAINT appointments_autoemail_organization_id_fkey 
                                FOREIGN KEY (organization_id) REFERENCES users_organization(id) 
                                DEFERRABLE INITIALLY DEFERRED;
                            """)
                        elif col_name == 'auto_message_frequency':
                            cursor.execute("""
                                ALTER TABLE appointments_autoemail 
                                ADD COLUMN auto_message_frequency VARCHAR(20) NOT NULL DEFAULT 'weekly';
                            """)
                        elif col_name == 'auto_message_day_of_week':
                            cursor.execute("""
                                ALTER TABLE appointments_autoemail 
                                ADD COLUMN auto_message_day_of_week INTEGER NOT NULL DEFAULT 1;
                            """)
                        elif col_name == 'auto_message_start_date':
                            cursor.execute("""
                                ALTER TABLE appointments_autoemail 
                                ADD COLUMN auto_message_start_date DATE;
                            """)
                        elif col_name == 'is_active':
                            cursor.execute("""
                                ALTER TABLE appointments_autoemail 
                                ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
                            """)
                        elif col_name == 'created_at':
                            cursor.execute("""
                                ALTER TABLE appointments_autoemail 
                                ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
                            """)
                        elif col_name == 'updated_at':
                            cursor.execute("""
                                ALTER TABLE appointments_autoemail 
                                ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
                            """)
                        print(f"  ✅ {col_name} column added")
            
            # Check if we have any organizations without auto email settings
            cursor.execute("""
                SELECT o.id, o.name 
                FROM users_organization o 
                LEFT JOIN appointments_autoemail ae ON o.id = ae.organization_id 
                WHERE ae.id IS NULL;
            """)
            missing_orgs = cursor.fetchall()
            
            if missing_orgs:
                print(f"Creating auto email settings for {len(missing_orgs)} organizations...")
                tomorrow = (timezone.now() + timedelta(days=1)).date()
                for org_id, org_name in missing_orgs:
                    cursor.execute("""
                        INSERT INTO appointments_autoemail 
                        (organization_id, auto_message_frequency, auto_message_day_of_week, 
                         auto_message_start_date, is_active, created_at, updated_at) 
                        VALUES (%s, %s, %s, %s, %s, NOW(), NOW());
                    """, [org_id, 'weekly', 1, tomorrow, True])
                    print(f"  ✅ Created auto email setting for: {org_name}")
            else:
                print("All organizations have auto email settings")
            
            # Test the table
            cursor.execute("SELECT COUNT(*) FROM appointments_autoemail;")
            count = cursor.fetchone()[0]
            print(f"Total auto email settings: {count}")
            
        except Exception as e:
            print(f"Error fixing auto email table: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    try:
        fix_autoemail_table()
        print("✅ Auto email table fix completed")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
