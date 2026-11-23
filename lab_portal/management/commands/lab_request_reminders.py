"""Remind patients who have not gone to the lab and expire requests not collected in 30 days (runs daily)."""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Send lab request reminders (day 3 and 7) and expire requests not collected in 30 days."

    def handle(self, *args, **options):
        from lab_portal.services import remind_and_expire

        self.stdout.write(str(remind_and_expire()))
