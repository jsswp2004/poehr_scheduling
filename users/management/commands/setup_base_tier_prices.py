from django.core.management.base import BaseCommand

from users.base_tier_stripe import create_base_tier_prices


class Command(BaseCommand):
    help = (
        "One-time setup: create real Stripe Products/Prices for the Basic "
        "(Professional) and Premium (Clinic) subscription tiers. Without "
        "this, settings.py falls back to placeholder price IDs "
        "('price_test_basic', 'price_test_premium') and no one can actually "
        "complete a Stripe checkout. Safe to re-run -- reuses existing "
        "product/price instead of duplicating them. Run against Stripe TEST "
        "MODE keys first. Enterprise is skipped (contact-sales, no fixed "
        "price)."
    )

    def handle(self, *args, **options):
        self.stdout.write("Creating/finding Stripe Products and Prices for base tiers...")
        result = create_base_tier_prices()

        self.stdout.write(self.style.SUCCESS("\nDone. Add these to your environment:\n"))
        self.stdout.write(f"STRIPE_BASIC_PRICE_ID={result['basic']['price_id']}")
        self.stdout.write(f"STRIPE_PREMIUM_PRICE_ID={result['premium']['price_id']}")
        self.stdout.write(
            self.style.WARNING(
                "\nEnterprise tier skipped -- it's contact-sales with no fixed "
                "price. Set STRIPE_ENTERPRISE_PRICE_ID manually if/when you "
                "create a specific quote price for a customer."
            )
        )
