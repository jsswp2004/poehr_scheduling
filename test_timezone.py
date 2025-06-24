import os
import django
import sys
from datetime import datetime

# Setup Django
sys.path.append('/c/Users/jsswp/POWER/poehr_scheduling')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import Appointment
from django.contrib.auth import get_user_model

User = get_user_model()

print("=== TIMEZONE CONFIGURATION TEST ===")
from django.conf import settings
print(f"TIME_ZONE: {settings.TIME_ZONE}")
print(f"USE_TZ: {settings.USE_TZ}")

# Test creating an appointment with naive datetime (like frontend sends)
test_datetime_str = "2025-06-24T14:30"  # This is what frontend sends
test_datetime = datetime.strptime(test_datetime_str, "%Y-%m-%dT%H:%M")

print(f"\nTest datetime string from frontend: {test_datetime_str}")
print(f"Parsed datetime object: {test_datetime}")
print(f"Datetime timezone info: {test_datetime.tzinfo}")
print(f"Is datetime naive: {test_datetime.tzinfo is None}")

# Check if there are any appointments to see how they're stored
appointments = Appointment.objects.all()[:3]
print(f"\nExisting appointments in database: {len(appointments)}")
for appt in appointments:
    print(f"  - {appt.appointment_datetime} (type: {type(appt.appointment_datetime)})")
    if hasattr(appt.appointment_datetime, 'tzinfo'):
        print(f"    tzinfo: {appt.appointment_datetime.tzinfo}")
