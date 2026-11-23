from django.core.management.base import BaseCommand

from communicator.patient_sync import sync_all_patients


class Command(BaseCommand):
    help = "Add/refresh Communicator contacts for registered patients who agreed to texts, and remove stale ones."

    def handle(self, *args, **options):
        synced, removed = sync_all_patients()
        self.stdout.write(self.style.SUCCESS(f"Patient contacts synced: {synced}; removed: {removed}"))
