"""
Seed the database with fake showcase data: no real patients, no real
clinical information. Safe to run on the public Render demo deployment.

Usage:
    python manage.py seed_demo_data
    python manage.py seed_demo_data --reset   # wipe demo org first
"""
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from users.models import CustomUser, Organization, Patient
from appointments.models import Appointment

DEMO_ORG_NAME = "Riverside Family Clinic (Demo)"

DOCTOR_NAMES = [
    ("Amara", "Chen"),
    ("Marcus", "Reyes"),
]

PATIENT_NAMES = [
    ("Taylor", "Whitfield"),
    ("Jordan", "Nakamura"),
    ("Priya", "Kapoor"),
    ("Liam", "O'Sullivan"),
    ("Sofia", "Marchetti"),
    ("Devon", "Baptiste"),
]

APPT_TITLES = [
    "Annual Physical",
    "Follow-up Visit",
    "New Patient Consultation",
    "Blood Pressure Check",
    "Vaccination",
    "Lab Results Review",
]


class Command(BaseCommand):
    help = "Seed fake demo data (org, doctors, patients, appointments) for the showcase deployment."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete the demo organization and its users/appointments first.",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            existing = Organization.objects.filter(name=DEMO_ORG_NAME).first()
            if existing:
                count = CustomUser.objects.filter(organization=existing).count()
                CustomUser.objects.filter(organization=existing).delete()
                existing.delete()
                self.stdout.write(
                    self.style.WARNING(f"Removed demo org and {count} demo users.")
                )

        org, created = Organization.objects.get_or_create(
            name=DEMO_ORG_NAME,
            defaults={
                "subscription_status": "active",
                "subscription_tier": "premium",
                "organization_type": "clinic",
                "max_users": 25,
            },
        )
        self.stdout.write(
            self.style.SUCCESS(f"{'Created' if created else 'Using existing'} org: {org.name}")
        )

        # --- Demo admin/receptionist login for the showcase ---------------
        admin_user, created = CustomUser.objects.get_or_create(
            username="demo_admin",
            defaults={
                "email": "demo_admin@example.com",
                "first_name": "Demo",
                "last_name": "Admin",
                "role": "admin",
                "organization": org,
                "registered": True,
                "is_staff": True,
            },
        )
        if created:
            admin_user.set_password("DemoPass123!")
            admin_user.save()
        self.stdout.write(self.style.SUCCESS("Demo admin login -> demo_admin / DemoPass123!"))

        # --- Doctors --------------------------------------------------------
        doctors = []
        for i, (first, last) in enumerate(DOCTOR_NAMES, start=1):
            username = f"dr_{first.lower()}_{last.lower()}"
            doc, created = CustomUser.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@example.com",
                    "first_name": first,
                    "last_name": last,
                    "role": "doctor",
                    "organization": org,
                    "registered": True,
                },
            )
            if created:
                doc.set_password("DemoPass123!")
                doc.save()
            doctors.append(doc)
        self.stdout.write(self.style.SUCCESS(f"Doctors ready: {len(doctors)}"))

        # --- Patients ---------------------------------------------------
        patients = []
        for i, (first, last) in enumerate(PATIENT_NAMES, start=1):
            username = f"patient_{first.lower()}_{last.lower()}".replace("'", "")
            pat_user, created = CustomUser.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@example.com",
                    "first_name": first,
                    "last_name": last,
                    "role": "patient",
                    "organization": org,
                    "provider": doctors[i % len(doctors)],
                    "registered": True,
                },
            )
            if created:
                pat_user.set_password("DemoPass123!")
                pat_user.save()
            Patient.objects.get_or_create(
                user=pat_user,
                defaults={
                    "date_of_birth": timezone.now().date()
                    - timedelta(days=365 * random.randint(20, 70)),
                    "phone_number": f"555-01{i:02d}",
                    "address": f"{100 + i} Demo Street, Faketown, ST 00000",
                    "organization": org,
                },
            )
            patients.append(pat_user)
        self.stdout.write(self.style.SUCCESS(f"Patients ready: {len(patients)}"))

        # --- Appointments: a mix of past and upcoming --------------------
        created_count = 0
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        for day_offset in range(-7, 14):
            day = now + timedelta(days=day_offset)
            if day.weekday() >= 5:  # skip weekends
                continue
            for slot_hour in (9, 11, 14):
                patient = random.choice(patients)
                doctor = random.choice(doctors)
                when = day.replace(hour=slot_hour)
                status = "completed" if day_offset < 0 else "scheduled"
                _, created = Appointment.objects.get_or_create(
                    organization=org,
                    patient=patient,
                    provider=doctor,
                    appointment_datetime=when,
                    defaults={
                        "title": random.choice(APPT_TITLES),
                        "status": status,
                        "duration_minutes": 30,
                    },
                )
                if created:
                    created_count += 1
        self.stdout.write(self.style.SUCCESS(f"Appointments created: {created_count}"))

        self.stdout.write(self.style.SUCCESS("\nDemo data ready."))
        self.stdout.write("Login as admin:   demo_admin / DemoPass123!")
        self.stdout.write("Login as a doctor: dr_amara_chen / DemoPass123!")
        self.stdout.write("Login as a patient: patient_taylor_whitfield / DemoPass123!")
