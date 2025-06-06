#!/usr/bin/env python3
"""
Frontend API Test - Simulate the exact calls the frontend makes
"""

import requests
import json
from datetime import datetime

def test_frontend_api_flow():
    print("🧪 TESTING FRONTEND API FLOW FOR PATIENT AVAILABILITY")
    print("="*60)
    
    # Step 1: Login as chrisbrown (patient)
    login_data = {
        'username': 'chrisbrown',
        'password': 'krat25Miko!'
    }
    
    login_response = requests.post('http://127.0.0.1:8000/api/auth/login/', json=login_data)
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.text}")
        return
    
    token_data = login_response.json()
    token = token_data['access']
    headers = {'Authorization': f'Bearer {token}'}
    print("✅ Successfully logged in as chrisbrown")
    
    # Step 2: Get user profile (what frontend does in handleDateClick)
    user_response = requests.get('http://127.0.0.1:8000/api/users/me/', headers=headers)
    if user_response.status_code != 200:
        print(f"❌ Failed to get user profile: {user_response.text}")
        return
    
    user_data = user_response.json()
    print(f"✅ Got user profile - Provider ID: {user_data.get('provider')}")
    
    # Step 3: Get availability events (what frontend does in fetchAvailabilityEvents)
    avail_response = requests.get('http://127.0.0.1:8000/api/availability/', headers=headers)
    if avail_response.status_code != 200:
        print(f"❌ Failed to get availability: {avail_response.text}")
        return
    
    avail_data = avail_response.json()
    print(f"✅ Got availability data - Total events: {len(avail_data)}")
    
    # Step 4: Get doctors list (what frontend does in fetchDoctors)
    doctors_response = requests.get('http://127.0.0.1:8000/api/users/doctors/', headers=headers)
    if doctors_response.status_code != 200:
        print(f"❌ Failed to get doctors: {doctors_response.text}")
        return
    
    doctors_data = doctors_response.json()
    print(f"✅ Got doctors data - Total doctors: {len(doctors_data)}")
    
    # Step 5: Simulate frontend filtering for today (2025-06-06)
    target_date = '2025-06-06'
    assigned_provider_id = user_data.get('provider')
    
    print(f"\n🔍 SIMULATING FRONTEND FILTERING FOR {target_date}")
    print(f"Patient's assigned provider ID: {assigned_provider_id}")
    
    # Filter availability events for the target date
    date_availability = [
        event for event in avail_data 
        if target_date in event.get('start_time', '')
    ]
    print(f"Availability events for {target_date}: {len(date_availability)}")
    
    # Get providers with any availability on this date
    providers_with_availability = []
    for doctor in doctors_data:
        doctor_events = [
            event for event in date_availability 
            if event.get('doctor') == doctor['id']
        ]
        if doctor_events:
            time_slots = []
            for event in doctor_events:
                start_time = datetime.fromisoformat(event['start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(event['end_time'].replace('Z', '+00:00'))
                time_slots.append({
                    'start': start_time.strftime('%I:%M %p'),
                    'end': end_time.strftime('%I:%M %p'),
                    'isBlocked': event.get('is_blocked', False)
                })
            
            providers_with_availability.append({
                'id': doctor['id'],
                'name': f"{doctor.get('first_name', '')} {doctor.get('last_name', '')}".strip() or doctor['username'],
                'timeSlots': time_slots
            })
    
    print(f"Providers with availability on {target_date}:")
    for provider in providers_with_availability:
        available_count = len([slot for slot in provider['timeSlots'] if not slot['isBlocked']])
        blocked_count = len([slot for slot in provider['timeSlots'] if slot['isBlocked']])
        print(f"  - {provider['name']} (ID: {provider['id']}): {available_count} available, {blocked_count} blocked")
    
    # Apply patient filtering
    if assigned_provider_id:
        assigned_provider = None
        for provider in providers_with_availability:
            if provider['id'] == assigned_provider_id:
                # Filter to only available slots
                available_slots = [slot for slot in provider['timeSlots'] if not slot['isBlocked']]
                if available_slots:
                    assigned_provider = {
                        **provider,
                        'timeSlots': available_slots
                    }
                break
        
        print(f"\n📋 PATIENT FILTERING RESULT:")
        if assigned_provider:
            print(f"✅ Will show assigned provider: {assigned_provider['name']}")
            print(f"   Available time slots:")
            for slot in assigned_provider['timeSlots']:
                print(f"     - {slot['start']} to {slot['end']}")
        else:
            print("❌ No available slots for assigned provider")
    else:
        print("⚠️ Patient has no assigned provider")

if __name__ == "__main__":
    test_frontend_api_flow()
