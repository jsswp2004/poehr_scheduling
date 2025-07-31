#!/usr/bin/env python
"""
Fix Holidays Table - Targeted fix for the appointments_holiday table issue
"""

import os
import sys
import django

# Add the project directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.db import connection, transaction
from django.core.management.color import make_style

style = make_style()

def fix_holidays_table():
    """Create the holidays table with proper structure"""
    print(style.HTTP_INFO("🎄 Fixing holidays table..."))
    
    try:
        with connection.cursor() as cursor:
            # Check if table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'appointments_holiday'
                );
            """)
            table_exists = cursor.fetchone()[0]
            
            if not table_exists:
                print(style.WARNING("⚠️ Creating appointments_holiday table..."))
                
                # Create the table
                cursor.execute("""
                    CREATE TABLE appointments_holiday (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        date DATE NOT NULL,
                        is_recognized BOOLEAN NOT NULL DEFAULT FALSE,
                        suppressed BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        CONSTRAINT unique_holiday UNIQUE (name, date)
                    );
                """)
                
                # Create index for performance
                cursor.execute("""
                    CREATE INDEX idx_holiday_date ON appointments_holiday(date);
                """)
                
                print(style.SUCCESS("✅ Created appointments_holiday table"))
                
                # Add some default holidays
                default_holidays = [
                    ("New Year's Day", "2025-01-01", True),
                    ("Independence Day", "2025-07-04", True), 
                    ("Christmas Day", "2025-12-25", True),
                    ("Labor Day", "2025-09-01", True),
                    ("Thanksgiving", "2025-11-27", True),
                ]
                
                for name, date, is_recognized in default_holidays:
                    cursor.execute("""
                        INSERT INTO appointments_holiday (name, date, is_recognized)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (name, date) DO NOTHING;
                    """, [name, date, is_recognized])
                
                print(style.SUCCESS("✅ Added default holidays"))
                
            else:
                print(style.SUCCESS("✅ appointments_holiday table already exists"))
                
                # Check data count
                cursor.execute("SELECT COUNT(*) FROM appointments_holiday;")
                count = cursor.fetchone()[0]
                print(style.SUCCESS(f"✅ Found {count} holidays in table"))
                
        return True
        
    except Exception as e:
        print(style.ERROR(f"❌ Error fixing holidays table: {e}"))
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print(style.HTTP_INFO("🎄 Holidays Table Fix"))
    print("=" * 50)
    
    success = fix_holidays_table()
    
    print("\n" + "=" * 50)
    if success:
        print(style.SUCCESS("✅ Holidays table fix completed successfully"))
    else:
        print(style.ERROR("❌ Holidays table fix failed"))
