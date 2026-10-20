import json

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from appointments.immunization_schedule_loader import ScheduleFormatError, load_schedule, validate_document


class Command(BaseCommand):
    help = (
        "Load an immunization schedule JSON file (see appointments/immunization_schedules). The schedule is saved as a "
        "draft. Use --approve-as USERNAME only when that person has reviewed the rules; they are recorded as the approver."
    )

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--dry-run", action="store_true", help="check the file and the CVX codes without saving")
        parser.add_argument("--approve-as", metavar="USERNAME", default=None)

    def handle(self, *args, path, dry_run=False, approve_as=None, **options):
        try:
            with open(path, encoding="utf-8-sig") as fh:
                doc = json.load(fh)
        except (OSError, ValueError) as exc:
            raise CommandError(f"cannot read {path}: {exc}")
        approver = None
        if approve_as:
            approver = get_user_model().objects.filter(username=approve_as).first()
            if approver is None:
                raise CommandError(f"no user named {approve_as!r}")
        try:
            if dry_run:
                clean = validate_document(doc)
                self.stdout.write(f"OK (not saved): {len(clean['items'])} items, {len(clean['rules'])} rules")
                return
            result = load_schedule(doc, approve_as=approver)
        except ScheduleFormatError as exc:
            raise CommandError(str(exc))
        s = result["schedule"]
        self.stdout.write(
            f"{'Created' if result['created'] else 'Replaced'} '{s.name}' ({s.edition}) version {s.version}, status {s.status}: "
            f"{result['items']} items, {result['rules']} rules, {result['triggers']} triggers"
        )
