"""
Lab interface usage per clinic, for billing the add-on.

  python manage.py lab_usage                      # this month, every clinic with the add-on or any activity
  python manage.py lab_usage --month 2026-09
  python manage.py lab_usage --month 2026-09 --org 3 --csv > lab_usage_2026-09.csv
"""

from django.core.management.base import BaseCommand, CommandError

from appointments import lab_usage
from users.models import Organization


class Command(BaseCommand):
    help = "Show or export monthly lab interface usage per clinic."

    def add_arguments(self, parser):
        parser.add_argument("--month", help="YYYY-MM (default: this month)")
        parser.add_argument("--org", type=int, help="Only this organization id")
        parser.add_argument("--csv", action="store_true", help="Print CSV instead of a table")

    def handle(self, *args, **o):
        org = None
        if o["org"]:
            try:
                org = Organization.objects.get(pk=o["org"])
            except Organization.DoesNotExist:
                raise CommandError("No such organization.")
        try:
            rows = lab_usage.usage(o["month"], org)
        except ValueError as exc:
            raise CommandError(str(exc))
        if o["csv"]:
            self.stdout.write(lab_usage.to_csv(rows), ending="")
            return
        if not rows:
            self.stdout.write("No clinic has the add-on or any lab interface activity in that month.")
            return
        for r in rows:
            self.stdout.write(
                f"{r['organization']} (id {r['organization_id']}), {r['month']}, add-on {'on' if r['addon_enabled'] else 'OFF'}\n"
                f"  orders: {r['orders_sent']} sent, {r['orders_accepted']} accepted, {r['orders_rejected']} rejected, "
                f"{r['cancellations_sent']} cancellations\n"
                f"  results: {r['results_messages']} messages, {r['results_filed']} reports filed, {r['results_held']} held for staff\n"
                f"  base product: {r['scans_uploaded']} scans, {r['results_entered_manually']} manual entries"
            )
