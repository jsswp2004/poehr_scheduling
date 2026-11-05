from django.core.management.base import BaseCommand

from users.models import Organization
from users.module_billing import sync_module_billing
from users.modules import enabled_codes, priced_modules


class Command(BaseCommand):
    help = (
        "Bring each organization's Stripe subscription in line with its services, from the next bill. "
        "Lists what it would do and changes nothing unless you pass --apply. Run it after the Clinical Notes "
        "merge, because organizations that had Orders, Prescriptions or Triage on now have one service fewer."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Actually update Stripe.")
        parser.add_argument("--organization", type=int, help="Only this organization id.")

    def handle(self, *args, **options):
        qs = Organization.objects.exclude(stripe_subscription_id="").exclude(stripe_subscription_id__isnull=True)
        if options["organization"]:
            qs = qs.filter(id=options["organization"])
        for org in qs.order_by("id"):
            n = len(priced_modules(enabled_codes(org)))
            line = f"{org.id}\t{org.name}\tplan={org.subscription_tier}\tpriced services={n}"
            if options["apply"]:
                ok, note = sync_module_billing(org)
                self.stdout.write(f"{line}\t{'updated' if ok else 'NOT updated'}: {note}")
            else:
                self.stdout.write(line)
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Dry run. Nothing was changed. Add --apply to update Stripe."))
