#!/usr/bin/env python3
"""
Test script to upload patients CSV
"""
import requests
import sys

def test_patient_upload():
    # Step 1: Login as admin
    login_data = {
        "username": "daniellebishop",
        "password": "krat25Miko!"
    }
    
    response = requests.post("http://localhost:8000/api/users/login/", json=login_data)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return False
    
    token = response.json()["access"]
    print("✅ Login successful")
    
    # Step 2: Upload patients CSV
    headers = {"Authorization": f"Bearer {token}"}
    
    with open("test_patients.csv", "rb") as f:
        files = {"file": f}
        upload_response = requests.post(
            "http://localhost:8000/api/users/patients/upload-csv/", 
            files=files,
            headers=headers
        )
    
    print(f"📤 Upload status: {upload_response.status_code}")
    print(f"📋 Response: {upload_response.text}")
    
    if upload_response.status_code == 200:
        print("✅ Patient upload successful!")
        return True
    else:
        print(f"❌ Patient upload failed: {upload_response.status_code}")
        return False

if __name__ == "__main__":
    success = test_patient_upload()
    sys.exit(0 if success else 1)
