"""
Remove the duplicate demo visits that earlier deploys piled up on the demo patients.

    python manage.py dedupe_demo_visits            # dry run: only says what it would remove
    python manage.py dedupe_demo_visits --apply    # removes them

Only the demo clinic's demo patients are looked at, and only visits the two demo seeds create:
  * seed_physician_demo visits (the well visits, the diabetes follow-ups, ...): the newest copy of each
    patient + title is kept, older copies go;
  * seed_demo_data visits (Annual Physical, Follow-up Visit, ...): one visit per time slot is kept, the oldest.
A visit is never removed if it carries a note or an order, or is the chart record of a registered visit; its
flowsheets (demo vital signs) go with it. Safe to run more than once.
"""
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import ProtectedError

from appointments.management.commands.seed_demo_data import APPT_TITLES, DEMO_ORG_NAME, PATIENT_NAMES
from appointments.models import Appointment, ClinicalNote
from users.models import CustomUser, Organization, Registration

PHYSICIAN_DEMO_TITLES = (
    "2-month well visit", "4-month well visit", "6-month well visit", "9-month well visit",
    "Diabetes follow-up", "Diabetes follow-up (kidney check, labs)",
)


class Command(BaseCommand):
    help = "Remove duplicate demo visits (and their demo flowsheets) left by earlier deploys. Dry run unless --apply."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Actually remove them (default is a dry run).")

    def _in_use(self, appt):
        if ClinicalNote.objects.filter(appointment=appt).exists():
            return True
        return Registration.objects.filter(appointment=appt).exists()

    def handle(self, *args, **options):
        org = Organization.objects.filter(name=DEMO_ORG_NAME).first()
        if org is None:
            self.stdout.write("No demo clinic found; nothing to do.")
            return
        usernames = [f"patient_{f.lower()}_{l.lower()}".replace("'", "") for f, l in PATIENT_NAMES]
        patients = list(CustomUser.objects.filter(organization=org, username__in=usernames))
        base = Appointment.all_objects.filter(organization=org, patient__in=patients)

        doomed = []
        groups = defaultdict(list)
        for a in base.filter(title__in=PHYSICIAN_DEMO_TITLES).order_by("-pk"):
            groups[(a.patient_id, a.provider_id, a.title)].append(a)
        for rows in groups.values():
            doomed.extend(rows[1:])  # newest kept
        slots = defaultdict(list)
        for a in base.filter(title__in=APPT_TITLES).order_by("pk"):
            slots[a.appointment_datetime].append(a)
        for rows in slots.values():
            doomed.extend(rows[1:])  # oldest kept

        removable = [a for a in doomed if not self._in_use(a)]
        self.stdout.write(
            f"{len(doomed)} duplicate demo visits found; {len(removable)} can be removed "
            f"({len(doomed) - len(removable)} kept because they carry notes or a registration)."
        )
        if not options["apply"]:
            self.stdout.write("Dry run: nothing removed. Run again with --apply to remove them.")
            return
        removed = 0
        for a in removable:
            try:
                with transaction.atomic():
                    a.delete()
                removed += 1
            except ProtectedError:
                self.stdout.write(f"Kept visit {a.pk}: something still refers to it.")
        self.stdout.write(self.style.SUCCESS(f"Removed {removed} duplicate demo visits."))
