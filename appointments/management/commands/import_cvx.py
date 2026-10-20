"""
Load the CDC CVX vaccine code set into the Vaccine Manager's vaccine catalog.

    python manage.py import_cvx path/to/CVX.txt [--dry-run]

Safe to run again: codes are matched by CVX code, so a newer CDC file updates names, status and notes in place and
adds new codes. Nothing is deleted (codes the CDC retires become Inactive in the file).
"""

from django.core.management.base import BaseCommand, CommandError

from appointments.immunization_cvx import CvxFormatError, load_cvx, parse_cvx


class Command(BaseCommand):
    help = "Import the CDC CVX code set (CVX.txt) into the vaccine catalog."

    def add_arguments(self, parser):
        parser.add_argument("path", help="Path to the CDC CVX.txt flat file")
        parser.add_argument("--dry-run", action="store_true", help="Read and check the file, change nothing")

    def handle(self, *args, **options):
        try:
            with open(options["path"], encoding="utf-8-sig", newline="") as handle:
                text = handle.read()
        except OSError as exc:
            raise CommandError(f"Cannot read {options['path']}: {exc}")
        try:
            rows = parse_cvx(text)
        except CvxFormatError as exc:
            raise CommandError(f"CVX file not loaded. {exc}")
        if options["dry_run"]:
            self.stdout.write(f"{len(rows)} CVX codes read; nothing changed (dry run).")
            return
        counts = load_cvx(rows)
        self.stdout.write(
            f"{len(rows)} CVX codes read: {counts['created']} added, {counts['updated']} updated, "
            f"{counts['unchanged']} unchanged."
        )
