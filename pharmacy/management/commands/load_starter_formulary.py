"""
Load the POWER starter shared formulary (common PNF essential medicines; STARTER, PHARMACIST REVIEW REQUIRED).
Migration pharmacy/0008 already does this on deploy; run this to load it again after items were deleted.
It is idempotent and never overwrites an existing item or a clinic's override.

    python manage.py load_starter_formulary
"""

import importlib

from django.apps import apps
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Load the POWER starter shared formulary (missing items only; never overwrites)."

    def handle(self, *args, **options):
        starter = importlib.import_module("pharmacy.migrations.0008_starter_formulary")
        created = starter.load_starter(apps)
        self.stdout.write(f"Created {created} starter items ({starter.NOTE}); {len(starter.STARTER) - created} already present.")
