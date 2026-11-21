"""
Remove POWER Pharmacy Portal access-log entries older than the retention period (5 years by default, setting
PHARMACY_PORTAL_LOG_RETENTION_DAYS). Run it from a scheduled job, e.g. monthly:

    python manage.py purge_portal_access_log            # delete
    python manage.py purge_portal_access_log --dry-run  # only count
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from pharmacy.models import PortalAccessLog
from pharmacy.portal import access_log_retention_days


class Command(BaseCommand):
    help = "Delete POWER Pharmacy Portal access-log entries older than the retention period (default 5 years)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only count what would be deleted.")

    def handle(self, *args, **options):
        days = access_log_retention_days()
        cutoff = timezone.now() - timedelta(days=days)
        old = PortalAccessLog.objects.filter(created_at__lt=cutoff)
        count = old.count()
        if options["dry_run"]:
            self.stdout.write(f"{count} portal access-log entries are older than {days} days (not deleted).")
            return
        old.delete()
        self.stdout.write(f"Deleted {count} portal access-log entries older than {days} days.")
