#!/usr/bin/env python

import sys
import os
import django
from datetime import datetime, timedelta

print("Python version:", sys.version)
print("Current directory:", os.getcwd())
print("Current time:", datetime.now())
print("Django version:", django.get_version())

# Test imports from app
try:
    import appointments
    from appointments.models import AutoEmail
    print("Successfully imported AutoEmail model")
except Exception as e:
    print(f"Error importing AutoEmail: {e}")
