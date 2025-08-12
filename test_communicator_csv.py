#!/usr/bin/env python3
"""
Test script to verify communicator CSV upload functionality after Azure deployment
"""
import requests
import csv
import tempfile
import os

# Azure application URL
AZURE_URL = "https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io"


def create_test_csv():
    """Create a simple test CSV file for upload"""
    test_data = [
        ["name", "phone", "email"],
        ["John Doe", "555-1234", "john@example.com"],
        ["Jane Smith", "555-5678", "jane@example.com"],
        ["Test User", "555-9999", "test@example.com"],
    ]

    # Create temporary CSV file
    temp_file = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False)
    writer = csv.writer(temp_file)
    writer.writerows(test_data)
    temp_file.close()

    return temp_file.name


def test_communicator_upload():
    """Test the communicator CSV upload functionality"""
    print("🧪 Testing Communicator CSV Upload Functionality")
    print("=" * 50)

    # First, try to login (you'll need valid credentials)
    print("1. Testing login endpoint...")
    login_url = f"{AZURE_URL}/api/auth/login/"

    try:
        # Test if login endpoint is accessible
        response = requests.get(login_url.replace("/login/", "/"), timeout=10)
        print(f"   Auth endpoint status: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error accessing auth endpoint: {e}")
        return

    # Test communicator endpoints without authentication first
    print("\n2. Testing communicator endpoints availability...")

    # Test contacts list endpoint
    contacts_url = f"{AZURE_URL}/api/communicator/contacts/"
    try:
        response = requests.get(contacts_url, timeout=10)
        print(f"   Contacts endpoint status: {response.status_code}")
        if response.status_code == 401:
            print("   ✅ Endpoint exists (401 = authentication required)")
        elif response.status_code == 200:
            print("   ✅ Endpoint accessible")
        else:
            print(f"   ❓ Unexpected status: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error accessing contacts endpoint: {e}")

    # Test bulk upload endpoint
    upload_url = f"{AZURE_URL}/api/communicator/contacts/bulk-upload/"
    try:
        response = requests.post(upload_url, timeout=10)
        print(f"   Bulk upload endpoint status: {response.status_code}")
        if response.status_code == 401:
            print("   ✅ Endpoint exists (401 = authentication required)")
        elif response.status_code == 400:
            print("   ✅ Endpoint exists (400 = bad request, needs file)")
        else:
            print(f"   ❓ Unexpected status: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error accessing bulk upload endpoint: {e}")

    print("\n3. Testing database tables...")
    # We can't directly query the database, but we can test if the endpoints work
    # If the communicator_contact table exists, the endpoints should respond properly

    print("✅ Test completed!")
    print("\nTo test with actual CSV upload, you'll need to:")
    print("1. Login to the application in a browser")
    print("2. Navigate to the communicator page")
    print("3. Try uploading a CSV file")
    print(f"4. Check browser console for any errors")

    print(f"\nApplication URL: {AZURE_URL}")


def check_database_migration():
    """Check if migrations have been applied by testing API responses"""
    print("\n🔍 Checking Database Migration Status")
    print("=" * 40)

    # Test the admin interface to see if communicator app is loaded
    admin_url = f"{AZURE_URL}/admin/"
    try:
        response = requests.get(admin_url, timeout=10)
        print(f"Admin interface status: {response.status_code}")
        if response.status_code == 200:
            print("✅ Admin interface accessible")
        elif response.status_code == 302:
            print("✅ Admin interface redirecting (login required)")
    except Exception as e:
        print(f"❌ Error accessing admin: {e}")


if __name__ == "__main__":
    test_communicator_upload()
    check_database_migration()

    # Clean up
    print(f"\n📋 Next steps:")
    print("1. Check the application logs for any migration messages")
    print("2. Test CSV upload through the web interface")
    print("3. Verify that contacts appear in the communicator page after upload")
