import os
import django
import sys

# Setup Django
sys.path.append('/c/Users/jsswp/POWER/poehr_scheduling')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from users.models import Patient

User = get_user_model()

print("=== PASSWORD RESET ENDPOINT TEST ===")

# Check if there are patients in the database
patients = User.objects.filter(role='patient')[:5]
print(f"\nFound {len(patients)} patients in database:")

for patient in patients:
    print(f"  - {patient.first_name} {patient.last_name} (ID: {patient.id}, Email: {patient.email})")

# Check if there are admin users who can reset passwords
admins = User.objects.filter(role__in=['admin', 'system_admin', 'doctor', 'registrar'])[:3]
print(f"\nUsers who can reset passwords: {len(admins)}")

for admin in admins:
    print(f"  - {admin.first_name} {admin.last_name} (Role: {admin.role})")

if patients and admins:
    print(f"\n✅ Ready to test! You can use:")
    print(f"   - Admin user: {admins[0].username} (Role: {admins[0].role})")
    print(f"   - Patient: {patients[0].first_name} {patients[0].last_name} (ID: {patients[0].id})")
    print(f"   - Patient Email: {patients[0].email}")
else:
    print("\n❌ Need both patients and admin users to test the functionality")
