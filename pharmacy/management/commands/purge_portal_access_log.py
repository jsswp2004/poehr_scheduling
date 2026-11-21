"""
Remove POWER Pharmacy Portal access-log entries older than the retention period (5 years by default, setting
PHARMACY_PORTAL_LOG_RETENTION_DAYS). It runs on its own on the 1st of every month (the daily scheduled-jobs
endpoint, and pharmacy.cron.PurgePortalAccessLogCronJob where django_cron runs); by hand:

    python manage.py purge_portal_access_log            # delete
    python manage.py purge_portal_access_log --dry-run  # only count
"""

from django.core.management.base import BaseCommand

from pharmacy.portal import access_log_retention_days, purge_access_log


class Command(BaseCommand):
    help = "Delete POWER Pharmacy Portal access-log entries older than the retention period (default 5 years)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only count what would be deleted.")

    def handle(self, *args, **options):
        days = access_log_retention_days()
        count = purge_access_log(dry_run=options["dry_run"])
        if options["dry_run"]:
            self.stdout.write(f"{count} portal access-log entries are older than {days} days (not deleted).")
            return
        self.stdout.write(f"Deleted {count} portal access-log entries older than {days} days.")
