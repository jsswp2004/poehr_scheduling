from django.core.management.base import BaseCommand

from appointments import inbox


class Command(BaseCommand):
    help = "Send co-signature reminders and overdue notices to staff Inboxes (safe to run often; each is sent once)."

    def handle(self, *args, **options):
        self.stdout.write(f"{inbox.send_due_reminders()} notice(s) sent.")
