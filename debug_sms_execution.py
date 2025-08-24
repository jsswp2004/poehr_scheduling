#!/usr/bin/env python
import os
import sys
import django

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling.settings")
django.setup()

from django.utils import timezone
from datetime import timedelta
from appointments.models import Appointment, AutoEmail
from communicator.utils import format_phone_to_international


def debug_sms_execution():
    print("=== SMS Debug Information ===")

    today = timezone.now().date()
    next_week = today + timedelta(days=7)

    print(f"Today: {today}")
    print(f"Next week: {next_week}")
    print(f"Current weekday: {timezone.now().weekday()}")  # 0=Monday, 6=Sunday

    # Check active configs
    active_configs = AutoEmail.objects.filter(is_active=True)
    print(f"\nActive AutoEmail configs: {active_configs.count()}")

    for config in active_configs:
        print(f"\nConfig {config.id}:")
        print(
            f"  Organization: {config.organization.name if config.organization else 'None'}"
        )
        print(f"  Frequency: {config.auto_message_frequency}")
        print(f"  Day of week: {config.auto_message_day_of_week}")
        print(f"  Start date: {config.auto_message_start_date}")

        # Get appointments for this config
        if config.organization:
            appointments = Appointment.objects.filter(
                appointment_datetime__date__gte=today,
                appointment_datetime__date__lte=next_week,
                organization=config.organization,
            ).select_related("patient")
        else:
            appointments = Appointment.objects.filter(
                appointment_datetime__date__gte=today,
                appointment_datetime__date__lte=next_week,
            ).select_related("patient")

        print(f"  Appointments found: {appointments.count()}")

        for appt in appointments:
            patient = appt.patient
            if patient:
                print(f"    Appointment ID: {appt.id}")
                print(f"    Patient: {patient.first_name} {patient.last_name}")
                print(f"    Phone: {patient.phone_number}")
                if patient.phone_number:
                    formatted_phone = format_phone_to_international(
                        patient.phone_number
                    )
                    print(f"    Formatted phone: {formatted_phone}")
                print(f"    Email: {patient.email}")
                print(f"    Appointment date: {appt.appointment_datetime}")
                print(f"    Appointment title: {appt.title}")
                print("    ---")

    # Check Twilio configuration
    from django.conf import settings

    print(f"\nTwilio Configuration:")
    print(
        f"  TWILIO_ACCOUNT_SID: {'***' + settings.TWILIO_ACCOUNT_SID[-4:] if hasattr(settings, 'TWILIO_ACCOUNT_SID') and settings.TWILIO_ACCOUNT_SID else 'Not configured'}"
    )
    print(
        f"  TWILIO_AUTH_TOKEN: {'***configured***' if hasattr(settings, 'TWILIO_AUTH_TOKEN') and settings.TWILIO_AUTH_TOKEN else 'Not configured'}"
    )
    print(
        f"  TWILIO_PHONE_NUMBER: {getattr(settings, 'TWILIO_PHONE_NUMBER', 'Not configured')}"
    )


if __name__ == "__main__":
    debug_sms_execution()
