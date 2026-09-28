from django.core.management.base import BaseCommand

from users.messaging_stripe import create_messaging_meters_and_prices


class Command(BaseCommand):
    help = (
        "One-time setup: create the Stripe Billing Meters and metered Prices "
        "for email/SMS overage billing. Safe to re-run -- it reuses existing "
        "meters/prices instead of duplicating them. Run this against Stripe "
        "TEST MODE keys first."
    )

    def handle(self, *args, **options):
        self.stdout.write("Creating/finding Stripe Meters and Prices for messaging overage...")
        result = create_messaging_meters_and_prices()

        self.stdout.write(self.style.SUCCESS("\nDone. Add these to your environment:\n"))
        self.stdout.write(f"STRIPE_EMAIL_OVERAGE_PRICE_ID={result['email_price_id']}")
        self.stdout.write(f"STRIPE_SMS_OVERAGE_PRICE_ID={result['sms_price_id']}")
        self.stdout.write(
            "\n(Meter IDs, for reference -- not needed as env vars: "
            f"email={result['email_meter_id']}, sms={result['sms_meter_id']})"
        )
        self.stdout.write(
            self.style.WARNING(
                "\nNothing is billed yet. Next: run attach_messaging_billing to "
                "add these prices to an organization's subscription, then "
                "report_messaging_usage to actually report usage."
            )
        )
