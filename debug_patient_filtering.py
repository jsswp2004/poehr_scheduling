#!/usr/bin/env python3
"""
Debug script for patient availability filtering issue
Tests the API endpoints that the frontend uses for Rose Granger
"""

import requests
import json
from datetime import datetime, date

# Configuration
BASE_URL = "http://127.0.0.1:8000"
USERNAME = "rosegranger"
PASSWORD = "krat25Miko!"
TARGET_DATE = "2025-06-06"

def test_patient_filtering():
    print("🔍 Testing Patient Availability Filtering for Rose Granger")
    print("=" * 60)
    
    # Step 1: Authenticate
    print("1. Authenticating as Rose Granger...")
    login_data = {
        "username": USERNAME,
        "password": PASSWORD
    }
    
    login_response = requests.post(f"{BASE_URL}/api/auth/login/", json=login_data)
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        print(f"Response: {login_response.text}")
        return
    
    tokens = login_response.json()
    access_token = tokens["access"]
    headers = {"Authorization": f"Bearer {access_token}"}
    print("✅ Authentication successful")
    
    # Step 2: Get user profile (to find assigned provider)
    print("\n2. Fetching user profile...")
    profile_response = requests.get(f"{BASE_URL}/api/users/me/", headers=headers)
    if profile_response.status_code != 200:
        print(f"❌ Profile fetch failed: {profile_response.status_code}")
        return
    
    user_profile = profile_response.json()
    assigned_provider_id = user_profile.get("provider")
    print(f"👤 User: {user_profile.get('first_name')} {user_profile.get('last_name')}")
    print(f"🏥 Assigned Provider ID: {assigned_provider_id}")
    
    # Step 3: Get availability data
    print(f"\n3. Fetching availability data for {TARGET_DATE}...")
    availability_response = requests.get(f"{BASE_URL}/api/availability/", headers=headers)
    if availability_response.status_code != 200:
        print(f"❌ Availability fetch failed: {availability_response.status_code}")
        return
    
    availability_data = availability_response.json()
    print(f"📊 Total availability records: {len(availability_data)}")
    
    # Step 4: Filter availability for target date
    target_date_availability = []
    for avail in availability_data:
        start_time = datetime.fromisoformat(avail["start_time"].replace("Z", "+00:00"))
        if start_time.date().strftime("%Y-%m-%d") == TARGET_DATE:
            target_date_availability.append(avail)
    
    print(f"📅 Availability records for {TARGET_DATE}: {len(target_date_availability)}")
    
    # Step 5: Filter for assigned provider
    provider_availability = []
    for avail in target_date_availability:
        if str(avail["doctor"]) == str(assigned_provider_id):
            provider_availability.append(avail)
    
    print(f"👨‍⚕️ Availability for assigned provider {assigned_provider_id}: {len(provider_availability)}")
    
    # Step 6: Show available (non-blocked) slots
    available_slots = []
    blocked_slots = []
    for avail in provider_availability:
        if avail["is_blocked"]:
            blocked_slots.append(avail)
        else:
            available_slots.append(avail)
    
    print(f"✅ Available slots: {len(available_slots)}")
    print(f"❌ Blocked slots: {len(blocked_slots)}")
    
    print("\n📋 AVAILABLE SLOTS (what should show in modal):")
    for slot in available_slots:
        start_time = datetime.fromisoformat(slot["start_time"].replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(slot["end_time"].replace("Z", "+00:00"))
        print(f"  🟢 {start_time.strftime('%I:%M %p')} - {end_time.strftime('%I:%M %p')} (Dr. {slot['doctor_name']})")
    
    print("\n📋 BLOCKED SLOTS (should NOT show in modal):")
    for slot in blocked_slots:
        start_time = datetime.fromisoformat(slot["start_time"].replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(slot["end_time"].replace("Z", "+00:00"))
        block_type = slot.get("block_type", "Unknown")
        print(f"  ❌ {start_time.strftime('%I:%M %p')} - {end_time.strftime('%I:%M %p')} ({block_type})")
    
    # Step 7: Simulate frontend filtering logic
    print(f"\n🔍 FRONTEND SIMULATION:")
    print(f"User role: patient")
    print(f"Assigned provider ID: {assigned_provider_id}")
    print(f"Target date: {TARGET_DATE}")
    
    # This simulates the frontend logic
    doctors_with_availability = {}
    for avail in target_date_availability:
        doctor_id = avail["doctor"]
        if doctor_id not in doctors_with_availability:
            doctors_with_availability[doctor_id] = {
                "id": doctor_id,
                "name": avail["doctor_name"],
                "slots": []
            }
        
        doctors_with_availability[doctor_id]["slots"].append({
            "start": datetime.fromisoformat(avail["start_time"].replace("Z", "+00:00")).strftime('%I:%M %p'),
            "end": datetime.fromisoformat(avail["end_time"].replace("Z", "+00:00")).strftime('%I:%M %p'),
            "isBlocked": avail["is_blocked"]
        })
    
    # Filter for assigned provider with available slots
    assigned_provider_data = doctors_with_availability.get(assigned_provider_id)
    if assigned_provider_data:
        available_slots = [slot for slot in assigned_provider_data["slots"] if not slot["isBlocked"]]
        if available_slots:
            print(f"✅ SHOULD SHOW: Dr. {assigned_provider_data['name']} with {len(available_slots)} available slots")
            for slot in available_slots:
                print(f"    🟢 {slot['start']} - {slot['end']}")
        else:
            print(f"❌ SHOULD NOT SHOW: Dr. {assigned_provider_data['name']} (no available slots)")
    else:
        print(f"❌ SHOULD NOT SHOW: No availability data for assigned provider {assigned_provider_id}")
    
    print("\n" + "=" * 60)
    print("✅ Test completed. Check the frontend modal to see if it matches this output.")

if __name__ == "__main__":
    test_patient_filtering()
