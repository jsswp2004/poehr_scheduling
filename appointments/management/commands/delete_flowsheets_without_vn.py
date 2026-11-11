"""
Delete the flowsheets whose visit has no VN visit number, keeping the growth-chart readings.

    python manage.py delete_flowsheets_without_vn            # dry run: only says what it would delete
    python manage.py delete_flowsheets_without_vn --apply    # deletes them

A flowsheet is on a visit "with a VN" when that visit's registration has a visit number starting with VN.
Only the flowsheets are deleted, never the visits. The growth charts read height, weight and head circumference
from the well-visit flowsheets ("2-month well visit", ...), so the newest flowsheet of each well visit, per
patient, is kept even without a VN. Safe to run more than once.
"""
import re

from django.core.management.base import BaseCommand
from django.db import transaction

from appointments.models import VitalSignsFlowsheet
from users.models import Registration

WELL_VISIT = re.compile(r"^\d+-month well visit$", re.IGNORECASE)


class Command(BaseCommand):
    help = "Delete flowsheets on visits that have no VN number (keeps growth-chart well-visit flowsheets). Dry run unless --apply."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Actually delete them (default is a dry run).")

    def handle(self, *args, **options):
        with_vn = set(
            Registration.objects.filter(visit_number__startswith="VN", appointment__isnull=False)
            .values_list("appointment_id", flat=True)
        )
        sheets = list(VitalSignsFlowsheet.objects.select_related("appointment").order_by("-pk"))
        no_vn = [s for s in sheets if s.appointment_id not in with_vn]
        keep, seen = set(), set()
        for s in no_vn:  # newest first
            title = (s.appointment.title or "").strip()
            key = (s.patient_id, title.lower())
            if WELL_VISIT.match(title) and key not in seen:
                seen.add(key)
                keep.add(s.pk)
        doomed = [s for s in no_vn if s.pk not in keep]
        self.stdout.write(
            f"{len(sheets)} flowsheets in all: {len(sheets) - len(no_vn)} on visits with a VN, {len(no_vn)} without. "
            f"{len(doomed)} would be deleted; {len(keep)} growth-chart well-visit flowsheets are kept."
        )
        if not options["apply"]:
            self.stdout.write("Dry run: nothing deleted. Run again with --apply to delete them.")
            return
        with transaction.atomic():
            VitalSignsFlowsheet.objects.filter(pk__in=[s.pk for s in doomed]).delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {len(doomed)} flowsheets."))
