#!/usr/bin/env python
"""
Script to test organization logo URLs and check if they're accessible
"""
import os
import sys
import django
import requests

# Add the project directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import Organization

def test_logo_urls():
    """Test if organization logo URLs are accessible"""
    print("Testing Organization Logo URLs:")
    print("=" * 60)
    
    organizations = Organization.objects.filter(logo__isnull=False).exclude(logo='')
    
    if not organizations:
        print("No organizations with logos found.")
        return
    
    base_url = "http://127.0.0.1:8000"
    
    for org in organizations:
        logo_path = str(org.logo)
        constructed_url = f"{base_url}/media/{logo_path}"
        
        print(f"\nOrganization: {org.name}")
        print(f"Logo path in DB: {logo_path}")
        print(f"Constructed URL: {constructed_url}")
        
        try:
            response = requests.head(constructed_url, timeout=5)
            if response.status_code == 200:
                print(f"✅ Status: {response.status_code} - Accessible")
                print(f"   Content-Type: {response.headers.get('Content-Type', 'Unknown')}")
            else:
                print(f"❌ Status: {response.status_code} - Not accessible")
        except requests.exceptions.RequestException as e:
            print(f"❌ Error: {str(e)}")
    
    print(f"\n" + "=" * 60)
    print("Test completed!")

if __name__ == "__main__":
    test_logo_urls()
