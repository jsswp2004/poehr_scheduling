#!/usr/bin/env python3
"""
Test script for patient role-specific availability filtering logic.
This script tests the backend logic that the frontend will use.
"""

import os
import sys
import django
from datetime import datetime, date

# Setup Django environment
sys.path.append('/c/Users/jsswp/POWER/poehr_scheduling')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser
from appointments.models import Availability
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
import json

def get_user_token(username):
    """Get JWT token for a user"""
    try:
        user = CustomUser.objects.get(username=username)
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    except CustomUser.DoesNotExist:
        return None

def decode_token_role(token):
    """Simulate the frontend token decoding"""
    from rest_framework_simplejwt.tokens import UntypedToken
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
    try:
        UntypedToken(token)
        from rest_framework_simplejwt.authentication import JWTAuthentication
        jwt_auth = JWTAuthentication()
        validated_token = jwt_auth.get_validated_token(token)
        user = jwt_auth.get_user(validated_token)
        return user.role, user.id
    except (InvalidToken, TokenError):
        return None, None

def get_user_profile(user_id):
    """Get user profile (simulating /api/users/me/ endpoint)"""
    try:
        user = CustomUser.objects.get(id=user_id)
        return {
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'provider': user.provider_id if hasattr(user, 'provider') and user.provider else None,
            'provider_name': str(user.provider) if hasattr(user, 'provider') and user.provider else None
        }
    except CustomUser.DoesNotExist:
        return None

def get_availability_for_date(target_date):
    """Get all availability events for a specific date"""
    return Availability.objects.filter(
        start_time__date=target_date
    ).values('doctor_id', 'start_time', 'end_time', 'is_blocked')

def get_all_doctors():
    """Get all doctors in the system"""
    return CustomUser.objects.filter(role='doctor').values('id', 'username', 'first_name', 'last_name')

def simulate_frontend_filtering(username, target_date_str):
    """
    Simulate the frontend filtering logic for availability modal
    """
    print(f"\n🧪 TESTING AVAILABILITY FILTERING FOR: {username} on {target_date_str}")
    print("="*60)
    
    # Step 1: Get user token and decode role
    token = get_user_token(username)
    if not token:
        print(f"❌ User {username} not found")
        return
    
    role, user_id = decode_token_role(token)
    print(f"🔐 User Role: {role}")
    print(f"🆔 User ID: {user_id}")
    
    # Step 2: Get all doctors
    all_doctors = list(get_all_doctors())
    print(f"👨‍⚕️ Total doctors in system: {len(all_doctors)}")
    
    # Step 3: Get availability data for the target date
    target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
    availability_events = list(get_availability_for_date(target_date))
    print(f"📅 Availability events for {target_date}: {len(availability_events)}")
    
    # Step 4: Get providers with ANY availability data for this date
    providers_with_any_availability = []
    for doctor in all_doctors:
        doctor_avail = [event for event in availability_events if event['doctor_id'] == doctor['id']]
        if doctor_avail:
            time_slots = []
            for event in doctor_avail:
                time_slots.append({
                    'start': event['start_time'].strftime('%I:%M %p'),
                    'end': event['end_time'].strftime('%I:%M %p'),
                    'isBlocked': event['is_blocked']
                })
            
            providers_with_any_availability.append({
                'id': doctor['id'],
                'name': f"{doctor['first_name']} {doctor['last_name']}".strip() or doctor['username'],
                'timeSlots': time_slots
            })
    
    print(f"🏥 Providers with any availability data: {len(providers_with_any_availability)}")
    for provider in providers_with_any_availability:
        available_slots = [slot for slot in provider['timeSlots'] if not slot['isBlocked']]
        blocked_slots = [slot for slot in provider['timeSlots'] if slot['isBlocked']]
        print(f"   - {provider['name']} (ID: {provider['id']}): {len(available_slots)} available, {len(blocked_slots)} blocked")
    
    # Step 5: Apply role-based filtering
    providers_to_show = []
    
    if role == 'patient':
        print(f"\n🏥 PATIENT FILTERING LOGIC:")
        
        # Get patient's assigned provider
        user_profile = get_user_profile(user_id)
        if not user_profile:
            print("❌ Could not get user profile")
            return
        
        assigned_provider_id = user_profile['provider']
        print(f"👨‍⚕️ Assigned provider ID: {assigned_provider_id}")
        print(f"👨‍⚕️ Assigned provider name: {user_profile['provider_name']}")
        
        if assigned_provider_id:
            # Find assigned provider in the availability list
            assigned_provider_with_availability = None
            for provider in providers_with_any_availability:
                if str(provider['id']) == str(assigned_provider_id):
                    # Check if they have any non-blocked slots
                    available_slots = [slot for slot in provider['timeSlots'] if not slot['isBlocked']]
                    if available_slots:
                        assigned_provider_with_availability = {
                            **provider,
                            'timeSlots': available_slots  # Only show available slots
                        }
                    break
            
            if assigned_provider_with_availability:
                providers_to_show = [assigned_provider_with_availability]
                print(f"✅ Showing assigned provider with {len(assigned_provider_with_availability['timeSlots'])} available slots")
            else:
                providers_to_show = []
                print("❌ Assigned provider has no available slots on this date")
        else:
            providers_to_show = []
            print("⚠️ Patient has no assigned provider")
    
    else:
        print(f"\n🏥 NON-PATIENT FILTERING LOGIC:")
        # Non-patients see all providers with availability data
        providers_to_show = providers_with_any_availability
        print(f"✅ Showing all {len(providers_to_show)} providers with availability data")
    
    # Step 6: Display final results
    print(f"\n📋 FINAL RESULT - Providers to show in modal:")
    if providers_to_show:
        for provider in providers_to_show:
            print(f"   ✅ {provider['name']} (ID: {provider['id']})")
            for slot in provider['timeSlots']:
                status = "🚫 BLOCKED" if slot['isBlocked'] else "✅ AVAILABLE"
                print(f"      - {slot['start']} - {slot['end']} {status}")
    else:
        print("   ❌ No providers to show")
    
    return providers_to_show

def main():
    """Run tests for different scenarios"""
    print("🧪 PATIENT AVAILABILITY FILTERING TEST")
    print("="*60)
    
    # Test scenarios
    test_scenarios = [
        # Test with a patient who has an assigned provider
        ("chrisbrown", "2025-06-05"),  # Patient assigned to maytan (ID: 16)
        ("alice01", "2025-06-05"),     # Patient assigned to carlopanelo (ID: 3)
        
        # Test with a patient on a date where their provider is blocked
        ("chrisbrown", "2025-06-19"),  # maytan is blocked on this date
        
        # Test with an admin user (should see all providers)
        ("daniellebishop", "2025-06-05"),  # Admin user
        
        # Test with a doctor user (should see all providers)
        ("drsmith", "2025-06-05"),  # Doctor user
    ]
    
    for username, test_date in test_scenarios:
        result = simulate_frontend_filtering(username, test_date)
        print("\n" + "="*60)

if __name__ == "__main__":
    main()
