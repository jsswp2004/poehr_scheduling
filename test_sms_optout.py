#!/usr/bin/env python
"""
Test script for SMS opt-out functionality.
This script tests various scenarios to ensure opt-out compliance.
"""

import os
import sys
import django
from django.utils import timezone

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")
django.setup()

from users.models import CustomUser
from communicator.utils import send_sms


def test_sms_optout_scenarios():
    """Test different SMS opt-out scenarios"""

    print("🧪 Testing SMS Opt-out Functionality")
    print("=" * 50)

    # Find test users
    knight = CustomUser.objects.filter(first_name="Knight").first()
    dawson = CustomUser.objects.filter(first_name="Dawson").first()

    if not knight or not dawson:
        print("❌ Test users not found (Knight and Dawson)")
        print("Available users:")
        for user in CustomUser.objects.filter(role="patient")[:5]:
            print(
                f"  - {user.first_name} {user.last_name} (phone: {user.phone_number})"
            )
        return

    print(f"📱 Test Users Found:")
    print(f"  - Knight: {knight.phone_number} (opt-out: {knight.sms_opt_out})")
    print(f"  - Dawson: {dawson.phone_number} (opt-out: {dawson.sms_opt_out})")
    print()

    # Test 1: Send SMS to opted-in user
    print("🧪 Test 1: Send SMS to opted-in user")
    try:
        # Ensure knight is opted in
        knight.sms_opt_out = False
        knight.sms_consent = True
        knight.save()

        result = send_sms(
            knight.phone_number,
            "Test message to opted-in user",
            organization=knight.organization,
        )
        print(f"✅ SMS sent successfully to opted-in user: {result.sid}")
    except Exception as e:
        print(f"❌ Failed to send SMS to opted-in user: {str(e)}")
    print()

    # Test 2: Opt out user and try to send SMS
    print("🧪 Test 2: Opt out user and try to send SMS")
    try:
        # Opt out dawson
        dawson.sms_opt_out = True
        dawson.sms_opt_out_date = timezone.now()
        dawson.sms_opt_out_method = "MANUAL"
        dawson.save()

        result = send_sms(
            dawson.phone_number,
            "This message should be blocked",
            organization=dawson.organization,
        )
        print(f"❌ SMS should have been blocked but was sent: {result.sid}")
    except Exception as e:
        if "opted out" in str(e):
            print(f"✅ SMS correctly blocked for opted-out user: {str(e)}")
        else:
            print(f"❌ Unexpected error: {str(e)}")
    print()

    # Test 3: Send SMS with bypass flag
    print("🧪 Test 3: Send SMS with bypass opt-out flag")
    try:
        result = send_sms(
            dawson.phone_number,
            "Confirmation message (bypassed opt-out)",
            organization=dawson.organization,
            bypass_opt_out=True,
        )
        print(f"✅ SMS with bypass sent successfully: {result.sid}")
    except Exception as e:
        print(f"❌ Failed to send bypassed SMS: {str(e)}")
    print()

    # Test 4: Check MessageLog entries
    print("🧪 Test 4: Check MessageLog entries")
    from communicator.models import MessageLog

    recent_logs = MessageLog.objects.filter(message_type="sms").order_by("-created_at")[
        :5
    ]

    print("Recent SMS MessageLog entries:")
    for log in recent_logs:
        print(
            f"  - {log.created_at}: {log.recipient} - {log.status} - {log.body[:50]}..."
        )
    print()

    # Test 5: Check opt-out statistics
    print("🧪 Test 5: SMS Opt-out Statistics")
    total_users = CustomUser.objects.count()
    opted_out_users = CustomUser.objects.filter(sms_opt_out=True).count()
    opted_in_users = CustomUser.objects.filter(
        sms_consent=True, sms_opt_out=False
    ).count()
    users_with_phone = CustomUser.objects.filter(
        phone_number__isnull=False, phone_number__gt=""
    ).count()

    print(f"  - Total users: {total_users}")
    print(f"  - Users with phone numbers: {users_with_phone}")
    print(f"  - Opted out users: {opted_out_users}")
    print(f"  - Opted in users: {opted_in_users}")
    print()

    print("🎉 SMS Opt-out Testing Complete!")
    print("=" * 50)


if __name__ == "__main__":
    test_sms_optout_scenarios()
