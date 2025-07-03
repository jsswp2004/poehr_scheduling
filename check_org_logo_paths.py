#!/usr/bin/env python
"""
Script to check current organization logo paths in the database
"""
import os
import sys
import django

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import Organization

def check_logo_paths():
    """Check current logo paths in the database"""
    print("Current Organization Logo Paths:")
    print("=" * 50)
    
    organizations = Organization.objects.all()
    total_count = organizations.count()
    print(f"Total organizations: {total_count}")
    
    if total_count == 0:
        print("No organizations found in database.")
        return
    
    incorrect_paths = []
    correct_paths = []
    no_logo = []
    
    for org in organizations:
        if org.logo:
            logo_path = str(org.logo)
            print(f"ID: {org.id}, Name: {org.name}, Logo: {logo_path}")
            
            if logo_path.startswith('/media/logos/') or logo_path.startswith('media/logos/'):
                incorrect_paths.append(org)
            elif logo_path.startswith('org_logos/') or logo_path.startswith('media/org_logos/'):
                correct_paths.append(org)
            else:
                print(f"  -> UNKNOWN PATH FORMAT: {logo_path}")
        else:
            no_logo.append(org)
            print(f"ID: {org.id}, Name: {org.name}, Logo: None")
    
    print(f"\nSummary:")
    print(f"Organizations with incorrect paths (/media/logos/): {len(incorrect_paths)}")
    print(f"Organizations with correct paths (org_logos/): {len(correct_paths)}")
    print(f"Organizations with no logo: {len(no_logo)}")
    
    if incorrect_paths:
        print(f"\nOrganizations needing path updates:")
        for org in incorrect_paths:
            print(f"  - {org.name} (ID: {org.id}): {org.logo}")

if __name__ == "__main__":
    check_logo_paths()
