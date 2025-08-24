#!/usr/bin/env python3
"""
Debug script to test analytics functionality
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Add the current directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")
django.setup()

from appointments.models import Appointment
from users.models import CustomUser
from appointments.analytics_views import AnalyticsReportView
from rest_framework.test import APIRequestFactory
from django.contrib.auth.models import AnonymousUser
import json


def test_analytics():
    print("🔧 Testing Analytics Functionality")
    print("=" * 50)

    # Check if we have any appointments
    appointment_count = Appointment.objects.count()
    print(f"📊 Total appointments in database: {appointment_count}")

    # Check if we have any users
    user_count = CustomUser.objects.count()
    print(f"👥 Total users in database: {user_count}")

    # Get a test user (preferably admin or doctor)
    test_user = None
    try:
        test_user = CustomUser.objects.filter(
            role__in=["doctor", "admin", "system_admin"]
        ).first()
        if test_user:
            print(f"🧪 Using test user: {test_user.email} (role: {test_user.role})")
        else:
            print("❌ No admin/doctor user found for testing")
            return
    except Exception as e:
        print(f"❌ Error getting test user: {e}")
        return

    # Create a test request using DRF's APIRequestFactory
    factory = APIRequestFactory()

    # Test each report type
    report_types = [
        "Upcoming Appointments Report",
        "Past Appointments Report",
        "Provider Schedule Report",
        "Appointment Status Report",
        "New Patient Registrations",
        "Blocked Time Slots",
        "Appointment Recurrence Report",
        "Appointment Duration Summary",
        "Appointment Volume Trends",
        "No-Show & Cancellation Rate",
        "Provider Utilization Report",
        "Patient Visit Frequency",
        "New vs. Returning Patients",
        "Appointment Lead Time Analysis",
        "Patient Demographic Breakdown",
        "Blocked vs. Booked Time Comparison",
    ]

    # Date range for testing
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=30)

    print(f"\n📅 Testing with date range: {start_date} to {end_date}")
    print("-" * 50)

    view = AnalyticsReportView()

    for report_type in report_types:
        print(f"\n🧪 Testing: {report_type}")

        try:
            # Create request with parameters
            request = factory.get(
                "/api/analytics/reports/",
                {
                    "report_type": report_type,
                    "start_date": start_date.strftime("%Y-%m-%d"),
                    "end_date": end_date.strftime("%Y-%m-%d"),
                    "provider_id": "all",
                },
            )
            request.user = test_user

            # Call the view
            response = view.get(request)

            if response.status_code == 200:
                data = response.data
                if "data" in data:
                    if isinstance(data["data"], list):
                        print(f"  ✅ Success: {len(data['data'])} records returned")
                    elif isinstance(data["data"], dict):
                        print(
                            f"  ✅ Success: Dictionary data with {len(data['data'])} keys"
                        )
                        for key, value in data["data"].items():
                            if isinstance(value, list):
                                print(f"    - {key}: {len(value)} items")
                            elif isinstance(value, dict):
                                print(f"    - {key}: {len(value)} keys")
                            else:
                                print(f"    - {key}: {value}")
                    else:
                        print(f"  ✅ Success: {type(data['data'])} data returned")
                else:
                    print(f"  ⚠️  Success but no 'data' key: {list(data.keys())}")
            else:
                print(f"  ❌ Failed: Status {response.status_code}")
                if hasattr(response, "data"):
                    print(f"     Error: {response.data}")

        except Exception as e:
            print(f"  ❌ Exception: {str(e)}")

    print("\n" + "=" * 50)
    print("🏁 Analytics testing completed!")


if __name__ == "__main__":
    test_analytics()
