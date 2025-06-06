#!/usr/bin/env python3
"""
Quick test for Chris Brown patient filtering
"""

import requests
import json
from datetime import datetime

# Test Chris Brown (another patient)
BASE_URL = 'http://127.0.0.1:8000'
USERNAME = 'chrisbrown'
PASSWORD = 'krat25Miko!'
TARGET_DATE = '2025-06-06'

def test_chris_brown():
    print('🔍 Testing Chris Brown patient filtering...')
    
    # Login
    login_data = {'username': USERNAME, 'password': PASSWORD}
    login_response = requests.post(f'{BASE_URL}/api/auth/login/', json=login_data)
    
    if login_response.status_code != 200:
        print(f'❌ Login failed: {login_response.status_code}')
        print(f'Response: {login_response.text}')
        return
    
    tokens = login_response.json()
    headers = {'Authorization': f'Bearer {tokens["access"]}'}
    print('✅ Authentication successful')
    
    # Get profile
    profile_response = requests.get(f'{BASE_URL}/api/users/me/', headers=headers)
    if profile_response.status_code != 200:
        print(f'❌ Profile fetch failed: {profile_response.status_code}')
        return
    
    user_profile = profile_response.json()
    assigned_provider_id = user_profile.get('provider')
    
    print(f'👤 User: {user_profile.get("first_name")} {user_profile.get("last_name")}')
    print(f'🏥 Assigned Provider ID: {assigned_provider_id}')
    print(f'🏢 Organization: {user_profile.get("organization")}')
    
    # Get availability
    availability_response = requests.get(f'{BASE_URL}/api/availability/', headers=headers)
    if availability_response.status_code != 200:
        print(f'❌ Availability fetch failed: {availability_response.status_code}')
        return
    
    availability_data = availability_response.json()
    print(f'📊 Total availability records: {len(availability_data)}')
    
    # Filter for target date and assigned provider
    target_date_availability = []
    provider_availability = []
    
    for avail in availability_data:
        start_time = datetime.fromisoformat(avail['start_time'].replace('Z', '+00:00'))
        if start_time.date().strftime('%Y-%m-%d') == TARGET_DATE:
            target_date_availability.append(avail)
            if str(avail['doctor']) == str(assigned_provider_id):
                provider_availability.append(avail)
    
    print(f'📅 Availability records for {TARGET_DATE}: {len(target_date_availability)}')
    print(f'👨‍⚕️ Availability for assigned provider {assigned_provider_id}: {len(provider_availability)}')
    
    available_slots = [avail for avail in provider_availability if not avail['is_blocked']]
    print(f'✅ Available slots: {len(available_slots)}')
    
    if available_slots:
        print('📋 AVAILABLE SLOTS:')
        for slot in available_slots:
            start_time = datetime.fromisoformat(slot['start_time'].replace('Z', '+00:00'))
            end_time = datetime.fromisoformat(slot['end_time'].replace('Z', '+00:00'))
            print(f'  🟢 {start_time.strftime("%I:%M %p")} - {end_time.strftime("%I:%M %p")} (Dr. {slot["doctor_name"]})')
    else:
        print('❌ No available slots found for Chris Brown')

if __name__ == "__main__":
    test_chris_brown()
