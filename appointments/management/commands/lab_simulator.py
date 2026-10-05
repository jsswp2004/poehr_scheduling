"""
Try the lab interface end to end with a pretend lab.

  python manage.py lab_simulator --list
  python manage.py lab_simulator --url http://localhost:8000 --key lab_xxx --scenarios normal,critical,unknown_patient
  python manage.py lab_simulator --url https://<api-host> --key lab_xxx --scenarios all

It picks up the orders waiting for the connection, confirms them, and sends results
back for them, one scenario per order (cycling). Needs at least one signed lab order
waiting; `--seed ORG_ID` creates a clearly labelled test patient ("ZZTEST") with one
signed lab order per scenario in that organization, using its first doctor.
Use it on a test or demo clinic, never a real one.
"""

import sys
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from appointments import lab_simulator as sim


class Command(BaseCommand):
    help = "Pretend to be a lab: pull orders, confirm them, send results, and check the replies."

    def add_arguments(self, parser):
        parser.add_argument("--list", action="store_true", help="List the scenarios and stop")
        parser.add_argument("--url", help="Server address, e.g. http://localhost:8000")
        parser.add_argument("--key", help="The connection's interface key")
        parser.add_argument("--scenarios", default="normal", help="Comma-separated names, or 'all'")
        parser.add_argument("--seed", type=int, metavar="ORG_ID", help="First create test orders in this organization")
        parser.add_argument("--count", type=int, default=0, help="With --seed: how many orders (default: one per scenario)")

    def handle(self, *args, **o):
        if o["list"]:
            for name, text in sim.SCENARIOS.items():
                self.stdout.write(f"{name:16} {text}")
            return
        names = [n for n in sim.SCENARIOS if n != "bad_key"] + ["bad_key"] if o["scenarios"] == "all" else [
            s.strip() for s in o["scenarios"].split(",") if s.strip()
        ]
        bad = [n for n in names if n not in sim.SCENARIOS]
        if bad:
            raise CommandError(f"Unknown scenario(s): {', '.join(bad)}. Use --list.")
        if o["seed"]:
            made = self.seed(o["seed"], o["count"] or len([n for n in names if n != "bad_key"]))
            self.stdout.write(f"Created {made} signed test lab order(s) for patient ZZTEST in organization {o['seed']}.")
        if not (o["url"] and o["key"]):
            if o["seed"]:
                return
            raise CommandError("Give --url and --key (or --list).")

        report = sim.run(sim.HttpTransport(o["url"], o["key"]), names)
        self.stdout.write(f"Orders picked up: {report.pulled}")
        for c in report.checks:
            self.stdout.write(f"{'PASS' if c.ok else 'FAIL'}  {c.scenario:16} {c.step:32} {c.detail}")
        failed = [c for c in report.checks if not c.ok]
        self.stdout.write(f"{len(report.checks) - len(failed)} passed, {len(failed)} failed.")
        if failed:
            sys.exit(1)

    def seed(self, org_id, count):
        from django.contrib.auth import get_user_model

        from appointments import orders_workflow as ow
        from appointments.models import Appointment, Orderable
        from users.models import Organization

        User = get_user_model()
        try:
            org = Organization.objects.get(pk=org_id)
        except Organization.DoesNotExist:
            raise CommandError("No such organization.")
        doctor = User.objects.filter(organization=org, role="doctor").first()
        if doctor is None:
            raise CommandError("That organization has no doctor to place the orders.")
        patient = User.objects.filter(organization=org, role="patient", username=f"zztest-sim-{org.pk}").first()
        if patient is None:
            patient = User.objects.create_user(
                username=f"zztest-sim-{org.pk}", password=None, role="patient", organization=org,
                first_name="Simulator", last_name="ZZTEST",
            )
            prof = patient.patient_profile
            prof.date_of_birth, prof.organization, prof.legal_sex = date(1970, 1, 1), org, "F"
            prof.save()
        orderable, _ = Orderable.objects.get_or_create(
            code="zztest-sim-bmp",
            defaults={"name": "Basic metabolic panel (simulator)", "category": "laboratory", "code_system": "loinc", "external_code": "24320-4"},
        )
        for _i in range(count):
            appt = Appointment.objects.create(
                organization=org, patient=patient, provider=doctor, title="Simulator visit",
                appointment_datetime=timezone.now() + timedelta(days=1),
            )
            order = ow.create_draft_order(doctor, appt, orderable)
            ow.sign_order(order, doctor)
        return count
