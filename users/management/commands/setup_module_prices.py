from django.core.management.base import BaseCommand

from users.base_tier_stripe import _ensure_tier_product_and_price
from users.modules import BASE_PRICE, EXTRA_MODULE_PRICE, PLAN_BASE_PRICE


class Command(BaseCommand):
    help = (
        "One-time setup: create (or find) the Stripe prices behind module pricing: the $299 Professional base, "
        "the $599 Clinic base (two services included), and the monthly price of each extra service. "
        "Safe to re-run. Run against Stripe TEST MODE keys first, then paste the printed ids into the "
        "environment (STRIPE_BASE_PRICE_ID, STRIPE_CLINIC_BASE_PRICE_ID, STRIPE_MODULE_PRICE_ID)."
    )

    def handle(self, *args, **options):
        _, base = _ensure_tier_product_and_price("module_base", "Base subscription", BASE_PRICE)
        _, clinic = _ensure_tier_product_and_price("module_clinic_base", "Clinic base subscription", PLAN_BASE_PRICE["premium"])
        _, extra = _ensure_tier_product_and_price("module_extra", "Extra module", EXTRA_MODULE_PRICE)
        self.stdout.write(self.style.SUCCESS("\nDone. Add these to your environment:\n"))
        self.stdout.write(f"STRIPE_BASE_PRICE_ID={base.id}")
        self.stdout.write(f"STRIPE_CLINIC_BASE_PRICE_ID={clinic.id}")
        self.stdout.write(f"STRIPE_MODULE_PRICE_ID={extra.id}")
