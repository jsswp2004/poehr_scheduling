#!/usr/bin/env python3
"""
Simple Django migration runner for holiday organization isolation.
This uses Django's built-in migration system with proper database credentials.
"""

import os
import sys
import django
from pathlib import Path

# Setup Django environment
project_dir = Path(__file__).parent
sys.path.append(str(project_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.core.management import execute_from_command_line

def run_migrations():
    """Run the Django migrations for holiday organization isolation."""
    print("🚀 Running Django migrations for holiday organization isolation...")
    print("=" * 70)
    
    try:
        # Run the migrations
        print("📝 Applying migrations...")
        execute_from_command_line(['manage.py', 'migrate', 'appointments'])
        
        print("=" * 70)
        print("🎉 Holiday organization isolation completed successfully!")
        print("   Holidays are now properly isolated by organization.")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

if __name__ == '__main__':
    success = run_migrations()
    if success:
        print("\n✅ All migrations applied successfully!")
        print("   Each organization now has isolated holidays.")
    else:
        print("\n❌ Migration failed - please check errors above")
        sys.exit(1)
