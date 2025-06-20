#!/usr/bin/env python3
"""
Test script to verify patient CSV upload/download functionality
"""
import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_patient_csv_functionality():
    print("🔍 Testing Patient CSV Upload/Download Functionality")
    print("=" * 60)
    
    # Step 1: Login as daniellebishop (admin)
    print("1. Logging in as daniellebishop (admin)...")
    login_data = {
        "username": "daniellebishop",
        "password": "krat25Miko!"
    }
    
    response = requests.post(f"{BASE_URL}/api/users/login/", json=login_data)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return False
    
    admin_token = response.json()["access"]
    headers = {"Authorization": f"Bearer {admin_token}"}
    print("✅ Admin login successful")
    
    # Step 2: Test patient template download
    print("2. Testing patient CSV template download...")
    template_response = requests.get(f"{BASE_URL}/api/users/patients/download-template/", headers=headers)
    
    if template_response.status_code == 200:
        print("✅ Patient CSV template downloaded successfully!")
        print(f"Content-Type: {template_response.headers.get('content-type')}")
        print(f"Content-Disposition: {template_response.headers.get('content-disposition')}")
        # Show first few lines of CSV
        content = template_response.text
        lines = content.split('\n')[:3]
        print("CSV Template Content:")
        for line in lines:
            print(f"  {line}")
    else:
        print(f"❌ Template download failed: {template_response.status_code} - {template_response.text}")
        return False
    
    # Step 3: Create a test CSV file and upload it
    print("3. Testing patient CSV upload...")
    test_csv_content = """username,email,first_name,last_name,organization,phone_number,date_of_birth,address,medical_history,password
testpatient1,testpatient1@example.com,John,Doe,Test Clinic,555-0101,1990-01-15,123 Main St,No known allergies,testpass123
testpatient2,testpatient2@example.com,Jane,Smith,Test Clinic,555-0102,1985-05-20,456 Oak Ave,Hypertension,testpass456"""
    
    # Create a temporary file-like object
    files = {'file': ('test_patients.csv', test_csv_content, 'text/csv')}
    
    upload_response = requests.post(f"{BASE_URL}/api/users/patients/upload-csv/", 
                                  files=files, headers=headers)
    
    if upload_response.status_code == 200:
        print("✅ Patient CSV upload successful!")
        result = upload_response.json()
        print(f"Response: {result}")
        return True
    else:
        print(f"❌ Patient CSV upload failed: {upload_response.status_code} - {upload_response.text}")
        return False

if __name__ == "__main__":
    success = test_patient_csv_functionality()
    sys.exit(0 if success else 1)
