#!/usr/bin/env python
"""
Simple database connection test for Cloud SQL
"""

import os
import sys
import django
from django.conf import settings

# Add the project directory to the path
sys.path.insert(0, '/code')

# Configure Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_simple')

try:
    django.setup()
    from django.db import connection
    
    print("Testing database connection...")
    
    # Test the connection
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        print(f"✅ Database connection successful! Test query result: {result}")
        
        # Try to get version
        cursor.execute("SELECT version()")
        version = cursor.fetchone()
        print(f"✅ PostgreSQL version: {version[0]}")
        
        # List existing tables
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        tables = cursor.fetchall()
        print(f"📋 Existing tables in database: {[table[0] for table in tables]}")
        
except Exception as e:
    print(f"❌ Database connection failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("🎉 Database connection test completed successfully!")
